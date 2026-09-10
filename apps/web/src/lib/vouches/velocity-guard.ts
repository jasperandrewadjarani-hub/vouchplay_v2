import 'server-only';
import { revalidatePath } from 'next/cache';
import { voucherTrust, detectAnomalies } from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';
import { getSkillV2Params, getAnomalyParams, isVelocityGuardEnabled } from '@/lib/settings';
import { writeAudit } from '@/lib/moderation/audit';
import { gatherV2Facts, type V2Facts } from '@/lib/vouches/v2-facts';

/**
 * The velocity guard (master_plan §2AF anomaly table, VELOCITY_BURST) - the ONE automatic, reversible
 * action in STS_V2: when a burst of vouches on one target is mostly low-trust, the low-trust vouches in
 * that burst are quarantined (`status='invalidated'`, a reversible hold, never a ban) pending a
 * moderator's look. Runs on every vouch write, BEFORE `recomputePlayerSkillProfile` (§2AF E3), so a
 * held vouch never counts toward CSL.
 *
 * Never throws: the vouch itself is already saved by the time this runs, so a guard failure must not
 * break vouching (§2AF "Never punish automatically except for the one live guard" - and even that one
 * guard fails open, not closed).
 */

const BOUND = 1000;

export interface VelocityGuardResult {
  /** True when one or more vouches were invalidated (held) by THIS run. */
  held: boolean;
  /** The vouch ids actually invalidated by this run (a subset of the burst's low-trust vouches that
   *  were still `status='active'` at the moment the hold was applied). */
  heldVouchIds: string[];
  /** The `fraud_flags` row id the hold was recorded under (new or existing, deduplicated), or null
   *  when nothing was held. */
  flagId: string | null;
  /** The facts gathered (or passed in) - returned so the caller's immediately-following
   *  `recomputePlayerSkillProfile` does not re-run the same bounded queries (§2AF E3). */
  facts: V2Facts;
}

function noop(facts: V2Facts): VelocityGuardResult {
  return { held: false, heldVouchIds: [], flagId: null, facts };
}

export async function runVelocityGuard(
  targetId: string,
  facts?: V2Facts,
): Promise<VelocityGuardResult> {
  const resolvedFacts = facts ?? (await gatherV2Facts(targetId));

  if (!(await isVelocityGuardEnabled())) return noop(resolvedFacts);

  try {
    const [v2Params, anomalyParams] = await Promise.all([getSkillV2Params(), getAnomalyParams()]);

    const trust = new Map<string, number>();
    for (const [voucherId, voucher] of resolvedFacts.vouchers) {
      trust.set(voucherId, voucherTrust(voucher, v2Params));
    }

    const flags = detectAnomalies(
      {
        now: new Date().toISOString(),
        selfRating: resolvedFacts.selfRating,
        cslV1: resolvedFacts.cslV1,
        cslV2: null, // V2 has not been computed yet this write - the guard runs BEFORE recompute (§2AF E3).
        nEff: 0,
        vouches: resolvedFacts.vouches,
        vouchers: resolvedFacts.vouchers,
        trust,
      },
      anomalyParams,
    );

    const velocityBurst = flags.find((f) => f.type === 'VELOCITY_BURST');
    if (!velocityBurst || velocityBurst.holdVouchIds.length === 0) return noop(resolvedFacts);

    const svc = createServiceClient();

    // Dedup per (subject, type) while OPEN/REVIEWING (§2AF anomaly table).
    const { data: existingRow } = await svc
      .from('fraud_flags')
      .select('id, evidence')
      .eq('subject_type', 'user')
      .eq('subject_id', targetId)
      .eq('flag_type', 'VELOCITY_BURST')
      .in('status', ['open', 'reviewing'])
      .limit(1)
      .maybeSingle();
    const existing = existingRow as { id: string; evidence: Record<string, unknown> } | null;

    let flagId: string;
    if (existing) {
      const prevHeld = Array.isArray(existing.evidence?.heldVouchIds)
        ? (existing.evidence.heldVouchIds as string[])
        : [];
      const unionHeld = Array.from(new Set([...prevHeld, ...velocityBurst.holdVouchIds]));
      await svc
        .from('fraud_flags')
        .update({
          evidence: {
            reason: velocityBurst.reason,
            ...velocityBurst.evidence,
            heldVouchIds: unionHeld,
          },
        })
        .eq('id', existing.id);
      flagId = existing.id;
    } else {
      const { data: created, error } = await svc
        .from('fraud_flags')
        .insert({
          subject_type: 'user',
          subject_id: targetId,
          flag_type: 'VELOCITY_BURST',
          severity: 'high',
          evidence: {
            reason: velocityBurst.reason,
            ...velocityBurst.evidence,
            heldVouchIds: velocityBurst.holdVouchIds,
          },
        })
        .select('id')
        .single();
      if (error || !created) return noop(resolvedFacts); // fail open - nothing to hold against
      flagId = (created as { id: string }).id;
    }

    // Hold only the vouches still active RIGHT NOW (re-checked - never trust the in-memory facts for
    // a mutation, §2AF "still status='active'").
    const { data: candidateRows } = await svc
      .from('vouches')
      .select('id, status, skill_level, effective_weight')
      .in('id', velocityBurst.holdVouchIds)
      .limit(BOUND);
    const candidates = (candidateRows ?? []) as {
      id: string;
      status: string;
      skill_level: number;
      effective_weight: number | string;
    }[];

    const heldNow: string[] = [];
    for (const row of candidates) {
      if (row.status !== 'active') continue;
      const { error: updateError } = await svc
        .from('vouches')
        .update({
          status: 'invalidated',
          invalidated_by: null,
          invalidation_reason: `velocity_hold:${flagId}`,
        })
        .eq('id', row.id);
      if (updateError) continue;
      await svc.from('vouch_revisions').insert({
        vouch_id: row.id,
        previous_skill_level: row.skill_level,
        new_skill_level: row.skill_level,
        previous_weight: row.effective_weight,
        new_weight: row.effective_weight,
        changed_by: null,
        change_type: 'invalidated',
      });
      heldNow.push(row.id);
    }

    if (heldNow.length === 0)
      return { held: false, heldVouchIds: [], flagId, facts: resolvedFacts };

    await writeAudit({
      actorId: null,
      actorRole: 'system',
      action: 'integrity.velocity_hold',
      entityType: 'fraud_flag',
      entityId: flagId,
      after: { targetId, heldVouchIds: heldNow },
    });

    revalidatePath('/staff/moderation');

    // Hand recompute facts that reflect the hold: the vouches just invalidated must not count toward
    // the V2 profile written in this same cycle (V1 re-reads the DB itself; V2 uses these facts).
    const heldSet = new Set(heldNow);
    const postHoldFacts: V2Facts = {
      ...resolvedFacts,
      vouches: resolvedFacts.vouches.filter((v) => !heldSet.has(v.id)),
    };
    return { held: true, heldVouchIds: heldNow, flagId, facts: postHoldFacts };
  } catch {
    // The vouch write already succeeded - a guard failure must never surface to the voucher.
    return noop(resolvedFacts);
  }
}
