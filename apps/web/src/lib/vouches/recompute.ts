import 'server-only';
import { revalidateTag } from 'next/cache';
import {
  computeSkillProfile,
  voucherTrust,
  computeSkillV2,
  detectAnomalies,
  type VouchInput,
  type AnomalyFlagType,
} from '@vouchplay/core';
import { STS_V2_CONSTANTS } from '@vouchplay/config';
import { createServiceClient } from '@/lib/supabase/service';
import { getVouchSettings, getSkillV2Params, getAnomalyParams } from '@/lib/settings';
import { PLAYERS_LIST_TAG, playerTag, commentsTag } from '@/lib/players/queries';
import { recomputeEligibilityForPlayer } from '@/lib/eligibility/compute';
import { gatherV2Facts, type V2Facts } from '@/lib/vouches/v2-facts';

/** Non-velocity anomaly flags recompute persists directly (§2AF anomaly table). VELOCITY_BURST is the
 *  velocity guard's job (`velocity-guard.ts`, which runs BEFORE recompute and already holds/flags it) -
 *  recomputing here must never raise a second, duplicate VELOCITY_BURST flag. */
const INFORMATIONAL_FLAG_TYPES: ReadonlySet<AnomalyFlagType> = new Set([
  'LOW_TRUST_SWARM',
  'RECIPROCAL_RING',
  'CLUB_BLOC',
  'SPIKE',
]);

/**
 * Recompute a player's cached skill profile (handover §10.6–§10.8). Runs on WRITE (never on read):
 * called after any change to a target's active vouches. Reads ALL active vouches for the target via
 * the service client (crosses RLS - anonymity is preserved because only the public-safe aggregate is
 * written out), computes CSL/STS/distribution with the version-locked @vouchplay/core algorithm, and
 * upserts player_skill_profiles. An existing admin_override verification is preserved (§10.8 - admin
 * override does not change calculated STS, and stays verified). Invalidates the player's cache tags.
 *
 * Also computes STS_V2 alongside V1 (master_plan §2AF) and persists it tolerantly - see the try/catch
 * below. `opts.facts` lets a caller that already gathered `V2Facts` (e.g. the velocity guard, which
 * runs immediately before this) hand them in rather than re-running the same bounded queries.
 */
export async function recomputePlayerSkillProfile(
  targetId: string,
  opts?: { facts?: V2Facts },
): Promise<void> {
  const svc = createServiceClient();
  const settings = await getVouchSettings();

  // `used_coach_weight` is selected alongside the V1 inputs (not a second query) so the
  // `coach_vouch_count` maintenance below reuses these same rows (master_plan §2AO D2).
  const { data: vouches } = await svc
    .from('vouches')
    .select('skill_level, effective_weight, voucher_id, used_coach_weight')
    .eq('target_id', targetId)
    .eq('status', 'active');

  const inputs: VouchInput[] = (vouches ?? []).map((r) => {
    const row = r as { skill_level: number; effective_weight: number | string; voucher_id: string };
    return {
      skillOrdinal: row.skill_level,
      effectiveWeight: Number(row.effective_weight),
      voucherId: row.voucher_id,
    };
  });

  const result = computeSkillProfile(inputs, settings.stsConstants, settings.skillVerified);

  const { data: existing } = await svc
    .from('player_skill_profiles')
    .select('verification_type')
    .eq('player_id', targetId)
    .maybeSingle();
  const adminOverride =
    (existing as { verification_type?: string } | null)?.verification_type === 'admin_override';
  const verificationType = adminOverride
    ? 'admin_override'
    : result.skillVerifiedByCommunity
      ? 'community'
      : 'none';

  await svc.from('player_skill_profiles').upsert(
    {
      player_id: targetId,
      community_skill_level: result.communitySkillLevel,
      weighted_mean: result.weightedMean,
      sts: result.sts,
      unique_voucher_count: result.uniqueVoucherCount,
      effective_weight_sum: result.effectiveWeightSum,
      agreement_component: result.agreementComponent,
      count_component: result.countComponent,
      weight_component: result.weightComponent,
      distribution: result.distribution,
      skill_verified: adminOverride || result.skillVerifiedByCommunity,
      verification_type: verificationType,
      algorithm_version: result.algorithmVersion,
      calculated_at: new Date().toISOString(),
    },
    { onConflict: 'player_id' },
  );

  // --- coach_vouch_count (master_plan §2AO D2, migration 0042) -----------------------------------
  // Maintained here as a SEPARATE, tolerant update rather than a field on the upsert above, so a
  // database that has not yet run migration 0042 (column missing, Postgres 42703) can never fail the
  // V1 skill write that already committed. Reuses the `vouches` rows already loaded above - no second
  // query. Drives the "Coach-vouched" chip and cards without a per-card query.
  try {
    const coachVouchCount = (vouches ?? []).filter(
      (r) => (r as { used_coach_weight?: boolean }).used_coach_weight === true,
    ).length;
    const { error: coachCountError } = await svc
      .from('player_skill_profiles')
      .update({ coach_vouch_count: coachVouchCount })
      .eq('player_id', targetId);
    if (coachCountError && coachCountError.code !== '42703') {
      throw new Error(`coach_vouch_count_persist_failed: ${coachCountError.message}`);
    }
  } catch {
    // Best-effort only - never break the V1 skill profile write above.
  }

  // --- STS_V2 (master_plan §2AF) -----------------------------------------------------------------
  // Additive and side-by-side: computed and persisted here, but NEVER allowed to affect the V1 write
  // above (already committed) or the cache/eligibility revalidation below. Migration 0034 may not be
  // applied yet (§2R "fail open") - every V2 read/write below tolerates that, and this whole block is
  // one try/catch so nothing it does can break the V1 path.
  try {
    const facts = opts?.facts ?? (await gatherV2Facts(targetId));
    const [v2Params, anomalyParams] = await Promise.all([getSkillV2Params(), getAnomalyParams()]);

    const trust = new Map<string, number>();
    for (const [voucherId, voucher] of facts.vouchers) {
      trust.set(voucherId, voucherTrust(voucher, v2Params));
    }

    const v2 = computeSkillV2(
      { selfRating: facts.selfRating, vouches: facts.vouches, vouchers: facts.vouchers },
      v2Params,
      STS_V2_CONSTANTS,
    );

    const anomalyFlags = detectAnomalies(
      {
        now: new Date().toISOString(),
        selfRating: facts.selfRating,
        cslV1: result.communitySkillLevel,
        cslV2: v2.csl,
        nEff: v2.nEff,
        vouches: facts.vouches,
        vouchers: facts.vouchers,
        trust,
      },
      anomalyParams,
    );

    const anchoredCount = Array.from(facts.vouchers.values()).filter((v) => v.anchored).length;
    const unknownCount = facts.vouchers.size - anchoredCount;

    // Persist ONLY the six v2 columns, separately from the V1 upsert above - a tolerant update that
    // swallows Postgres 42703 (undefined_column, migration 0034 not applied) and nothing else, so a
    // genuine write failure is not silently confused with "not migrated yet".
    const { error: v2UpdateError } = await svc
      .from('player_skill_profiles')
      .update({
        community_skill_level_v2: v2.csl,
        sts_v2: v2.sts,
        n_eff_v2: v2.nEff,
        weight_sum_v2: v2.weightSum,
        components_v2: {
          count: v2.components.count,
          weight: v2.components.weight,
          agreement: v2.components.agreement,
          dispersion: v2.components.dispersion,
          trustSummary: { anchored: anchoredCount, unknown: unknownCount },
          flags: anomalyFlags.map((f) => f.type),
          // No separate `skill_verified_v2` column (0034 is additive-only) - carried here instead so
          // the read-side accessor (`active-skill.ts`) can honour it (§2AF E3/E4).
          skillVerified: v2.skillVerified,
        },
        calculated_v2_at: new Date().toISOString(),
      })
      .eq('player_id', targetId);
    if (v2UpdateError && v2UpdateError.code !== '42703') {
      throw new Error(`skill_v2_persist_failed: ${v2UpdateError.message}`);
    }

    // Persist informational flags (never VELOCITY_BURST - that is the velocity guard's job and already
    // ran before this call), deduplicated per (subject, type) while OPEN/REVIEWING (§2AF anomaly table).
    for (const flag of anomalyFlags) {
      if (!INFORMATIONAL_FLAG_TYPES.has(flag.type)) continue;
      const { data: existingFlag } = await svc
        .from('fraud_flags')
        .select('id')
        .eq('subject_type', 'user')
        .eq('subject_id', targetId)
        .eq('flag_type', flag.type)
        .in('status', ['open', 'reviewing'])
        .limit(1)
        .maybeSingle();
      if (existingFlag) continue;
      await svc.from('fraud_flags').insert({
        subject_type: 'user',
        subject_id: targetId,
        flag_type: flag.type,
        severity: flag.severity,
        evidence: { reason: flag.reason, ...flag.evidence },
      });
    }
  } catch {
    // V2 is additive and best-effort - a failure here (bad settings, an unmigrated column that isn't
    // exactly 42703, a transient read error) must never break the V1 skill profile or any page.
  }
  // --- end STS_V2 ----------------------------------------------------------------------------------

  const { data: prof } = await svc.from('profiles').select('slug').eq('id', targetId).maybeSingle();
  const slug = (prof as { slug?: string } | null)?.slug;
  if (slug) revalidateTag(playerTag(slug));
  revalidateTag(commentsTag(targetId));
  revalidateTag(PLAYERS_LIST_TAG);

  // The player's community skill just changed - refresh any active tournament eligibility snapshots
  // that depend on it (handover §25, decision-support only, best-effort).
  await recomputeEligibilityForPlayer(targetId);
}
