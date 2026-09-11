import 'server-only';
import { revalidatePath } from 'next/cache';
import { voucherTrust, detectAnomalies, type AnomalyFlag } from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';
import {
  getSkillV2Params,
  getAnomalyParams,
  isVelocityGuardEnabled,
  isClusterGuardEnabled,
} from '@/lib/settings';
import { writeAudit } from '@/lib/moderation/audit';
import { gatherV2Facts, type V2Facts } from '@/lib/vouches/v2-facts';
import { holdReason, isHoldFlagType, type HoldFlagType } from '@/lib/vouches/hold-reasons';

/**
 * The integrity guard - the automatic, REVERSIBLE holds in STS_V2 (master_plan §2AF anomaly table,
 * §2AJ). Two detectors may quarantine vouches (`status='invalidated'`, a hold, never a ban) pending a
 * moderator's look:
 *  - VELOCITY_BURST (§2AF): a burst of vouches on one target that is mostly low-trust → hold the
 *    low-trust vouches in the burst. Kill switch `vouch_velocity_guard_enabled`.
 *  - SINGLE_PURPOSE_CLUSTER (§2AJ): most of a target's vouches come from unanchored, zero-standing
 *    accounts that have vouched almost no one else - the sock-puppet shape → hold those vouches. Kill
 *    switch `vouch_cluster_guard_enabled`.
 * Runs on every vouch write, BEFORE `recomputePlayerSkillProfile` (§2AF E3), so a held vouch never
 * counts toward CSL. The file keeps its original name because every caller imports `runVelocityGuard`.
 *
 * Never throws: the vouch itself is already saved by the time this runs, so a guard failure must not
 * break vouching (§2AF "Never punish automatically except for the one live guard" - and even that one
 * guard fails open, not closed).
 */

const BOUND = 1000;

const AUDIT_ACTION: Record<HoldFlagType, string> = {
  VELOCITY_BURST: 'integrity.velocity_hold',
  SINGLE_PURPOSE_CLUSTER: 'integrity.cluster_hold',
};

export interface VelocityGuardResult {
  /** True when one or more vouches were invalidated (held) by THIS run. */
  held: boolean;
  /** The vouch ids actually invalidated by this run (a subset of each flag's hold list that were
   *  still `status='active'` at the moment the hold was applied). */
  heldVouchIds: string[];
  /** The first `fraud_flags` row id a hold was recorded under (new or existing, deduplicated), or
   *  null when nothing was held. Kept for callers that predate multi-flag holds; see `flagIds`. */
  flagId: string | null;
  /** Every `fraud_flags` row id a hold was recorded under in this run. */
  flagIds: string[];
  /** The facts gathered (or passed in) - returned so the caller's immediately-following
   *  `recomputePlayerSkillProfile` does not re-run the same bounded queries (§2AF E3). */
  facts: V2Facts;
}

type Svc = ReturnType<typeof createServiceClient>;

function noop(facts: V2Facts): VelocityGuardResult {
  return { held: false, heldVouchIds: [], flagId: null, flagIds: [], facts };
}

/**
 * Persist ONE hold-producing flag (deduplicated per subject+type while open/reviewing, §2AF) and
 * quarantine the vouches it names that are still active RIGHT NOW (re-checked - never trust the
 * in-memory facts for a mutation). Returns the flag id and the ids actually held by this call.
 */
async function applyHold(
  svc: Svc,
  targetId: string,
  flag: AnomalyFlag & { type: HoldFlagType },
): Promise<{ flagId: string; heldNow: string[] } | null> {
  const { data: existingRow } = await svc
    .from('fraud_flags')
    .select('id, evidence')
    .eq('subject_type', 'user')
    .eq('subject_id', targetId)
    .eq('flag_type', flag.type)
    .in('status', ['open', 'reviewing'])
    .limit(1)
    .maybeSingle();
  const existing = existingRow as { id: string; evidence: Record<string, unknown> } | null;

  let flagId: string;
  if (existing) {
    const prevHeld = Array.isArray(existing.evidence?.heldVouchIds)
      ? (existing.evidence.heldVouchIds as string[])
      : [];
    const unionHeld = Array.from(new Set([...prevHeld, ...flag.holdVouchIds]));
    await svc
      .from('fraud_flags')
      .update({
        evidence: { reason: flag.reason, ...flag.evidence, heldVouchIds: unionHeld },
      })
      .eq('id', existing.id);
    flagId = existing.id;
  } else {
    const { data: created, error } = await svc
      .from('fraud_flags')
      .insert({
        subject_type: 'user',
        subject_id: targetId,
        flag_type: flag.type,
        severity: flag.severity,
        evidence: { reason: flag.reason, ...flag.evidence, heldVouchIds: flag.holdVouchIds },
      })
      .select('id')
      .single();
    if (error || !created) return null; // fail open - nothing to hold against
    flagId = (created as { id: string }).id;
  }

  const { data: candidateRows } = await svc
    .from('vouches')
    .select('id, status, skill_level, effective_weight')
    .in('id', flag.holdVouchIds)
    .limit(BOUND);
  const candidates = (candidateRows ?? []) as {
    id: string;
    status: string;
    skill_level: number;
    effective_weight: number | string;
  }[];

  const heldNow: string[] = [];
  for (const row of candidates) {
    if (row.status !== 'active') continue; // already held by another flag, withdrawn, or invalidated
    const { error: updateError } = await svc
      .from('vouches')
      .update({
        status: 'invalidated',
        invalidated_by: null,
        invalidation_reason: holdReason(flag.type, flagId),
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

  if (heldNow.length > 0) {
    await writeAudit({
      actorId: null,
      actorRole: 'system',
      action: AUDIT_ACTION[flag.type],
      entityType: 'fraud_flag',
      entityId: flagId,
      after: { targetId, heldVouchIds: heldNow },
    });
  }
  return { flagId, heldNow };
}

export async function runVelocityGuard(
  targetId: string,
  facts?: V2Facts,
): Promise<VelocityGuardResult> {
  const resolvedFacts = facts ?? (await gatherV2Facts(targetId));

  const [velocityOn, clusterOn] = await Promise.all([
    isVelocityGuardEnabled(),
    isClusterGuardEnabled(),
  ]);
  if (!velocityOn && !clusterOn) return noop(resolvedFacts);

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

    // Only the hold-producing flags whose kill switch is on; everything else stays informational and
    // is persisted by the recompute path as before.
    const holdFlags = flags.filter(
      (f): f is AnomalyFlag & { type: HoldFlagType } =>
        isHoldFlagType(f.type) &&
        f.holdVouchIds.length > 0 &&
        (f.type === 'VELOCITY_BURST' ? velocityOn : clusterOn),
    );
    if (holdFlags.length === 0) return noop(resolvedFacts);

    const svc = createServiceClient();
    const heldAll: string[] = [];
    const flagIds: string[] = [];
    for (const flag of holdFlags) {
      const applied = await applyHold(svc, targetId, flag);
      if (!applied) continue;
      flagIds.push(applied.flagId);
      heldAll.push(...applied.heldNow);
    }

    if (heldAll.length === 0) {
      return {
        held: false,
        heldVouchIds: [],
        flagId: flagIds[0] ?? null,
        flagIds,
        facts: resolvedFacts,
      };
    }

    revalidatePath('/staff/moderation');

    // Hand recompute facts that reflect the holds: the vouches just invalidated must not count toward
    // the V2 profile written in this same cycle (V1 re-reads the DB itself; V2 uses these facts).
    const heldSet = new Set(heldAll);
    const postHoldFacts: V2Facts = {
      ...resolvedFacts,
      vouches: resolvedFacts.vouches.filter((v) => !heldSet.has(v.id)),
    };
    return {
      held: true,
      heldVouchIds: heldAll,
      flagId: flagIds[0] ?? null,
      flagIds,
      facts: postHoldFacts,
    };
  } catch {
    // The vouch write already succeeded - a guard failure must never surface to the voucher.
    return noop(resolvedFacts);
  }
}
