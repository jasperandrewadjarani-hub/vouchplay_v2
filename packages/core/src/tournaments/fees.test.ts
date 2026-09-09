import { describe, expect, it } from 'vitest';
import { formatFee, isEarlyBirdOpen, quoteFee } from './fees';

const WINDOW = {
  earlyBirdStartsAt: '2026-09-01T00:00:00Z',
  earlyBirdEndsAt: '2026-09-30T23:59:59Z',
};
const INSIDE = new Date('2026-09-15T00:00:00Z');
const AFTER = new Date('2026-10-05T00:00:00Z');

describe('per-player pricing', () => {
  // The live conversion: divisions held 3000 per TEAM and displayed 1500 per player. After migration
  // 0026 they hold 1500 per player and must still collect 3000.
  it('multiplies the per-player fee by the team size', () => {
    const q = quoteFee({ feeAmount: 1500, teamSize: 2 });
    expect(q.perPlayer).toBe(1500);
    expect(q.teamTotal).toBe(3000);
  });

  it('charges a singles entry once', () => {
    expect(quoteFee({ feeAmount: 1500, teamSize: 1 }).teamTotal).toBe(1500);
  });

  it('treats a free division as free', () => {
    const q = quoteFee({ feeAmount: 0, teamSize: 2 });
    expect(q.teamTotal).toBe(0);
    expect(formatFee('PHP', q.perPlayer)).toBe('Free');
  });

  it('never produces a negative or fractional team size', () => {
    expect(quoteFee({ feeAmount: 1000, teamSize: 0 }).teamTotal).toBe(1000);
    expect(quoteFee({ feeAmount: 1000, teamSize: -3 }).teamTotal).toBe(1000);
  });
});

describe('early bird', () => {
  it('applies inside the window', () => {
    const q = quoteFee(
      { feeAmount: 1500, earlyBirdFeeAmount: 1200, ...WINDOW, teamSize: 2 },
      INSIDE,
    );
    expect(q.earlyBirdApplied).toBe(true);
    expect(q.perPlayer).toBe(1200);
    expect(q.teamTotal).toBe(2400);
    expect(q.standardPerPlayer).toBe(1500);
  });

  it('does not apply after the window closes', () => {
    const q = quoteFee(
      { feeAmount: 1500, earlyBirdFeeAmount: 1200, ...WINDOW, teamSize: 2 },
      AFTER,
    );
    expect(q.earlyBirdApplied).toBe(false);
    expect(q.teamTotal).toBe(3000);
  });

  it('ignores a half-configured window rather than guessing', () => {
    // Charging a promo price because one date was left blank is worse than charging the standard one.
    expect(isEarlyBirdOpen('2026-09-01T00:00:00Z', null, INSIDE)).toBe(false);
    expect(isEarlyBirdOpen(null, '2026-09-30T00:00:00Z', INSIDE)).toBe(false);
    expect(
      quoteFee(
        {
          feeAmount: 1500,
          earlyBirdFeeAmount: 1200,
          earlyBirdStartsAt: null,
          earlyBirdEndsAt: null,
          teamSize: 2,
        },
        INSIDE,
      ).teamTotal,
    ).toBe(3000);
  });

  it('ignores an unparseable date rather than throwing', () => {
    expect(isEarlyBirdOpen('not-a-date', '2026-09-30T00:00:00Z', INSIDE)).toBe(false);
  });

  it('refuses an early amount that is not actually cheaper', () => {
    // A promo that is not a discount would be a quiet price rise.
    const q = quoteFee(
      { feeAmount: 1500, earlyBirdFeeAmount: 1800, ...WINDOW, teamSize: 2 },
      INSIDE,
    );
    expect(q.earlyBirdApplied).toBe(false);
    expect(q.perPlayer).toBe(1500);
  });

  it('allows a free early-bird price', () => {
    const q = quoteFee({ feeAmount: 1500, earlyBirdFeeAmount: 0, ...WINDOW, teamSize: 2 }, INSIDE);
    expect(q.earlyBirdApplied).toBe(true);
    expect(q.teamTotal).toBe(0);
  });

  it('includes the deadline only while the discount is live', () => {
    const live = quoteFee(
      { feeAmount: 1500, earlyBirdFeeAmount: 1200, ...WINDOW, teamSize: 2 },
      INSIDE,
    );
    expect(live.earlyBirdEndsAt).toBe(WINDOW.earlyBirdEndsAt);
    const over = quoteFee(
      { feeAmount: 1500, earlyBirdFeeAmount: 1200, ...WINDOW, teamSize: 2 },
      AFTER,
    );
    expect(over.earlyBirdEndsAt).toBeNull();
  });

  it('is inclusive of both ends of the window', () => {
    const at = { feeAmount: 1500, earlyBirdFeeAmount: 1200, ...WINDOW, teamSize: 2 };
    expect(quoteFee(at, new Date(WINDOW.earlyBirdStartsAt)).earlyBirdApplied).toBe(true);
    expect(quoteFee(at, new Date(WINDOW.earlyBirdEndsAt)).earlyBirdApplied).toBe(true);
  });
});

describe('formatFee', () => {
  it('groups thousands', () => {
    expect(formatFee('PHP', 1500)).toBe('PHP 1,500');
  });
});
