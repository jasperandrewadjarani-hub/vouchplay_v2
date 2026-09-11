import { describe, it, expect } from 'vitest';
import { voucherTrust } from './trust';
import type { V2Params, V2Voucher } from './types';

// Local test defaults mirroring the §2AF worked example (E2 owns the shipped @vouchplay/config
// defaults; this engine must not depend on that package).
const P: V2Params = {
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

const voucher = (overrides: Partial<V2Voucher>): V2Voucher => ({
  id: 'u1',
  anchored: false,
  standingRaw: 0,
  accountAgeDays: 0,
  clubIds: [],
  outgoingCount: 5,
  ...overrides,
});

describe('voucherTrust (§2AF.1)', () => {
  it('a fresh, unknown account (unanchored, zero standing) gets the unknown factor scaled by maturity', () => {
    const vt = voucherTrust(voucher({ accountAgeDays: 0 }), P);
    // maturity = 0.5 + 0.5*min(1, 0/7) = 0.5 ; VT = 0.5 * 0.25
    expect(vt).toBeCloseTo(0.125, 6);
  });

  it('a mature, unknown account saturates maturity to 1.0', () => {
    const vt = voucherTrust(voucher({ accountAgeDays: 7 }), P);
    expect(vt).toBeCloseTo(0.25, 6);
    const vtOlder = voucherTrust(voucher({ accountAgeDays: 365 }), P);
    expect(vtOlder).toBeCloseTo(0.25, 6);
  });

  it('anchored accounts always use anchoredFactor 1, regardless of standing', () => {
    const vt = voucherTrust(voucher({ anchored: true, standingRaw: 0, accountAgeDays: 30 }), P);
    expect(vt).toBeCloseTo(1, 6); // fully mature * 1
    const vtWithStanding = voucherTrust(
      voucher({ anchored: true, standingRaw: 99, accountAgeDays: 30 }),
      P,
    );
    expect(vtWithStanding).toBeCloseTo(1, 6);
  });

  it('unanchored with standing blends toward 1 as standing saturates', () => {
    const mature = voucher({ anchored: false, accountAgeDays: 30 });
    const noStanding = voucherTrust({ ...mature, standingRaw: 0 }, P);
    const partialStanding = voucherTrust({ ...mature, standingRaw: 1.5 }, P); // half of saturation(3)
    const fullStanding = voucherTrust({ ...mature, standingRaw: 3 }, P);
    const overSaturated = voucherTrust({ ...mature, standingRaw: 30 }, P);

    expect(noStanding).toBeCloseTo(0.25, 6); // falls to unknownFactor, not the unanchored blend
    // standingComponent = 0.5 -> 0.6 + 0.4*0.5 = 0.8
    expect(partialStanding).toBeCloseTo(0.8, 6);
    // standingComponent = 1 -> 0.6 + 0.4*1 = 1.0
    expect(fullStanding).toBeCloseTo(1, 6);
    expect(overSaturated).toBeCloseTo(1, 6); // saturates, never exceeds 1
  });

  it('clamps to [0,1] and guards NaN/negative inputs as 0', () => {
    const negativeAge = voucherTrust(voucher({ accountAgeDays: -10, standingRaw: -5 }), P);
    expect(negativeAge).toBeGreaterThanOrEqual(0);
    expect(negativeAge).toBeCloseTo(0.125, 6); // treated identically to accountAgeDays 0, standingRaw 0

    const nanAge = voucherTrust(
      voucher({ accountAgeDays: Number.NaN, standingRaw: Number.NaN }),
      P,
    );
    expect(nanAge).toBe(0.125);
    expect(Number.isFinite(nanAge)).toBe(true);
  });

  it('is deterministic', () => {
    const u = voucher({ anchored: false, standingRaw: 2, accountAgeDays: 4 });
    expect(voucherTrust(u, P)).toBe(voucherTrust(u, P));
  });
});
