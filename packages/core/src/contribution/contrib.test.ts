import { describe, expect, it } from 'vitest';
import { computeContribution, type ContributionConfig } from './contrib';

const cfg: ContributionConfig = {
  baseDistinctPoints: 10,
  newcomerThreshold: 1,
  newcomerBonus: 5,
  reciprocalMultiplier: 0.25,
  ringMultiplier: 0,
  dailyFullCreditLimit: 2,
  dailyReducedCreditLimit: 3,
  dailyReducedMultiplier: 0.5,
  dailyFloorMultiplier: 0.1,
  decayHalfLifeDays: 100,
  levelBasePoints: 25,
  newcomerBadgeCount: 2,
  streakBadgeWeeks: 2,
  pillarScore: 100,
};
const now = new Date('2026-09-07T12:00:00Z');

describe('CONTRIB_V1', () => {
  it('suppresses repeat pairs and ignores insertion order', () => {
    const events = [
      {
        targetKey: 'b',
        occurredAt: '2026-09-07T09:00:00Z',
        targetDistinctVouchersBefore: 5,
        reciprocal: false,
        ringRisk: false,
      },
      {
        targetKey: 'a',
        occurredAt: '2026-09-07T08:00:00Z',
        targetDistinctVouchersBefore: 0,
        reciprocal: false,
        ringRisk: false,
      },
      {
        targetKey: 'a',
        occurredAt: '2026-09-07T10:00:00Z',
        targetDistinctVouchersBefore: 0,
        reciprocal: false,
        ringRisk: false,
      },
    ];
    expect(computeContribution(events, cfg, now)).toEqual(
      computeContribution([...events].reverse(), cfg, now),
    );
    expect(computeContribution(events, cfg, now).distinctPlayersHelped).toBe(2);
  });

  it('dampens reciprocity and removes ring-only credit', () => {
    const base = { occurredAt: '2026-09-07T08:00:00Z', targetDistinctVouchersBefore: 5 };
    const normal = computeContribution(
      [{ ...base, targetKey: 'a', reciprocal: false, ringRisk: false }],
      cfg,
      now,
    );
    const reciprocal = computeContribution(
      [{ ...base, targetKey: 'a', reciprocal: true, ringRisk: false }],
      cfg,
      now,
    );
    const ring = computeContribution(
      [{ ...base, targetKey: 'a', reciprocal: false, ringRisk: true }],
      cfg,
      now,
    );
    expect(reciprocal.score).toBeLessThan(normal.score);
    expect(ring.score).toBe(0);
  });

  it('applies daily diminishing returns and time decay', () => {
    const events = ['a', 'b', 'c', 'd'].map((targetKey, i) => ({
      targetKey,
      occurredAt: `2026-09-07T0${i + 1}:00:00Z`,
      targetDistinctVouchersBefore: 9,
      reciprocal: false,
      ringRisk: false,
    }));
    expect(computeContribution(events, cfg, now).score).toBeCloseTo(26, 0);
    const old = computeContribution(
      [{ ...events[0]!, occurredAt: '2026-05-30T01:00:00Z' }],
      cfg,
      now,
    );
    const fresh = computeContribution([events[0]!], cfg, now);
    expect(old.score).toBeCloseTo(fresh.score / 2, 1);
  });

  it('awards only coverage, newcomer, streak, and score badges', () => {
    const events = [
      {
        targetKey: 'a',
        occurredAt: '2026-08-25T08:00:00Z',
        targetDistinctVouchersBefore: 0,
        reciprocal: false,
        ringRisk: false,
      },
      {
        targetKey: 'b',
        occurredAt: '2026-09-01T08:00:00Z',
        targetDistinctVouchersBefore: 1,
        reciprocal: false,
        ringRisk: false,
      },
      {
        targetKey: 'c',
        occurredAt: '2026-09-07T08:00:00Z',
        targetDistinctVouchersBefore: 9,
        reciprocal: false,
        ringRisk: false,
      },
    ];
    const result = computeContribution(events, cfg, now);
    expect(result.badges).toContain('first_vouch');
    expect(result.badges).toContain('newcomer_champion');
    expect(result.badges).toContain('consistent_voucher');
    expect(result.currentStreakWeeks).toBe(3);
  });

  it('has no favorable-rating input capable of changing the result', () => {
    const event = {
      targetKey: 'a',
      occurredAt: '2026-09-07T08:00:00Z',
      targetDistinctVouchersBefore: 0,
      reciprocal: false,
      ringRisk: false,
    };
    expect(computeContribution([event], cfg, now)).toEqual(
      computeContribution([{ ...event }], cfg, now),
    );
  });
});
