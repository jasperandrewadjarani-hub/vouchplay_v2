/**
 * Anomaly detection (master_plan §2AF, "Anomaly detection and the one live guard"; §2AJ adds
 * SINGLE_PURPOSE_CLUSTER). Six pure checks over one target's active vouches, run on every vouch write.
 * Only VELOCITY_BURST and SINGLE_PURPOSE_CLUSTER ever produce `holdVouchIds` - the two automatic,
 * reversible actions (a quarantine, not a ban) because they are the only ways to stop an attack in
 * progress before a moderator can look. Every other flag is informational: it surfaces a pattern to a
 * human, it never itself changes anyone's score.
 *
 * `reason` is written for a non-technical moderator and NEVER names or identifies a voucher; voucher
 * identity only ever appears in `evidence.vouchIds` / `holdVouchIds` (staff-only under existing RLS).
 */

import { assignBlocs } from './independence';
import type { AnomalyFlag, AnomalyParams, V2Voucher, V2Vouch } from './types';

export interface DetectAnomaliesInput {
  /** Explicit "current time" (ISO) - anomaly detection never reads the clock itself. */
  now: string;
  selfRating: number | null;
  cslV1: number | null;
  cslV2: number | null;
  nEff: number;
  /** The target's active vouches. */
  vouches: V2Vouch[];
  vouchers: Map<string, V2Voucher>;
  /** VT per voucher id, as produced by `computeSkillV2`. */
  trust: Map<string, number>;
}

/** Plain (unweighted) band median - sort ascending, lower median at the half-crossing (V1 convention). */
function medianLevel(levels: number[]): number {
  const sorted = [...levels].sort((a, b) => a - b);
  const half = sorted.length / 2;
  let cumulative = 0;
  for (const level of sorted) {
    cumulative += 1;
    if (cumulative >= half) return level;
  }
  return sorted[sorted.length - 1] ?? 0;
}

function detectVelocityBurst(input: DetectAnomaliesInput, a: AnomalyParams): AnomalyFlag | null {
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) return null;
  const windowStartMs = nowMs - a.velocityWindowHours * 60 * 60 * 1000;

  const inWindow = input.vouches.filter((vouch) => {
    const createdMs = Date.parse(vouch.createdAt);
    return Number.isFinite(createdMs) && createdMs >= windowStartMs && createdMs <= nowMs;
  });
  if (inWindow.length < a.velocityBurstMin) return null;

  const lowTrust = inWindow.filter(
    (vouch) => (input.trust.get(vouch.voucherId) ?? 0) < a.velocityLowTrustVt,
  );
  const share = lowTrust.length / inWindow.length;
  if (share < a.velocityLowTrustShare) return null;

  return {
    type: 'VELOCITY_BURST',
    severity: 'high',
    reason: `${inWindow.length} vouches arrived within ${a.velocityWindowHours} hours and ${lowTrust.length} of them came from accounts with no standing yet.`,
    evidence: {
      windowHours: a.velocityWindowHours,
      count: inWindow.length,
      lowTrustCount: lowTrust.length,
      lowTrustShare: share,
      vouchIds: inWindow.map((vouch) => vouch.id),
    },
    holdVouchIds: lowTrust.map((vouch) => vouch.id),
  };
}

function detectLowTrustSwarm(input: DetectAnomaliesInput, a: AnomalyParams): AnomalyFlag | null {
  const swarm = input.vouches.filter((vouch) => {
    const voucher = input.vouchers.get(vouch.voucherId);
    return voucher !== undefined && !voucher.anchored && voucher.standingRaw === 0;
  });
  if (swarm.length < a.swarmMin) return null;

  return {
    type: 'LOW_TRUST_SWARM',
    severity: 'medium',
    reason: `${swarm.length} vouches came from brand-new accounts with no track record yet.`,
    evidence: { count: swarm.length, vouchIds: swarm.map((vouch) => vouch.id) },
    holdVouchIds: [],
  };
}

/**
 * SINGLE_PURPOSE_CLUSTER (master_plan §2AJ): a puppet-farm shape, not an age or velocity one. A
 * single-purpose voucher is not anchored, has zero received standing (nobody but this target has
 * vouched them, reciprocal pairs already excluded upstream in `standingRaw`), and has given at most
 * `a.clusterMaxOutgoing` vouches in total - an account that exists only to vouch this one target. If
 * enough of the target's vouches are single-purpose, and they make up enough of the total, the
 * single-purpose vouches are held for review.
 */
function detectSinglePurposeCluster(
  input: DetectAnomaliesInput,
  a: AnomalyParams,
): AnomalyFlag | null {
  const total = input.vouches.length;
  if (total === 0) return null;

  const singlePurpose = input.vouches.filter((vouch) => {
    const voucher = input.vouchers.get(vouch.voucherId);
    return (
      voucher !== undefined &&
      !voucher.anchored &&
      voucher.standingRaw === 0 &&
      voucher.outgoingCount <= a.clusterMaxOutgoing
    );
  });
  if (singlePurpose.length < a.clusterMin) return null;

  const share = singlePurpose.length / total;
  if (share < a.clusterShare) return null;

  return {
    type: 'SINGLE_PURPOSE_CLUSTER',
    severity: 'high',
    reason: `${singlePurpose.length} of ${total} vouches came from accounts that exist only to vouch for this player - no one else has vouched for them and they have vouched almost no one else.`,
    evidence: {
      count: total,
      singlePurposeCount: singlePurpose.length,
      singlePurposeShare: share,
      maxOutgoing: a.clusterMaxOutgoing,
      vouchIds: singlePurpose.map((vouch) => vouch.id),
    },
    holdVouchIds: singlePurpose.map((vouch) => vouch.id),
  };
}

function detectReciprocalRing(input: DetectAnomaliesInput, a: AnomalyParams): AnomalyFlag | null {
  const n = input.vouches.length;
  if (n < 4) return null;
  const reciprocal = input.vouches.filter((vouch) => vouch.reciprocal);
  const share = reciprocal.length / n;
  if (share < a.ringReciprocalShare) return null;

  return {
    type: 'RECIPROCAL_RING',
    severity: 'medium',
    reason: `${reciprocal.length} of ${n} vouches are mutual back-and-forth pairs between the same two accounts.`,
    evidence: {
      count: n,
      reciprocalCount: reciprocal.length,
      reciprocalShare: share,
      vouchIds: reciprocal.map((vouch) => vouch.id),
    },
    holdVouchIds: [],
  };
}

function detectClubBloc(input: DetectAnomaliesInput, a: AnomalyParams): AnomalyFlag | null {
  const n = input.vouches.length;
  if (n < 4 || input.selfRating === null) return null;

  const blocs = assignBlocs(input.vouches, input.vouchers);
  const groups = new Map<string, V2Vouch[]>();
  for (const vouch of input.vouches) {
    const clubId = blocs.get(vouch.id);
    if (!clubId) continue;
    const list = groups.get(clubId);
    if (list) {
      list.push(vouch);
    } else {
      groups.set(clubId, [vouch]);
    }
  }

  let largestClubId: string | null = null;
  let largest: V2Vouch[] = [];
  for (const [clubId, list] of groups) {
    if (
      list.length > largest.length ||
      (list.length === largest.length && largestClubId !== null && clubId < largestClubId)
    ) {
      largest = list;
      largestClubId = clubId;
    }
  }
  if (largest.length === 0) return null;

  const share = largest.length / n;
  if (share < a.blocShare) return null;

  const blocMedian = medianLevel(largest.map((vouch) => vouch.level));
  const distance = Math.abs(blocMedian - input.selfRating);
  if (distance < a.spikeBands) return null;

  return {
    type: 'CLUB_BLOC',
    severity: 'high',
    reason: `One club supplied ${largest.length} of ${n} vouches, rating this player far from their own claim.`,
    evidence: {
      count: n,
      blocSize: largest.length,
      blocShare: share,
      blocMedianLevel: blocMedian,
      selfRating: input.selfRating,
      vouchIds: largest.map((vouch) => vouch.id),
    },
    holdVouchIds: [],
  };
}

function detectSpike(input: DetectAnomaliesInput, a: AnomalyParams): AnomalyFlag | null {
  if (input.cslV1 !== null && input.cslV2 !== null) {
    const diff = Math.abs(input.cslV2 - input.cslV1);
    if (diff >= a.spikeBands) {
      return {
        type: 'SPIKE',
        severity: 'low',
        reason: `The new and previous skill estimates for this player differ by ${diff} band(s).`,
        evidence: { cslV1: input.cslV1, cslV2: input.cslV2, diff },
        holdVouchIds: [],
      };
    }
  }
  if (input.cslV2 !== null && input.selfRating !== null && input.nEff < 3) {
    const diff = Math.abs(input.cslV2 - input.selfRating);
    if (diff >= a.spikeBands) {
      return {
        type: 'SPIKE',
        severity: 'low',
        reason: `The community estimate is far from the player's own claim, and there is only a little independent evidence so far.`,
        evidence: { cslV2: input.cslV2, selfRating: input.selfRating, nEff: input.nEff, diff },
        holdVouchIds: [],
      };
    }
  }
  return null;
}

/**
 * Runs every §2AF anomaly check for one target and returns the flags that triggered. Order matches the
 * spec's table; callers deduplicate per (subject, type) while OPEN/REVIEWING at the persistence layer.
 */
export function detectAnomalies(input: DetectAnomaliesInput, a: AnomalyParams): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];
  const velocityBurst = detectVelocityBurst(input, a);
  if (velocityBurst) flags.push(velocityBurst);
  const singlePurposeCluster = detectSinglePurposeCluster(input, a);
  if (singlePurposeCluster) flags.push(singlePurposeCluster);
  const lowTrustSwarm = detectLowTrustSwarm(input, a);
  if (lowTrustSwarm) flags.push(lowTrustSwarm);
  const reciprocalRing = detectReciprocalRing(input, a);
  if (reciprocalRing) flags.push(reciprocalRing);
  const clubBloc = detectClubBloc(input, a);
  if (clubBloc) flags.push(clubBloc);
  const spike = detectSpike(input, a);
  if (spike) flags.push(spike);
  return flags;
}
