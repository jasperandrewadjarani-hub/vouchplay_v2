/**
 * STS_V2 aggregation (master_plan §2AF.3-6): turns per-vouch effective weight into a shrunk weighted
 * median (CSL_V2) and a confidence score (STS_V2), structurally identical to V1's blend (§10.7) so the
 * number still means "confidence" - only the ingredients (trust, independence, a Bayesian prior) change.
 *
 * WHY the prior: with credibility and independence collapsing a coordinated bloc toward ~1 voice, a
 * handful of independent-equivalents could still swing the median on a brand-new profile with almost no
 * real evidence. Anchoring the sample at the target's own self-rating (weight `priorWeight`) means a
 * genuine community consensus can still move CSL, but a small amount of (possibly manufactured)
 * evidence cannot - directly countering both the inflation majority and "one friend's vouch moved me".
 */

import { weightedMedian, type VouchInput } from '../../vouches/sts';
import { voucherTrust } from './trust';
import { independence } from './independence';
import type { V2Constants, V2Params, V2Voucher, V2Vouch } from './types';

export const SKILL_V2_ALGORITHM_VERSION = 'STS_V2';

/** Synthetic voucherId for the self-rating prior - never collides with a real account id. */
const PRIOR_VOUCHER_ID = '__prior__';

export interface ComputeSkillV2Input {
  selfRating: number | null;
  vouches: V2Vouch[];
  vouchers: Map<string, V2Voucher>;
}

export interface ComputeSkillV2Result {
  /** Weighted-median skill ordinal (0..6), or null when there is no evidence at all. */
  csl: number | null;
  /** STS_V2, 0.0-`scale`, rounded to 1 decimal. */
  sts: number;
  /** Independent-equivalent evidence count (prior excluded). */
  nEff: number;
  /** Sum of effective vouch weights (prior excluded) - equal to `nEff` per §2AF.4. */
  weightSum: number;
  components: { count: number; weight: number; agreement: number; dispersion: number };
  /** Effective weight `w_i = credentialWeight * VT * IND` per vouch id. */
  perVouchWeight: Map<string, number>;
  /** VT per voucher id (only vouchers referenced by `vouches`). */
  trust: Map<string, number>;
  /** IND per vouch id. */
  independence: Map<string, number>;
  skillVerified: boolean;
  algorithmVersion: typeof SKILL_V2_ALGORITHM_VERSION;
}

function roundTo1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

const EMPTY_COMPONENTS = { count: 0, weight: 0, agreement: 0, dispersion: 0 };

/**
 * Full CSL_V2 + STS_V2 computation for one target. Deterministic given the same inputs (no I/O, no
 * clock reads) and order-independent (all aggregation is sum/median over sets, never index-order
 * dependent).
 */
export function computeSkillV2(
  input: ComputeSkillV2Input,
  p: V2Params,
  k: V2Constants,
): ComputeSkillV2Result {
  const trust = new Map<string, number>();
  for (const vouch of input.vouches) {
    if (trust.has(vouch.voucherId)) continue;
    const voucher = input.vouchers.get(vouch.voucherId);
    trust.set(vouch.voucherId, voucher ? voucherTrust(voucher, p) : 0);
  }

  const ind = independence(input.vouches, input.vouchers, trust, p);

  const perVouchWeight = new Map<string, number>();
  for (const vouch of input.vouches) {
    const vt = trust.get(vouch.voucherId) ?? 0;
    const independenceFactor = ind.get(vouch.id) ?? 1;
    perVouchWeight.set(vouch.id, vouch.credentialWeight * vt * independenceFactor);
  }

  if (input.vouches.length === 0 && input.selfRating === null) {
    return {
      csl: null,
      sts: 0,
      nEff: 0,
      weightSum: 0,
      components: EMPTY_COMPONENTS,
      perVouchWeight,
      trust,
      independence: ind,
      skillVerified: false,
      algorithmVersion: SKILL_V2_ALGORITHM_VERSION,
    };
  }

  const sample: VouchInput[] = input.vouches.map((vouch) => ({
    skillOrdinal: vouch.level,
    effectiveWeight: perVouchWeight.get(vouch.id) ?? 0,
    voucherId: vouch.voucherId,
  }));
  if (input.selfRating !== null) {
    sample.push({
      skillOrdinal: input.selfRating,
      effectiveWeight: p.priorWeight,
      voucherId: PRIOR_VOUCHER_ID,
    });
  }

  const csl = weightedMedian(sample);

  // N_eff / weight_sum are evidence-only (prior excluded, §2AF.4) - the prior anchors the median, it is
  // not itself "evidence" for the confidence score.
  const weightSum = input.vouches.reduce((s, vouch) => s + (perVouchWeight.get(vouch.id) ?? 0), 0);
  const nEff = weightSum;

  const dispersion =
    weightSum > 0
      ? input.vouches.reduce(
          (s, vouch) => s + (perVouchWeight.get(vouch.id) ?? 0) * Math.abs(vouch.level - csl),
          0,
        ) / weightSum
      : 0;

  const countComponent = Math.min(nEff / k.countDivisor, 1);
  const weightComponent = Math.min(weightSum / k.weightDivisor, 1);
  const agreementComponent = Math.max(0, 1 - Math.min(dispersion / k.dispersionDivisor, 1));

  const blended =
    k.countCoefficient * countComponent +
    k.weightCoefficient * weightComponent +
    k.agreementCoefficient * agreementComponent;
  const sts = Math.min(k.scale, Math.max(0, roundTo1(k.scale * blended)));

  const skillVerified = sts >= p.skillVerifiedMinSts && nEff >= p.minIndependentVouchers;

  return {
    csl,
    sts,
    nEff,
    weightSum,
    components: {
      count: countComponent,
      weight: weightComponent,
      agreement: agreementComponent,
      dispersion,
    },
    perVouchWeight,
    trust,
    independence: ind,
    skillVerified,
    algorithmVersion: SKILL_V2_ALGORITHM_VERSION,
  };
}
