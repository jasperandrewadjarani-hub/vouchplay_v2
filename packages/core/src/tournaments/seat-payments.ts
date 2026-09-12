/**
 * The seat as the unit of payment (master_plan §2AO A, handover §24.6).
 *
 * A team entry's money state is the COMBINATION of one optional team receipt (`payments`, pays every
 * seat at once) and any number of attached tournament slots (`tournament_slots`, one per player).
 * This is the ONE place that combination is decided, so the player's card, the partner's
 * notification, the organizer's chip, the receipt email and the overview tile can never disagree.
 *
 * THE RULE: a registration is CONFIRMED only when it is FULLY PAID - a verified team receipt, or a
 * verified seat for every one of `teamSize` seats. An empty seat (no player yet) is never paid.
 *
 * Pure. No dates, no IO. Free divisions short-circuit to "paid" so callers can treat money as settled,
 * but `anyReceipt` stays false and the server never auto-confirms a free entry (the organizer does).
 */

import { quoteFee, type FeeQuote } from './fees';

export type SeatState = 'paid' | 'submitted' | 'topup' | 'declined' | 'unpaid' | 'empty';

export type EntryPaymentState =
  'paid' | 'partial' | 'submitted' | 'unpaid' | 'declined' | 'refunded';

export type TeamReceiptState = 'none' | 'submitted' | 'verified' | 'rejected' | 'refunded';

export interface SeatSlotInput {
  playerId: string;
  /** payment_status: submitted | verified | rejected | refunded (others treated as unpaid). */
  status: string;
  amountDue: number;
  amountSubmitted: number | null;
  /** ISO, used only to pick the LATEST row for a player when several exist (e.g. a rejected one). */
  createdAt?: string | null;
}

export interface EntryPaymentInput {
  /** Players per team for the division (1 singles, 2 doubles). */
  teamSize: number;
  /** Every team member (confirmed AND pending), in member order. */
  memberIds: string[];
  /** The team-scope payments row, or null. */
  teamPayment: { status: string } | null;
  /** Attached tournament_slots rows for this registration, any status. */
  slots: SeatSlotInput[];
  /** False for a free division (per-player fee <= 0). */
  feeOwed: boolean;
}

export interface SeatSummary {
  /** Null for an empty seat. */
  playerId: string | null;
  state: SeatState;
  amountDue: number;
  amountSubmitted: number;
}

export interface EntryPaymentSummary {
  state: EntryPaymentState;
  /** True only when every one of `totalSeats` seats is paid (or the team receipt is verified). */
  fullyPaid: boolean;
  /** A receipt (team or seat) is submitted or verified - enough to hold the team's slot. */
  anyReceipt: boolean;
  paidSeats: number;
  submittedSeats: number;
  totalSeats: number;
  seats: SeatSummary[];
  teamReceipt: TeamReceiptState;
  /** Sum of `amountDue - amountSubmitted` over `topup` seats. 0 when none. */
  topupDue: number;
}

const LIVE = new Set(['submitted', 'verified']);

function teamReceiptState(status: string | null | undefined): TeamReceiptState {
  if (!status) return 'none';
  if (status === 'verified') return 'verified';
  if (status === 'submitted') return 'submitted';
  if (status === 'rejected') return 'rejected';
  if (status === 'refunded' || status === 'partially_refunded') return 'refunded';
  return 'none';
}

/** The row that speaks for a player: a live one first, else the most recent of the rest. */
function pickSlot(rows: SeatSlotInput[]): SeatSlotInput | null {
  if (rows.length === 0) return null;
  const live = rows.filter((r) => LIVE.has(r.status));
  const pool = live.length > 0 ? live : rows;
  return [...pool].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  })[0]!;
}

function seatFromSlot(playerId: string, slot: SeatSlotInput | null): SeatSummary {
  if (!slot) return { playerId, state: 'unpaid', amountDue: 0, amountSubmitted: 0 };
  const due = Math.max(0, slot.amountDue);
  const paid = Math.max(0, slot.amountSubmitted ?? 0);
  if (slot.status === 'verified') {
    return {
      playerId,
      state: paid >= due ? 'paid' : 'topup',
      amountDue: due,
      amountSubmitted: paid,
    };
  }
  if (slot.status === 'submitted') {
    return { playerId, state: 'submitted', amountDue: due, amountSubmitted: paid };
  }
  if (slot.status === 'rejected') {
    return { playerId, state: 'declined', amountDue: due, amountSubmitted: 0 };
  }
  return { playerId, state: 'unpaid', amountDue: due, amountSubmitted: 0 };
}

export function summarizeEntryPayment(input: EntryPaymentInput): EntryPaymentSummary {
  const totalSeats = Math.max(1, Math.trunc(input.teamSize) || 1);
  const members = input.memberIds.slice(0, totalSeats);
  const team = teamReceiptState(input.teamPayment?.status);

  const fill = (state: SeatState): SeatSummary[] => {
    const seats: SeatSummary[] = members.map((id) => ({
      playerId: id,
      state,
      amountDue: 0,
      amountSubmitted: 0,
    }));
    while (seats.length < totalSeats)
      seats.push({ playerId: null, state, amountDue: 0, amountSubmitted: 0 });
    return seats;
  };

  // Free division: nothing is owed, nothing is outstanding. Never a receipt.
  if (!input.feeOwed) {
    return {
      state: 'paid',
      fullyPaid: true,
      anyReceipt: false,
      paidSeats: totalSeats,
      submittedSeats: 0,
      totalSeats,
      seats: fill('paid'),
      teamReceipt: 'none',
      topupDue: 0,
    };
  }

  // A team receipt speaks for every seat, open ones included (a solo entry that paid the whole team
  // is confirmed with its seat still open - §2AM decision 2 is unchanged).
  if (team === 'verified') {
    return {
      state: 'paid',
      fullyPaid: true,
      anyReceipt: true,
      paidSeats: totalSeats,
      submittedSeats: 0,
      totalSeats,
      seats: fill('paid'),
      teamReceipt: team,
      topupDue: 0,
    };
  }
  if (team === 'submitted') {
    return {
      state: 'submitted',
      fullyPaid: false,
      anyReceipt: true,
      paidSeats: 0,
      submittedSeats: totalSeats,
      totalSeats,
      seats: fill('submitted'),
      teamReceipt: team,
      topupDue: 0,
    };
  }
  if (team === 'refunded') {
    return {
      state: 'refunded',
      fullyPaid: false,
      anyReceipt: false,
      paidSeats: 0,
      submittedSeats: 0,
      totalSeats,
      seats: fill('unpaid'),
      teamReceipt: team,
      topupDue: 0,
    };
  }

  // Per seat, from the attached slots.
  const byPlayer = new Map<string, SeatSlotInput[]>();
  for (const s of input.slots) {
    const list = byPlayer.get(s.playerId) ?? [];
    list.push(s);
    byPlayer.set(s.playerId, list);
  }
  const seats: SeatSummary[] = members.map((id) =>
    seatFromSlot(id, pickSlot(byPlayer.get(id) ?? [])),
  );
  while (seats.length < totalSeats)
    seats.push({ playerId: null, state: 'empty', amountDue: 0, amountSubmitted: 0 });

  const paidSeats = seats.filter((s) => s.state === 'paid').length;
  const submittedSeats = seats.filter((s) => s.state === 'submitted').length;
  const topupSeats = seats.filter((s) => s.state === 'topup');
  const declined = seats.some((s) => s.state === 'declined') || team === 'rejected';
  const fullyPaid = paidSeats === totalSeats;
  const anyReceipt = paidSeats + submittedSeats + topupSeats.length > 0;

  let state: EntryPaymentState;
  if (fullyPaid) state = 'paid';
  else if (paidSeats > 0 || topupSeats.length > 0) state = 'partial';
  else if (submittedSeats > 0) state = 'submitted';
  else if (declined) state = 'declined';
  else state = 'unpaid';

  return {
    state,
    fullyPaid,
    anyReceipt,
    paidSeats,
    submittedSeats,
    totalSeats,
    seats,
    teamReceipt: team,
    topupDue: topupSeats.reduce((sum, s) => sum + Math.max(0, s.amountDue - s.amountSubmitted), 0),
  };
}

// ---------------------------------------------------------------------------
// Bare slot price (§2AO A5): the lowest per-player quote among OPEN divisions that charge a fee,
// early bird applied at the moment of purchase. Null when no open division charges anything.
// ---------------------------------------------------------------------------

export interface SlotPriceDivision {
  status: string;
  feeAmount: number;
  earlyBirdFeeAmount: number | null;
}

export interface SlotPriceQuote {
  perPlayer: number;
  earlyBirdApplied: boolean;
  standardPerPlayer: number;
  earlyBirdEndsAt: string | null;
}

export function quoteSlotPrice(
  divisions: readonly SlotPriceDivision[],
  earlyBird: { startsAt: string | null; endsAt: string | null },
  at: Date = new Date(),
): SlotPriceQuote | null {
  let best: FeeQuote | null = null;
  for (const d of divisions) {
    if (d.status !== 'open' || d.feeAmount <= 0) continue;
    const q = quoteFee(
      {
        feeAmount: d.feeAmount,
        earlyBirdFeeAmount: d.earlyBirdFeeAmount,
        earlyBirdStartsAt: earlyBird.startsAt,
        earlyBirdEndsAt: earlyBird.endsAt,
        teamSize: 1,
      },
      at,
    );
    if (!best || q.perPlayer < best.perPlayer) best = q;
  }
  if (!best) return null;
  return {
    perPlayer: best.perPlayer,
    earlyBirdApplied: best.earlyBirdApplied,
    standardPerPlayer: best.standardPerPlayer,
    earlyBirdEndsAt: best.earlyBirdEndsAt,
  };
}

/** The sentence every play-down surface uses (§2AO C) - card, tick, and the eligibility note. */
export const PLAY_DOWN_WARNING =
  "You're entering one level below your community-vouched skill. Your division is subject to the organizers' final skills assessment, and you may be moved to a different division to keep play fair for everyone.";
