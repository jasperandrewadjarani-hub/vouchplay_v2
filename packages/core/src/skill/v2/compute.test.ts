import { describe, it, expect } from 'vitest';
import { weightedMedian, type VouchInput } from '../../vouches/sts';
import { computeSkillV2, SKILL_V2_ALGORITHM_VERSION } from './compute';
import type { V2Constants, V2Params, V2Voucher, V2Vouch } from './types';

// Local test defaults - the §2AF worked example's exact parameters. E2 owns the shipped
// @vouchplay/config defaults; this engine must not depend on that package.
const TEST_PARAMS: V2Params = {
  trustUnknownFactor: 0.25,
  trustUnanchoredFactor: 0.6,
  trustStandingSaturation: 3,
  trustMaturityDays: 7,
  reciprocalMultiplier: 0.5,
  blocDecay: 0.6,
  priorWeight: 2,
  minIndependentVouchers: 2,
  skillVerifiedMinSts: 3,
};

// Identical to V1's shipped StsConstants (§10.7 / STS_CONSTANTS).
const TEST_CONSTANTS: V2Constants = {
  countDivisor: 5,
  weightDivisor: 7.5,
  dispersionDivisor: 2,
  countCoefficient: 0.5,
  weightCoefficient: 0.25,
  agreementCoefficient: 0.25,
  scale: 5,
};

const fresh = (id: string, clubIds: string[]): V2Voucher => ({
  id,
  anchored: false,
  standingRaw: 0,
  accountAgeDays: 1,
  clubIds,
});

const anchor = (id: string, clubIds: string[] = []): V2Voucher => ({
  id,
  anchored: true,
  standingRaw: 0,
  accountAgeDays: 365,
  clubIds,
});

const vouch = (
  id: string,
  voucherId: string,
  level: number,
  overrides: Partial<V2Vouch> = {},
): V2Vouch => ({
  id,
  voucherId,
  level,
  credentialWeight: 1,
  reciprocal: false,
  createdAt: '2026-09-11T00:00:00.000Z',
  ...overrides,
});

describe('computeSkillV2 - §2AF worked example', () => {
  it('12 fresh same-club accounts voting 5 cannot overrule 2 anchors + prior at 2: csl stays 2', () => {
    const vouchers = new Map<string, V2Voucher>();
    const vouches: V2Vouch[] = [];
    for (let i = 0; i < 12; i++) {
      const id = `club${i}`;
      vouchers.set(id, fresh(id, ['c1']));
      vouches.push(vouch(`v${i}`, id, 5));
    }
    vouchers.set('anchor1', anchor('anchor1', ['c2']));
    vouchers.set('anchor2', anchor('anchor2', ['c3']));
    vouches.push(vouch('va1', 'anchor1', 2));
    vouches.push(vouch('va2', 'anchor2', 2));

    const result = computeSkillV2(
      { selfRating: 2, vouches, vouchers },
      TEST_PARAMS,
      TEST_CONSTANTS,
    );

    expect(result.csl).toBe(2);
    expect(result.algorithmVersion).toBe(SKILL_V2_ALGORITHM_VERSION);

    // The 12-strong club bloc's total effective weight collapses well below 1.0 independent-equivalent.
    const blocWeight = Array.from(
      { length: 12 },
      (_, i) => result.perVouchWeight.get(`v${i}`) ?? 0,
    ).reduce((s, w) => s + w, 0);
    expect(blocWeight).toBeLessThan(1.0);

    // Total independent-equivalent evidence stays low - the attack "costs 12 accounts and moves nothing".
    expect(result.nEff).toBeLessThan(4);
    expect(result.nEff).toBeGreaterThan(0);

    // STS_V2 stays low confidence and the attack does not buy Skill Verified.
    expect(result.sts).toBeLessThan(TEST_PARAMS.skillVerifiedMinSts);
    expect(result.skillVerified).toBe(false);

    // Sanity: without any trust/independence discount V1 would have put CSL at 5 (12x1.0 @5 vs 2x1.0 @2).
    const v1Sample: VouchInput[] = [
      ...Array.from({ length: 12 }, (_, i) => ({
        skillOrdinal: 5,
        effectiveWeight: 1,
        voucherId: `club${i}`,
      })),
      { skillOrdinal: 2, effectiveWeight: 1, voucherId: 'anchor1' },
      { skillOrdinal: 2, effectiveWeight: 1, voucherId: 'anchor2' },
    ];
    expect(weightedMedian(v1Sample)).toBe(5);
  });
});

describe('computeSkillV2 - no evidence', () => {
  it('no vouches and no self-rating -> null csl, sts 0, not verified', () => {
    const result = computeSkillV2(
      { selfRating: null, vouches: [], vouchers: new Map() },
      TEST_PARAMS,
      TEST_CONSTANTS,
    );
    expect(result.csl).toBeNull();
    expect(result.sts).toBe(0);
    expect(result.nEff).toBe(0);
    expect(result.weightSum).toBe(0);
    expect(result.skillVerified).toBe(false);
  });
});

describe('computeSkillV2 - V1 equivalence sanity', () => {
  it('matches V1 weighted median when every voucher is anchored, clubless, non-reciprocal, and mature', () => {
    const vouchers = new Map<string, V2Voucher>([
      ['a', anchor('a')],
      ['b', anchor('b')],
      ['c', anchor('c')],
      ['d', anchor('d')],
    ]);
    const vouches: V2Vouch[] = [
      vouch('v1', 'a', 2, { credentialWeight: 1 }),
      vouch('v2', 'b', 4, { credentialWeight: 2 }),
      vouch('v3', 'c', 3, { credentialWeight: 1.25 }),
      vouch('v4', 'd', 5, { credentialWeight: 2.5 }),
    ];

    const v2 = computeSkillV2({ selfRating: null, vouches, vouchers }, TEST_PARAMS, TEST_CONSTANTS);

    const v1Sample: VouchInput[] = vouches.map((v) => ({
      skillOrdinal: v.level,
      effectiveWeight: v.credentialWeight,
      voucherId: v.voucherId,
    }));
    expect(v2.csl).toBe(weightedMedian(v1Sample));

    // effective weight should equal credentialWeight exactly (VT=1, IND=1 for every vouch here)
    for (const v of vouches) {
      expect(v2.perVouchWeight.get(v.id)).toBeCloseTo(v.credentialWeight, 6);
    }
  });
});

describe('computeSkillV2 - reciprocity halves weight', () => {
  it('a reciprocal vouch has exactly half the effective weight of an identical non-reciprocal one', () => {
    const vouchers = new Map<string, V2Voucher>([
      ['a', anchor('a')],
      ['b', anchor('b')],
    ]);
    const vouches: V2Vouch[] = [
      vouch('v1', 'a', 3, { credentialWeight: 1 }),
      vouch('v2', 'b', 3, { credentialWeight: 1, reciprocal: true }),
    ];
    const result = computeSkillV2(
      { selfRating: null, vouches, vouchers },
      TEST_PARAMS,
      TEST_CONSTANTS,
    );
    const plain = result.perVouchWeight.get('v1') ?? 0;
    const reciprocal = result.perVouchWeight.get('v2') ?? 0;
    expect(reciprocal).toBeCloseTo(plain * TEST_PARAMS.reciprocalMultiplier, 6);
  });
});

describe('computeSkillV2 - determinism / order independence', () => {
  it('shuffling the vouch array yields an identical result', () => {
    const vouchers = new Map<string, V2Voucher>([
      ['a', anchor('a', ['c1'])],
      ['b', fresh('b', ['c1'])],
      ['c', fresh('c', ['c2'])],
      ['d', anchor('d')],
    ]);
    const vouches: V2Vouch[] = [
      vouch('v1', 'a', 4),
      vouch('v2', 'b', 5, { reciprocal: true }),
      vouch('v3', 'c', 1),
      vouch('v4', 'd', 3),
    ];
    const a = computeSkillV2({ selfRating: 3, vouches, vouchers }, TEST_PARAMS, TEST_CONSTANTS);
    const b = computeSkillV2(
      { selfRating: 3, vouches: [...vouches].reverse(), vouchers },
      TEST_PARAMS,
      TEST_CONSTANTS,
    );
    expect(a.csl).toBe(b.csl);
    expect(a.sts).toBe(b.sts);
    expect(a.nEff).toBe(b.nEff);
    expect(a.weightSum).toBe(b.weightSum);
    expect(Object.fromEntries(a.perVouchWeight)).toEqual(Object.fromEntries(b.perVouchWeight));
  });
});

describe('computeSkillV2 - prior dominates with tiny evidence', () => {
  it('one fresh unknown vouch at 6 cannot move an honest self-rating of 1', () => {
    const vouchers = new Map<string, V2Voucher>([['a', fresh('a', [])]]);
    const vouches: V2Vouch[] = [vouch('v1', 'a', 6)];
    const result = computeSkillV2(
      { selfRating: 1, vouches, vouchers },
      TEST_PARAMS,
      TEST_CONSTANTS,
    );
    expect(result.csl).toBe(1);
  });
});
