import { describe, expect, it } from 'vitest';
import {
  formatFee,
  isEarlyBirdOpen,
  isNextEntry,
  isValidNextEntryFee,
  priceBasisLabel,
  quoteFee,
  quoteSeats,
} from './fees';

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

describe('next-entry discount (master_plan §2BQ)', () => {
  const base = { feeAmount: 1500, nextEntryFeeAmount: 1000 };

  it('charges the next-entry price only on a next entry', () => {
    expect(quoteFee({ ...base, teamSize: 1 }).perPlayer).toBe(1500);
    const q = quoteFee({ ...base, teamSize: 1, isNextEntry: true });
    expect(q.perPlayer).toBe(1000);
    expect(q.basis).toBe('next_entry');
    expect(q.nextEntryApplied).toBe(true);
    expect(q.earlyBirdApplied).toBe(false);
  });

  it('ignores a next-entry price that is not cheaper', () => {
    const q = quoteFee({
      feeAmount: 1500,
      nextEntryFeeAmount: 1500,
      teamSize: 1,
      isNextEntry: true,
    });
    expect(q.perPlayer).toBe(1500);
    expect(q.basis).toBe('standard');
  });

  it('never stacks with early bird - the lowest single price wins', () => {
    const early = { ...base, ...WINDOW, earlyBirdFeeAmount: 1200, teamSize: 1 };
    expect(quoteFee({ ...early, isNextEntry: true }, INSIDE).perPlayer).toBe(1000);
    expect(quoteFee({ ...early, isNextEntry: true }, INSIDE).basis).toBe('next_entry');
    expect(quoteFee({ ...early, isNextEntry: false }, INSIDE).basis).toBe('early_bird');
    const cheapEarly = { ...early, earlyBirdFeeAmount: 900 };
    const q = quoteFee({ ...cheapEarly, isNextEntry: true }, INSIDE);
    expect(q.perPlayer).toBe(900);
    expect(q.basis).toBe('early_bird');
    expect(q.earlyBirdEndsAt).toBe(WINDOW.earlyBirdEndsAt);
    expect(quoteFee({ ...early, isNextEntry: true }, AFTER).perPlayer).toBe(1000);
  });

  it('keeps early bird on a tie', () => {
    const q = quoteFee(
      { ...base, ...WINDOW, earlyBirdFeeAmount: 1000, teamSize: 1, isNextEntry: true },
      INSIDE,
    );
    expect(q.basis).toBe('early_bird');
  });

  it('prices each seat on its own and adds them up', () => {
    const mixed = quoteSeats(base, [
      { playerId: 'a', isNextEntry: false },
      { playerId: 'b', isNextEntry: true },
    ]);
    expect(mixed.seats.map((s) => s.perPlayer)).toEqual([1500, 1000]);
    expect(mixed.total).toBe(2500);
    expect(mixed.saved).toBe(500);
    expect(
      quoteSeats(base, [
        { playerId: 'a', isNextEntry: true },
        { playerId: 'b', isNextEntry: true },
      ]).total,
    ).toBe(2000);
    expect(
      quoteSeats(base, [
        { playerId: 'a', isNextEntry: true },
        { playerId: null, isNextEntry: false },
      ]).total,
    ).toBe(2500);
  });

  describe('isNextEntry', () => {
    const e1 = { registrationId: 'r1', createdAt: '2026-09-01T10:00:00Z' };
    const e2 = { registrationId: 'r2', createdAt: '2026-09-02T10:00:00Z' };

    it('the earliest live entry is the 1st entry, later ones are next entries', () => {
      expect(isNextEntry([e1, e2], e1)).toBe(false);
      expect(isNextEntry([e1, e2], e2)).toBe(true);
    });

    it('an only entry is a 1st entry', () => {
      expect(isNextEntry([e1], e1)).toBe(false);
      expect(isNextEntry([], e1)).toBe(false);
    });

    it('a not-yet-created entry is a next entry when any live paid entry exists', () => {
      expect(isNextEntry([], null)).toBe(false);
      expect(isNextEntry([e1], null)).toBe(true);
    });

    it('when the 1st entry is cancelled the remaining entry becomes the 1st', () => {
      expect(isNextEntry([e2], e2)).toBe(false);
    });

    it('counts the target even when it is missing from the list (invited partner)', () => {
      expect(isNextEntry([e2], e1)).toBe(false);
      expect(isNextEntry([e1], e2)).toBe(true);
    });

    it('breaks a creation-time tie by id', () => {
      const same = { registrationId: 'r0', createdAt: e1.createdAt };
      expect(isNextEntry([e1, same], e1)).toBe(true);
      expect(isNextEntry([e1, same], same)).toBe(false);
    });
  });

  it('validates the next-entry price against the standard fee', () => {
    expect(isValidNextEntryFee(1500, null)).toBe(true);
    expect(isValidNextEntryFee(1500, 1000)).toBe(true);
    expect(isValidNextEntryFee(1500, 1500)).toBe(false);
    expect(isValidNextEntryFee(1500, -1)).toBe(false);
  });

  it('labels a seat basis in plain words', () => {
    expect(priceBasisLabel('next_entry')).toBe('2nd entry');
    expect(priceBasisLabel('early_bird')).toBe('Early bird');
    expect(priceBasisLabel('standard')).toBeNull();
    expect(priceBasisLabel(null)).toBeNull();
  });
});
