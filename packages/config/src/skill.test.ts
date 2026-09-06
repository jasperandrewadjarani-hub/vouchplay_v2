import { describe, it, expect } from 'vitest';
import { SKILL_BANDS, skillByOrdinal, skillByKey } from './skill';
import { DEFAULT_SYSTEM_SETTINGS, STS_CONSTANTS } from './settings';

describe('canonical skill bands (handover §3.1, locked order)', () => {
  it('has 7 bands in the exact canonical order and ordinals 0..6', () => {
    expect(SKILL_BANDS.map((b) => b.label)).toEqual([
      'Newbie',
      'Beginner',
      'Novice',
      'Low Intermediate',
      'High Intermediate',
      'Advanced',
      'Pro',
    ]);
    expect(SKILL_BANDS.map((b) => b.ordinal)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('resolves bands by ordinal and key', () => {
    expect(skillByOrdinal(3)?.key).toBe('low_intermediate');
    expect(skillByKey('pro')?.ordinal).toBe(6);
    expect(skillByOrdinal(99)).toBeUndefined();
  });
});

describe('default system settings (handover §30.7)', () => {
  it('carries the locked vouch defaults', () => {
    // Per-24h vouch limits default to 0 = unlimited (JT 2026-09-07); still admin-tunable.
    expect(DEFAULT_SYSTEM_SETTINGS.player_vouches_per_24h).toBe(0);
    expect(DEFAULT_SYSTEM_SETTINGS.coach_vouches_per_24h).toBe(0);
    expect(DEFAULT_SYSTEM_SETTINGS.skill_verified_min_sts).toBe(3.0);
    expect(DEFAULT_SYSTEM_SETTINGS.weight_identity_verified_coach).toBe(2.5);
  });

  it('STS component coefficients sum to 1', () => {
    const sum =
      STS_CONSTANTS.countCoefficient +
      STS_CONSTANTS.weightCoefficient +
      STS_CONSTANTS.agreementCoefficient;
    expect(sum).toBeCloseTo(1);
  });
});
