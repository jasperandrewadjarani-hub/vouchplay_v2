/**
 * Community Skill Level + Skill-Trust Score (STS_V1) - handover §10.6–§10.8, §3.3.
 *
 * These are PURE, DETERMINISTIC functions (the Phase-3 gate). They take the active, non-invalidated
 * vouches for one target plus the Admin-configurable constants, and return a full calculation
 * snapshot. Recomputed on WRITE (never on read), stored in player_skill_profiles with the algorithm
 * version for auditability (§10.10).
 *
 * Separation of concepts (LOCKED, §3.3, §72):
 *  - Community Skill Level (CSL) = weighted MEDIAN of vouch skill ordinals - a SKILL measure.
 *  - STS (0–5) = CONFIDENCE in that assessment, NOT skill. Never used to rank players.
 *  - Skill Verified is derived from STS + unique-voucher count; it does NOT feed back into weight.
 */

export const STS_ALGORITHM_VERSION = 'STS_V1';

/** One active vouch's contribution to the calculation. */
export interface VouchInput {
  /** Canonical skill-band ordinal 0..6 (LOCKED order, §3.1). */
  skillOrdinal: number;
  /** Effective weight already resolved from the weight model (§10.5). Must be > 0. */
  effectiveWeight: number;
  /** Voucher id - used to count UNIQUE active vouchers (§10.7A). */
  voucherId: string;
}

export interface StsConstants {
  /** count_component = min(uniqueVouchers / countDivisor, 1). Default 5. */
  countDivisor: number;
  /** weight_component = min(sumWeights / weightDivisor, 1). Default 7.5. */
  weightDivisor: number;
  /** agreement_component = max(0, 1 - min(dispersion / dispersionDivisor, 1)). Default 2.0. */
  dispersionDivisor: number;
  /** Blend coefficients. Default 0.50 / 0.25 / 0.25. */
  countCoefficient: number;
  weightCoefficient: number;
  agreementCoefficient: number;
  /** Output scale. Default 5 → STS is 0.0–5.0. */
  scale: number;
}

export interface SkillVerifiedThresholds {
  /** Minimum STS for community Skill Verified. Default 3.0. */
  minSts: number;
  /** Minimum unique active vouchers for community Skill Verified. Default 2. */
  minUniqueVouchers: number;
}

export interface SkillProfileComputation {
  /** Weighted-median skill ordinal, or null when there are no active vouches. */
  communitySkillLevel: number | null;
  /** Weighted mean - internal diagnostics only (§10.6.5), never shown as the skill. */
  weightedMean: number | null;
  /** STS 0.0–scale, rounded to 1 decimal. */
  sts: number;
  uniqueVoucherCount: number;
  effectiveWeightSum: number;
  countComponent: number;
  weightComponent: number;
  agreementComponent: number;
  /** True when STS + unique-voucher thresholds are met (community verification, §10.8). */
  skillVerifiedByCommunity: boolean;
  /** Visible counts by skill-band ordinal (§10.6.6). Keys 0..6 always present. */
  distribution: Record<number, number>;
  algorithmVersion: string;
}

function roundTo1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

/**
 * Weighted median of skill ordinals. Sorted ascending by ordinal; returns the smallest ordinal at
 * which cumulative weight reaches half of the total weight (the conventional lower weighted median).
 * Returns an integer band ordinal (CSL is always a band). Assumes `vouches` is non-empty.
 */
export function weightedMedian(vouches: VouchInput[]): number {
  const sorted = [...vouches].sort((a, b) => a.skillOrdinal - b.skillOrdinal);
  const total = sorted.reduce((s, v) => s + v.effectiveWeight, 0);
  const half = total / 2;
  let cumulative = 0;
  for (const v of sorted) {
    cumulative += v.effectiveWeight;
    if (cumulative >= half) return v.skillOrdinal;
  }
  // Unreachable for positive weights; fall back to the highest ordinal.
  const last = sorted[sorted.length - 1];
  return last ? last.skillOrdinal : 0;
}

const EMPTY_DISTRIBUTION = (): Record<number, number> => ({
  0: 0,
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
  6: 0,
});

/**
 * Full CSL + STS_V1 computation for one target's active vouches. Deterministic given the same
 * inputs. Empty input → null skill, STS 0, all components 0, empty distribution.
 */
export function computeSkillProfile(
  vouches: VouchInput[],
  constants: StsConstants,
  thresholds: SkillVerifiedThresholds,
): SkillProfileComputation {
  const distribution = EMPTY_DISTRIBUTION();
  for (const v of vouches) {
    if (v.skillOrdinal >= 0 && v.skillOrdinal <= 6) {
      distribution[v.skillOrdinal] = (distribution[v.skillOrdinal] ?? 0) + 1;
    }
  }

  if (vouches.length === 0) {
    return {
      communitySkillLevel: null,
      weightedMean: null,
      sts: 0,
      uniqueVoucherCount: 0,
      effectiveWeightSum: 0,
      countComponent: 0,
      weightComponent: 0,
      agreementComponent: 0,
      skillVerifiedByCommunity: false,
      distribution,
      algorithmVersion: STS_ALGORITHM_VERSION,
    };
  }

  const uniqueVoucherCount = new Set(vouches.map((v) => v.voucherId)).size;
  const weightSum = vouches.reduce((s, v) => s + v.effectiveWeight, 0);
  const median = weightedMedian(vouches);
  const weightedMean =
    vouches.reduce((s, v) => s + v.skillOrdinal * v.effectiveWeight, 0) / weightSum;

  // Agreement: weighted mean absolute distance from the weighted median (§10.7C).
  const dispersion =
    vouches.reduce((s, v) => s + v.effectiveWeight * Math.abs(v.skillOrdinal - median), 0) /
    weightSum;

  const countComponent = Math.min(uniqueVoucherCount / constants.countDivisor, 1);
  const weightComponent = Math.min(weightSum / constants.weightDivisor, 1);
  const agreementComponent = Math.max(0, 1 - Math.min(dispersion / constants.dispersionDivisor, 1));

  const blended =
    constants.countCoefficient * countComponent +
    constants.weightCoefficient * weightComponent +
    constants.agreementCoefficient * agreementComponent;
  const sts = Math.min(constants.scale, Math.max(0, roundTo1(constants.scale * blended)));

  const skillVerifiedByCommunity =
    sts >= thresholds.minSts && uniqueVoucherCount >= thresholds.minUniqueVouchers;

  return {
    communitySkillLevel: median,
    weightedMean,
    sts,
    uniqueVoucherCount,
    effectiveWeightSum: weightSum,
    countComponent,
    weightComponent,
    agreementComponent,
    skillVerifiedByCommunity,
    distribution,
    algorithmVersion: STS_ALGORITHM_VERSION,
  };
}
