import { describe, expect, it } from 'vitest';
import {
  summarizeEntryPayment,
  quoteSlotPrice,
  PLAY_DOWN_WARNING,
  type EntryPaymentInput,
  type SeatSlotInput,
} from './seat-payments';

/**
 * Coverage for `summarizeEntryPayment` and `quoteSlotPrice` per their docstrings and master_plan
 * §2AO decision A2. See seat-payments.ts for the rules under test - this file only asserts them.
 */

function doublesInput(over: Partial<EntryPaymentInput> = {}): EntryPaymentInput {
  return {
    teamSize: 2,
    memberIds: ['alice', 'bob'],
    teamPayment: null,
    slots: [],
    feeOwed: true,
    ...over,
  };
}

function slot(over: Partial<SeatSlotInput> = {}): SeatSlotInput {
  return {
    playerId: 'alice',
    status: 'verified',
    amountDue: 500,
    amountSubmitted: 500,
    createdAt: '2026-09-01T00:00:00Z',
    ...over,
  };
}

describe('summarizeEntryPayment - free division', () => {
  it('is paid, fully paid, with no receipt, regardless of any slots or team payment', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        feeOwed: false,
        teamPayment: { status: 'verified' },
        slots: [slot({ status: 'rejected' })],
      }),
    );
    expect(r.state).toBe('paid');
    expect(r.fullyPaid).toBe(true);
    expect(r.anyReceipt).toBe(false);
    expect(r.paidSeats).toBe(2);
    expect(r.submittedSeats).toBe(0);
    expect(r.totalSeats).toBe(2);
    expect(r.teamReceipt).toBe('none');
    expect(r.topupDue).toBe(0);
    expect(r.seats.every((s) => s.state === 'paid')).toBe(true);
  });

  it('still fills every seat as paid for an open (empty) seat', () => {
    const r = summarizeEntryPayment(doublesInput({ feeOwed: false, memberIds: ['alice'] }));
    expect(r.seats).toHaveLength(2);
    expect(r.seats.every((s) => s.state === 'paid')).toBe(true);
    // The open seat has no playerId even though it reads as "paid" money-wise.
    expect(r.seats[1]!.playerId).toBeNull();
  });
});

describe('summarizeEntryPayment - team receipt (whole-team payment row)', () => {
  it('verified team receipt pays every seat, including an OPEN one (solo paid the whole team)', () => {
    const r = summarizeEntryPayment(
      doublesInput({ memberIds: ['alice'], teamPayment: { status: 'verified' } }),
    );
    expect(r.state).toBe('paid');
    expect(r.fullyPaid).toBe(true);
    expect(r.anyReceipt).toBe(true);
    expect(r.paidSeats).toBe(2);
    expect(r.teamReceipt).toBe('verified');
    expect(r.seats.every((s) => s.state === 'paid')).toBe(true);
    expect(r.topupDue).toBe(0);
  });

  it('submitted team receipt puts every seat under review, holds the team, is not fully paid', () => {
    const r = summarizeEntryPayment(doublesInput({ teamPayment: { status: 'submitted' } }));
    expect(r.state).toBe('submitted');
    expect(r.fullyPaid).toBe(false);
    expect(r.anyReceipt).toBe(true);
    expect(r.paidSeats).toBe(0);
    expect(r.submittedSeats).toBe(2);
    expect(r.teamReceipt).toBe('submitted');
    expect(r.seats.every((s) => s.state === 'submitted')).toBe(true);
  });

  it('rejected team receipt with no slots reads as declined, not unpaid', () => {
    const r = summarizeEntryPayment(doublesInput({ teamPayment: { status: 'rejected' } }));
    expect(r.state).toBe('declined');
    expect(r.fullyPaid).toBe(false);
    expect(r.anyReceipt).toBe(false);
    expect(r.teamReceipt).toBe('rejected');
    expect(r.paidSeats).toBe(0);
    expect(r.submittedSeats).toBe(0);
  });

  it('refunded team receipt reads as refunded, with every seat back to unpaid', () => {
    const r = summarizeEntryPayment(doublesInput({ teamPayment: { status: 'refunded' } }));
    expect(r.state).toBe('refunded');
    expect(r.fullyPaid).toBe(false);
    expect(r.anyReceipt).toBe(false);
    expect(r.teamReceipt).toBe('refunded');
    expect(r.seats.every((s) => s.state === 'unpaid')).toBe(true);
  });

  it('partially_refunded also reads as the refunded team-receipt state', () => {
    const r = summarizeEntryPayment(
      doublesInput({ teamPayment: { status: 'partially_refunded' } }),
    );
    expect(r.teamReceipt).toBe('refunded');
    expect(r.state).toBe('refunded');
  });

  it('an unrecognised team payment status is treated as no team receipt (falls through to seats)', () => {
    const r = summarizeEntryPayment(
      doublesInput({ teamPayment: { status: 'something_unexpected' } }),
    );
    expect(r.teamReceipt).toBe('none');
    // Falls through to per-seat evaluation with no slots -> unpaid.
    expect(r.state).toBe('unpaid');
  });

  it('no team payment row at all reads as teamReceipt "none"', () => {
    const r = summarizeEntryPayment(doublesInput({ teamPayment: null }));
    expect(r.teamReceipt).toBe('none');
  });
});

describe('summarizeEntryPayment - per-seat states from attached slots', () => {
  it('a verified slot with amountSubmitted >= amountDue is paid', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        slots: [
          slot({ playerId: 'alice', status: 'verified', amountDue: 500, amountSubmitted: 500 }),
        ],
      }),
    );
    const seat = r.seats.find((s) => s.playerId === 'alice')!;
    expect(seat.state).toBe('paid');
    expect(seat.amountDue).toBe(500);
    expect(seat.amountSubmitted).toBe(500);
  });

  it('a verified slot that overpays is still paid (>= due, not ==)', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        slots: [
          slot({ playerId: 'alice', status: 'verified', amountDue: 500, amountSubmitted: 600 }),
        ],
      }),
    );
    expect(r.seats.find((s) => s.playerId === 'alice')!.state).toBe('paid');
  });

  it('a submitted slot is submitted, regardless of amount', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        slots: [
          slot({ playerId: 'alice', status: 'submitted', amountDue: 500, amountSubmitted: 0 }),
        ],
      }),
    );
    expect(r.seats.find((s) => s.playerId === 'alice')!.state).toBe('submitted');
  });

  it('a verified slot short of amountDue is topup (division upgraded the price after purchase)', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        slots: [
          slot({ playerId: 'alice', status: 'verified', amountDue: 800, amountSubmitted: 500 }),
        ],
      }),
    );
    const seat = r.seats.find((s) => s.playerId === 'alice')!;
    expect(seat.state).toBe('topup');
    expect(r.topupDue).toBe(300);
  });

  it('a rejected slot is declined', () => {
    const r = summarizeEntryPayment(
      doublesInput({ slots: [slot({ playerId: 'alice', status: 'rejected' })] }),
    );
    expect(r.seats.find((s) => s.playerId === 'alice')!.state).toBe('declined');
  });

  it('a refunded slot (not live, not rejected) reads as unpaid', () => {
    const r = summarizeEntryPayment(
      doublesInput({ slots: [slot({ playerId: 'alice', status: 'refunded' })] }),
    );
    expect(r.seats.find((s) => s.playerId === 'alice')!.state).toBe('unpaid');
  });

  it('a member with no slot at all is unpaid, not empty', () => {
    const r = summarizeEntryPayment(doublesInput({ slots: [] }));
    expect(r.seats.every((s) => s.state === 'unpaid')).toBe(true);
    expect(r.seats.every((s) => s.playerId != null)).toBe(true);
  });

  it('a seat beyond the present members is empty, with a null playerId', () => {
    const r = summarizeEntryPayment(doublesInput({ memberIds: ['alice'] }));
    expect(r.seats[0]!.playerId).toBe('alice');
    expect(r.seats[0]!.state).toBe('unpaid');
    expect(r.seats[1]!.playerId).toBeNull();
    expect(r.seats[1]!.state).toBe('empty');
  });
});

describe('summarizeEntryPayment - pickSlot: which row speaks for a player', () => {
  it('prefers a LIVE row (submitted/verified) over a rejected one for the same player', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        slots: [
          slot({ playerId: 'alice', status: 'rejected', createdAt: '2026-09-05T00:00:00Z' }),
          slot({
            playerId: 'alice',
            status: 'submitted',
            createdAt: '2026-09-01T00:00:00Z',
            amountSubmitted: 0,
          }),
        ],
      }),
    );
    // The rejected row is NEWER, but the live (submitted) one still wins.
    expect(r.seats.find((s) => s.playerId === 'alice')!.state).toBe('submitted');
  });

  it('among several rejected rows with no live one, picks the NEWEST by createdAt', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        slots: [
          slot({
            playerId: 'alice',
            status: 'rejected',
            amountDue: 100,
            createdAt: '2026-09-01T00:00:00Z',
          }),
          slot({
            playerId: 'alice',
            status: 'rejected',
            amountDue: 200,
            createdAt: '2026-09-10T00:00:00Z',
          }),
          slot({
            playerId: 'alice',
            status: 'rejected',
            amountDue: 150,
            createdAt: '2026-09-05T00:00:00Z',
          }),
        ],
      }),
    );
    const seat = r.seats.find((s) => s.playerId === 'alice')!;
    expect(seat.state).toBe('declined');
    expect(seat.amountDue).toBe(200); // the Sep 10 row
  });

  it('among two live rows, picks the newest live one', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        slots: [
          slot({
            playerId: 'alice',
            status: 'verified',
            amountDue: 500,
            amountSubmitted: 500,
            createdAt: '2026-09-01T00:00:00Z',
          }),
          slot({
            playerId: 'alice',
            status: 'submitted',
            amountDue: 800,
            amountSubmitted: 0,
            createdAt: '2026-09-10T00:00:00Z',
          }),
        ],
      }),
    );
    const seat = r.seats.find((s) => s.playerId === 'alice')!;
    expect(seat.state).toBe('submitted');
    expect(seat.amountDue).toBe(800);
  });

  it('treats a missing createdAt as the oldest (epoch 0) when ranking', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        slots: [
          slot({ playerId: 'alice', status: 'rejected', amountDue: 111, createdAt: null }),
          slot({
            playerId: 'alice',
            status: 'rejected',
            amountDue: 222,
            createdAt: '2026-09-01T00:00:00Z',
          }),
        ],
      }),
    );
    expect(r.seats.find((s) => s.playerId === 'alice')!.amountDue).toBe(222);
  });
});

describe('summarizeEntryPayment - overall state: partial vs submitted vs paid vs declined vs unpaid', () => {
  it('one paid seat + one unpaid seat -> partial, not paid, not fully paid', () => {
    const r = summarizeEntryPayment(
      doublesInput({ slots: [slot({ playerId: 'alice', status: 'verified' })] }),
    );
    expect(r.state).toBe('partial');
    expect(r.fullyPaid).toBe(false);
    expect(r.paidSeats).toBe(1);
    expect(r.anyReceipt).toBe(true);
  });

  it('one topup seat + one unpaid seat -> partial (topup counts as partial progress)', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        slots: [
          slot({ playerId: 'alice', status: 'verified', amountDue: 800, amountSubmitted: 500 }),
        ],
      }),
    );
    expect(r.state).toBe('partial');
    expect(r.fullyPaid).toBe(false);
  });

  it('every seat submitted (no paid/topup) -> submitted', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        slots: [
          slot({ playerId: 'alice', status: 'submitted', amountSubmitted: 0 }),
          slot({ playerId: 'bob', status: 'submitted', amountSubmitted: 0 }),
        ],
      }),
    );
    expect(r.state).toBe('submitted');
    expect(r.submittedSeats).toBe(2);
  });

  it('one submitted + one unpaid (no paid/topup anywhere) -> submitted, not partial', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        slots: [slot({ playerId: 'alice', status: 'submitted', amountSubmitted: 0 })],
      }),
    );
    expect(r.state).toBe('submitted');
  });

  it('every seat paid -> paid AND fullyPaid true', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        slots: [
          slot({ playerId: 'alice', status: 'verified' }),
          slot({ playerId: 'bob', status: 'verified' }),
        ],
      }),
    );
    expect(r.state).toBe('paid');
    expect(r.fullyPaid).toBe(true);
    expect(r.paidSeats).toBe(2);
  });

  it('fullyPaid stays false when one seat is still empty, even if the present seat is paid', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        memberIds: ['alice'],
        slots: [slot({ playerId: 'alice', status: 'verified' })],
      }),
    );
    expect(r.paidSeats).toBe(1);
    expect(r.totalSeats).toBe(2);
    expect(r.fullyPaid).toBe(false);
    // An empty seat is never paid, so overall state cannot be "paid" either.
    expect(r.state).not.toBe('paid');
  });

  it('a declined seat with nothing else paid/submitted -> declined', () => {
    const r = summarizeEntryPayment(
      doublesInput({ slots: [slot({ playerId: 'alice', status: 'rejected' })] }),
    );
    expect(r.state).toBe('declined');
  });

  it('a paid seat takes priority over a declined seat elsewhere -> partial, not declined', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        slots: [
          slot({ playerId: 'alice', status: 'verified' }),
          slot({ playerId: 'bob', status: 'rejected' }),
        ],
      }),
    );
    expect(r.state).toBe('partial');
  });

  it('a submitted seat takes priority over a declined seat elsewhere -> submitted, not declined', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        slots: [
          slot({ playerId: 'alice', status: 'submitted', amountSubmitted: 0 }),
          slot({ playerId: 'bob', status: 'rejected' }),
        ],
      }),
    );
    expect(r.state).toBe('submitted');
  });

  it('nothing at all (no team payment, no slots) -> unpaid', () => {
    const r = summarizeEntryPayment(doublesInput());
    expect(r.state).toBe('unpaid');
    expect(r.anyReceipt).toBe(false);
    expect(r.fullyPaid).toBe(false);
  });
});

describe('summarizeEntryPayment - singles (teamSize 1) and defensive team-size handling', () => {
  it('singles with a paid seat is fully paid', () => {
    const r = summarizeEntryPayment({
      teamSize: 1,
      memberIds: ['alice'],
      teamPayment: null,
      slots: [slot({ playerId: 'alice', status: 'verified' })],
      feeOwed: true,
    });
    expect(r.totalSeats).toBe(1);
    expect(r.fullyPaid).toBe(true);
    expect(r.state).toBe('paid');
  });

  it('teamSize 0 or negative is floored to 1, not 0', () => {
    const r = summarizeEntryPayment({
      teamSize: 0,
      memberIds: ['alice'],
      teamPayment: null,
      slots: [],
      feeOwed: true,
    });
    expect(r.totalSeats).toBe(1);
  });

  it('a non-integer teamSize is truncated', () => {
    const r = summarizeEntryPayment({
      teamSize: 2.9,
      memberIds: ['alice', 'bob'],
      teamPayment: null,
      slots: [],
      feeOwed: true,
    });
    expect(r.totalSeats).toBe(2);
  });
});

describe('summarizeEntryPayment - memberIds longer than teamSize are truncated', () => {
  it('extra member ids beyond teamSize are dropped, not turned into extra seats', () => {
    const r = summarizeEntryPayment(
      doublesInput({ teamSize: 2, memberIds: ['alice', 'bob', 'charlie', 'dana'] }),
    );
    expect(r.totalSeats).toBe(2);
    expect(r.seats).toHaveLength(2);
    expect(r.seats.map((s) => s.playerId)).toEqual(['alice', 'bob']);
  });

  it('truncation also applies to the free-division fast path', () => {
    const r = summarizeEntryPayment(
      doublesInput({ teamSize: 1, memberIds: ['alice', 'bob'], feeOwed: false }),
    );
    expect(r.totalSeats).toBe(1);
    expect(r.seats).toHaveLength(1);
  });

  it('truncation also applies when a team receipt covers every seat', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        teamSize: 2,
        memberIds: ['alice', 'bob', 'charlie'],
        teamPayment: { status: 'verified' },
      }),
    );
    expect(r.totalSeats).toBe(2);
    expect(r.seats).toHaveLength(2);
  });

  it('slots belonging to a truncated (dropped) member id are ignored', () => {
    const r = summarizeEntryPayment(
      doublesInput({
        teamSize: 2,
        memberIds: ['alice', 'bob', 'charlie'],
        slots: [slot({ playerId: 'charlie', status: 'verified' })],
      }),
    );
    expect(r.seats.map((s) => s.playerId)).toEqual(['alice', 'bob']);
    expect(r.seats.every((s) => s.state === 'unpaid')).toBe(true);
  });
});

describe('quoteSlotPrice - the lowest per-player quote among OPEN, fee > 0 divisions', () => {
  const noEarlyBird = { startsAt: null, endsAt: null };

  it('returns null when there are no divisions at all', () => {
    expect(quoteSlotPrice([], noEarlyBird)).toBeNull();
  });

  it('returns null when every division is free', () => {
    const r = quoteSlotPrice(
      [{ status: 'open', feeAmount: 0, earlyBirdFeeAmount: null }],
      noEarlyBird,
    );
    expect(r).toBeNull();
  });

  it('returns null when the only paying division is not open', () => {
    const r = quoteSlotPrice(
      [{ status: 'draft', feeAmount: 500, earlyBirdFeeAmount: null }],
      noEarlyBird,
    );
    expect(r).toBeNull();
  });

  it('a fee <= 0 (including negative) is treated as not a paying division', () => {
    const r = quoteSlotPrice(
      [{ status: 'open', feeAmount: -50, earlyBirdFeeAmount: null }],
      noEarlyBird,
    );
    expect(r).toBeNull();
  });

  it('picks the lowest per-player price among several open, paying divisions', () => {
    const r = quoteSlotPrice(
      [
        { status: 'open', feeAmount: 1000, earlyBirdFeeAmount: null },
        { status: 'open', feeAmount: 500, earlyBirdFeeAmount: null },
        { status: 'open', feeAmount: 750, earlyBirdFeeAmount: null },
      ],
      noEarlyBird,
    );
    expect(r?.perPlayer).toBe(500);
    expect(r?.standardPerPlayer).toBe(500);
    expect(r?.earlyBirdApplied).toBe(false);
  });

  it('ignores a cheaper division that is closed/draft/full - only OPEN counts', () => {
    const r = quoteSlotPrice(
      [
        { status: 'open', feeAmount: 1000, earlyBirdFeeAmount: null },
        { status: 'closed', feeAmount: 100, earlyBirdFeeAmount: null },
        { status: 'full', feeAmount: 50, earlyBirdFeeAmount: null },
      ],
      noEarlyBird,
    );
    expect(r?.perPlayer).toBe(1000);
  });

  it('ignores a free division even if it is open, when a paying one also qualifies', () => {
    const r = quoteSlotPrice(
      [
        { status: 'open', feeAmount: 0, earlyBirdFeeAmount: null },
        { status: 'open', feeAmount: 700, earlyBirdFeeAmount: null },
      ],
      noEarlyBird,
    );
    expect(r?.perPlayer).toBe(700);
  });

  it('applies early bird only when the window is open at `at`', () => {
    const divisions = [{ status: 'open', feeAmount: 1000, earlyBirdFeeAmount: 700 }];
    const window = { startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-09-10T00:00:00Z' };

    const inside = quoteSlotPrice(divisions, window, new Date('2026-09-05T00:00:00Z'));
    expect(inside?.perPlayer).toBe(700);
    expect(inside?.earlyBirdApplied).toBe(true);
    expect(inside?.earlyBirdEndsAt).toBe('2026-09-10T00:00:00Z');

    const before = quoteSlotPrice(divisions, window, new Date('2026-08-01T00:00:00Z'));
    expect(before?.perPlayer).toBe(1000);
    expect(before?.earlyBirdApplied).toBe(false);
    expect(before?.earlyBirdEndsAt).toBeNull();

    const after = quoteSlotPrice(divisions, window, new Date('2026-09-15T00:00:00Z'));
    expect(after?.perPlayer).toBe(1000);
    expect(after?.earlyBirdApplied).toBe(false);
  });

  it('picks the lowest EFFECTIVE per-player price across divisions with mixed early-bird discounts', () => {
    const divisions = [
      { status: 'open', feeAmount: 900, earlyBirdFeeAmount: 850 }, // effective 850 inside window
      { status: 'open', feeAmount: 800, earlyBirdFeeAmount: null }, // effective 800, no discount
    ];
    const window = { startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-09-10T00:00:00Z' };
    const r = quoteSlotPrice(divisions, window, new Date('2026-09-05T00:00:00Z'));
    // 800 (the plain division) beats 850 (the discounted one) even though the discounted one has a
    // lower STANDARD price - only the effective price should be compared.
    expect(r?.perPlayer).toBe(800);
    expect(r?.earlyBirdApplied).toBe(false);
  });

  it("an early-bird price that is not actually cheaper never applies (quoteFee's own guard)", () => {
    const divisions = [{ status: 'open', feeAmount: 500, earlyBirdFeeAmount: 500 }];
    const window = { startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-09-10T00:00:00Z' };
    const r = quoteSlotPrice(divisions, window, new Date('2026-09-05T00:00:00Z'));
    expect(r?.earlyBirdApplied).toBe(false);
    expect(r?.perPlayer).toBe(500);
  });

  it('defaults `at` to now (does not throw when omitted)', () => {
    expect(() =>
      quoteSlotPrice([{ status: 'open', feeAmount: 300, earlyBirdFeeAmount: null }], noEarlyBird),
    ).not.toThrow();
  });
});

describe('PLAY_DOWN_WARNING', () => {
  it('is exported and non-empty', () => {
    expect(typeof PLAY_DOWN_WARNING).toBe('string');
    expect(PLAY_DOWN_WARNING.length).toBeGreaterThan(0);
  });

  it("mentions the organizers' final assessment, so the sentence matches its use across surfaces", () => {
    expect(PLAY_DOWN_WARNING.toLowerCase()).toContain('assessment');
  });
});
