import { describe, it, expect } from 'vitest';
import { STS_CONSTANTS, DEFAULT_SYSTEM_SETTINGS } from '@vouchplay/config';
import { effectiveWeight, type WeightSettings } from './weight';
import {
  computeSkillProfile,
  weightedMedian,
  STS_ALGORITHM_VERSION,
  type VouchInput,
  type StsConstants,
  type SkillVerifiedThresholds,
} from './sts';

// Constants sourced from @vouchplay/config so these tests also assert the shipped DEFAULTS match the
// locked spec (§10.5–§10.8). Admin settings override at runtime; the algorithm stays version-locked.
const C: StsConstants = {
  countDivisor: STS_CONSTANTS.countDivisor,
  weightDivisor: STS_CONSTANTS.weightDivisor,
  dispersionDivisor: STS_CONSTANTS.dispersionDivisor,
  countCoefficient: STS_CONSTANTS.countCoefficient,
  weightCoefficient: STS_CONSTANTS.weightCoefficient,
  agreementCoefficient: STS_CONSTANTS.agreementCoefficient,
  scale: STS_CONSTANTS.scale,
};
const T: SkillVerifiedThresholds = {
  minSts: DEFAULT_SYSTEM_SETTINGS.skill_verified_min_sts,
  minUniqueVouchers: DEFAULT_SYSTEM_SETTINGS.skill_verified_min_unique_vouchers,
};
const W: WeightSettings = {
  normal: DEFAULT_SYSTEM_SETTINGS.weight_normal,
  identityVerified: DEFAULT_SYSTEM_SETTINGS.weight_identity_verified,
  coach: DEFAULT_SYSTEM_SETTINGS.weight_coach,
  identityVerifiedCoach: DEFAULT_SYSTEM_SETTINGS.weight_identity_verified_coach,
};

const v = (skillOrdinal: number, effectiveWeightValue: number, voucherId: string): VouchInput => ({
  skillOrdinal,
  effectiveWeight: effectiveWeightValue,
  voucherId,
});

describe('effectiveWeight (§10.5)', () => {
  it('applies the four locked weights', () => {
    expect(effectiveWeight({ usedCoachWeight: false, voucherIdentityVerified: false }, W)).toBe(
      1.0,
    );
    expect(effectiveWeight({ usedCoachWeight: false, voucherIdentityVerified: true }, W)).toBe(
      1.25,
    );
    expect(effectiveWeight({ usedCoachWeight: true, voucherIdentityVerified: false }, W)).toBe(2.0);
    expect(effectiveWeight({ usedCoachWeight: true, voucherIdentityVerified: true }, W)).toBe(2.5);
  });
  it('config defaults match the locked spec', () => {
    expect(W).toEqual({
      normal: 1.0,
      identityVerified: 1.25,
      coach: 2.0,
      identityVerifiedCoach: 2.5,
    });
    expect(T).toEqual({ minSts: 3.0, minUniqueVouchers: 2 });
    expect(C.countDivisor).toBe(5);
    expect(C.weightDivisor).toBe(7.5);
    expect(C.dispersionDivisor).toBe(2.0);
    expect(C.scale).toBe(5);
  });
});

describe('weightedMedian (§10.6)', () => {
  it('unweighted odd/even', () => {
    expect(weightedMedian([v(1, 1, 'a'), v(3, 1, 'b'), v(5, 1, 'c')])).toBe(3);
    // even count, lower weighted median at the half-crossing
    expect(weightedMedian([v(2, 1, 'a'), v(4, 1, 'b')])).toBe(2);
  });
  it('is pulled by weight, not count', () => {
    // heavy low rating dominates
    expect(weightedMedian([v(1, 3, 'a'), v(5, 1, 'b')])).toBe(1);
    // heavy high rating dominates
    expect(weightedMedian([v(1, 1, 'a'), v(5, 3, 'b')])).toBe(5);
  });
});

describe('computeSkillProfile (§10.6–§10.8)', () => {
  it('returns nulls/zeros for no vouches', () => {
    const r = computeSkillProfile([], C, T);
    expect(r.communitySkillLevel).toBeNull();
    expect(r.weightedMean).toBeNull();
    expect(r.sts).toBe(0);
    expect(r.uniqueVoucherCount).toBe(0);
    expect(r.skillVerifiedByCommunity).toBe(false);
    expect(r.distribution).toEqual({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 });
    expect(r.algorithmVersion).toBe(STS_ALGORITHM_VERSION);
  });

  it('worked example: 5 unanimous Low-Intermediate vouches → STS 4.6, Skill Verified', () => {
    const vouches = [1, 2, 3, 4, 5].map((n) => v(3, 1.0, `u${n}`));
    const r = computeSkillProfile(vouches, C, T);
    expect(r.communitySkillLevel).toBe(3);
    expect(r.uniqueVoucherCount).toBe(5);
    expect(r.effectiveWeightSum).toBe(5);
    expect(r.countComponent).toBe(1); // 5/5
    expect(r.weightComponent).toBeCloseTo(0.6667, 4); // 5/7.5
    expect(r.agreementComponent).toBe(1); // unanimous
    expect(r.sts).toBe(4.6); // round(5 * (0.5 + 0.1667 + 0.25), 1)
    expect(r.skillVerifiedByCommunity).toBe(true);
    expect(r.distribution[3]).toBe(5);
  });

  it('worked example: split [2,4] equal weight → median 2, agreement 0.5, STS 2.0, not verified', () => {
    const r = computeSkillProfile([v(2, 1, 'a'), v(4, 1, 'b')], C, T);
    expect(r.communitySkillLevel).toBe(2);
    expect(r.weightedMean).toBeCloseTo(3, 6);
    expect(r.agreementComponent).toBe(0.5);
    expect(r.countComponent).toBeCloseTo(0.4, 6);
    expect(r.sts).toBe(2.0);
    expect(r.skillVerifiedByCommunity).toBe(false); // STS < 3.0
  });

  it('clamps STS to the 0..scale range', () => {
    const vouches = Array.from({ length: 20 }, (_, i) => v(3, 2.5, `u${i}`));
    const r = computeSkillProfile(vouches, C, T);
    expect(r.countComponent).toBe(1);
    expect(r.weightComponent).toBe(1); // 50/7.5 capped at 1
    expect(r.agreementComponent).toBe(1);
    expect(r.sts).toBe(5.0);
  });

  it('single vouch → low confidence, not verified even if unanimous', () => {
    const r = computeSkillProfile([v(6, 1, 'solo')], C, T);
    expect(r.communitySkillLevel).toBe(6);
    expect(r.uniqueVoucherCount).toBe(1);
    expect(r.skillVerifiedByCommunity).toBe(false); // needs >= 2 unique vouchers
  });

  it('is deterministic and order-independent', () => {
    const a = [v(2, 1, 'a'), v(4, 2, 'b'), v(3, 1.25, 'c'), v(5, 2.5, 'd')];
    const shuffled = [...a].reverse();
    expect(computeSkillProfile(shuffled, C, T)).toEqual(computeSkillProfile(a, C, T));
    // repeated calls identical
    expect(computeSkillProfile(a, C, T)).toEqual(computeSkillProfile(a, C, T));
  });

  it('counts unique vouchers only, and distribution reflects all active vouches', () => {
    // (in practice one active vouch per pair guarantees uniqueness; guard anyway)
    const r = computeSkillProfile([v(3, 1, 'a'), v(4, 1, 'b'), v(4, 1, 'c')], C, T);
    expect(r.uniqueVoucherCount).toBe(3);
    expect(r.distribution[4]).toBe(2);
    expect(r.distribution[3]).toBe(1);
  });
});
