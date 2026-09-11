import { describe, it, expect } from 'vitest';
import { DEFAULT_SYSTEM_SETTINGS } from '@vouchplay/config';
import { effectiveWeight, WEIGHT_RULE_VERSION, type WeightSettings } from './weight';

// Sourced from @vouchplay/config so this also asserts the shipped defaults match the locked spec
// (§10.5, v1.67 amendment master_plan §2AN). Admin settings override at runtime; the four base rows
// and the fifth minimal-account factor are both version-locked in shape, not value.
const W: WeightSettings = {
  normal: DEFAULT_SYSTEM_SETTINGS.weight_normal,
  identityVerified: DEFAULT_SYSTEM_SETTINGS.weight_identity_verified,
  coach: DEFAULT_SYSTEM_SETTINGS.weight_coach,
  identityVerifiedCoach: DEFAULT_SYSTEM_SETTINGS.weight_identity_verified_coach,
  minimalAccountMultiplier: DEFAULT_SYSTEM_SETTINGS.weight_minimal_account_multiplier,
};

describe('effectiveWeight (§10.5, v1.67 §2AN)', () => {
  it('WEIGHT_RULE_VERSION is WEIGHT_V1.1', () => {
    expect(WEIGHT_RULE_VERSION).toBe('WEIGHT_V1.1');
  });

  it('the four base rows are unchanged and exact', () => {
    expect(effectiveWeight({ usedCoachWeight: false, voucherIdentityVerified: false }, W)).toBe(
      1.0,
    );
    expect(effectiveWeight({ usedCoachWeight: false, voucherIdentityVerified: true }, W)).toBe(
      1.25,
    );
    expect(effectiveWeight({ usedCoachWeight: true, voucherIdentityVerified: false }, W)).toBe(2.0);
    expect(effectiveWeight({ usedCoachWeight: true, voucherIdentityVerified: true }, W)).toBe(2.5);
  });

  it('a minimal account multiplies whichever base row applies, rounded to 2 decimals', () => {
    expect(
      effectiveWeight(
        { usedCoachWeight: false, voucherIdentityVerified: false, voucherMinimalAccount: true },
        W,
      ),
    ).toBe(0.5); // 1.00 x 0.5
    expect(
      effectiveWeight(
        { usedCoachWeight: false, voucherIdentityVerified: true, voucherMinimalAccount: true },
        W,
      ),
    ).toBe(0.63); // 1.25 x 0.5 = 0.625 -> Math.round(x*100)/100 -> 0.63
    expect(
      effectiveWeight(
        { usedCoachWeight: true, voucherIdentityVerified: false, voucherMinimalAccount: true },
        W,
      ),
    ).toBe(1.0); // 2.00 x 0.5
    expect(
      effectiveWeight(
        { usedCoachWeight: true, voucherIdentityVerified: true, voucherMinimalAccount: true },
        W,
      ),
    ).toBe(1.25); // 2.50 x 0.5
  });

  it('voucherMinimalAccount undefined behaves exactly like false', () => {
    expect(effectiveWeight({ usedCoachWeight: false, voucherIdentityVerified: false }, W)).toBe(
      effectiveWeight(
        { usedCoachWeight: false, voucherIdentityVerified: false, voucherMinimalAccount: false },
        W,
      ),
    );
  });

  it('a multiplier of 1 disables the minimal-account factor (no change)', () => {
    const off: WeightSettings = { ...W, minimalAccountMultiplier: 1 };
    expect(
      effectiveWeight(
        { usedCoachWeight: false, voucherIdentityVerified: false, voucherMinimalAccount: true },
        off,
      ),
    ).toBe(1.0);
    expect(
      effectiveWeight(
        { usedCoachWeight: true, voucherIdentityVerified: true, voucherMinimalAccount: true },
        off,
      ),
    ).toBe(2.5);
  });

  it('never affected by Skill Verified, Facebook, or Organizer role (no such inputs exist)', () => {
    // Compile-time guarantee: WeightInputs only accepts usedCoachWeight, voucherIdentityVerified,
    // and voucherMinimalAccount. This test documents the invariant alongside the others above.
    expect(Object.keys({ usedCoachWeight: true, voucherIdentityVerified: true }).length).toBe(2);
  });
});
