import 'server-only';
import { revalidateTag } from 'next/cache';
import { computeSkillProfile, type VouchInput } from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';
import { getVouchSettings } from '@/lib/settings';
import { PLAYERS_LIST_TAG, playerTag, commentsTag } from '@/lib/players/queries';
import { recomputeEligibilityForPlayer } from '@/lib/eligibility/compute';

/**
 * Recompute a player's cached skill profile (handover §10.6–§10.8). Runs on WRITE (never on read):
 * called after any change to a target's active vouches. Reads ALL active vouches for the target via
 * the service client (crosses RLS - anonymity is preserved because only the public-safe aggregate is
 * written out), computes CSL/STS/distribution with the version-locked @vouchplay/core algorithm, and
 * upserts player_skill_profiles. An existing admin_override verification is preserved (§10.8 - admin
 * override does not change calculated STS, and stays verified). Invalidates the player's cache tags.
 */
export async function recomputePlayerSkillProfile(targetId: string): Promise<void> {
  const svc = createServiceClient();
  const settings = await getVouchSettings();

  const { data: vouches } = await svc
    .from('vouches')
    .select('skill_level, effective_weight, voucher_id')
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

  const { data: prof } = await svc.from('profiles').select('slug').eq('id', targetId).maybeSingle();
  const slug = (prof as { slug?: string } | null)?.slug;
  if (slug) revalidateTag(playerTag(slug));
  revalidateTag(commentsTag(targetId));
  revalidateTag(PLAYERS_LIST_TAG);

  // The player's community skill just changed - refresh any active tournament eligibility snapshots
  // that depend on it (handover §25, decision-support only, best-effort).
  await recomputeEligibilityForPlayer(targetId);
}
