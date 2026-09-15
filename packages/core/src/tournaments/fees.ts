/**
 * Entry-fee arithmetic, in one place (master_plan §1V).
 *
 * Since migration 0026 `divisions.fee_amount` is the price PER PLAYER, not a team total. The
 * organizer types the number a player reads, and a team pays it once per member. Before 0026 the
 * stored value was a team total that the UI divided by `teamSize` to display, which meant one price
 * existed as three different numbers and any of them could be read as the others.
 *
 * Pure and shared so the price a player is quoted, the total shown on the payment screen, and the
 * amount recorded against the payment cannot drift apart.
 */

export interface FeeInput {
  /** Standard price per player. */
  feeAmount: number;
  /** Optional discounted price per player while the tournament's early-bird window is open. */
  earlyBirdFeeAmount?: number | null;
  /** Tournament-wide early-bird window. Both ends are required for the promo to count. */
  earlyBirdStartsAt?: string | null;
  earlyBirdEndsAt?: string | null;
  /** Players per team: 1 for singles, 2 for doubles. */
  teamSize: number;
  /** Optional price per player for a player's 2nd-or-later entry in the tournament (master_plan §2BQ). */
  nextEntryFeeAmount?: number | null;
  /** True when the seat being priced is NOT the player's 1st entry (see `isNextEntry`). */
  isNextEntry?: boolean;
}

/** Why a seat costs what it costs (§2BQ). Recorded on the receipt so later edits never rewrite it. */
export type PriceBasis = 'standard' | 'early_bird' | 'next_entry';

export interface FeeQuote {
  /** What each player pays. */
  perPlayer: number;
  /** What the team sends in total when every seat is priced the same (`perPlayer x teamSize`). A team
   *  whose seats differ (one 1st entry, one 2nd) is totalled seat by seat with `quoteSeats`. */
  teamTotal: number;
  /** Which single price is being charged. Discounts never stack - the lowest one wins. */
  basis: PriceBasis;
  /** True when the early-bird price is the one being charged right now. */
  earlyBirdApplied: boolean;
  /** True when the next-entry price is the one being charged. */
  nextEntryApplied: boolean;
  /** The standard per-player price, so a discount can be shown against it. */
  standardPerPlayer: number;
  /** When the early-bird price stops applying, if it is currently applied. */
  earlyBirdEndsAt: string | null;
}

/**
 * The early-bird window is a single range on the TOURNAMENT and applies to every division
 * (Jasper, 2026-09-09). Only the amount differs per division, because how much off can reasonably
 * differ between a Novice and an Open bracket while the deadline cannot.
 *
 * A promo counts only when both ends of the window exist and `at` falls inside them. A half-configured
 * window never discounts anything - silently charging a promo price because one date was left blank
 * is worse than charging the standard one.
 */
export function isEarlyBirdOpen(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  at: Date = new Date(),
): boolean {
  if (!startsAt || !endsAt) return false;
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  const now = at.getTime();
  return now >= start && now <= end;
}

/**
 * Quote a division. `at` is injected so the price can be resolved at the moment that matters -
 * which is when the receipt is submitted, not when the entry was started. A player who begins an
 * entry before the deadline and pays after it owes the standard price, and the reverse holds too.
 */
export function quoteFee(input: FeeInput, at: Date = new Date()): FeeQuote {
  const size = Math.max(1, Math.trunc(input.teamSize) || 1);
  const standard = Math.max(0, input.feeAmount);
  const early = input.earlyBirdFeeAmount;
  const windowOpen = isEarlyBirdOpen(input.earlyBirdStartsAt, input.earlyBirdEndsAt, at);
  // A promo that is not cheaper is not a promo; charging it would be a quiet price rise.
  const earlyApplies = windowOpen && early != null && early >= 0 && early < standard;
  const next = input.nextEntryFeeAmount;
  const nextApplies = Boolean(input.isNextEntry) && next != null && next >= 0 && next < standard;
  // Lowest single price wins (§2BQ C). On a tie early bird is kept, because it carries a deadline the
  // player should see.
  let basis: PriceBasis = 'standard';
  let perPlayer = standard;
  if (earlyApplies && early < perPlayer) {
    basis = 'early_bird';
    perPlayer = early;
  }
  if (nextApplies && next < perPlayer) {
    basis = 'next_entry';
    perPlayer = next;
  }
  return {
    perPlayer,
    teamTotal: perPlayer * size,
    basis,
    earlyBirdApplied: basis === 'early_bird',
    nextEntryApplied: basis === 'next_entry',
    standardPerPlayer: standard,
    earlyBirdEndsAt: basis === 'early_bird' ? (input.earlyBirdEndsAt ?? null) : null,
  };
}

// ---------------------------------------------------------------------------
// Next-entry discount (master_plan §2BQ).
// ---------------------------------------------------------------------------

/** One of a player's live entries in a PAID division of the tournament. */
export interface EntryRef {
  registrationId: string;
  /** `registrations.created_at` (ISO). */
  createdAt: string;
}

function entryOrder(a: EntryRef, b: EntryRef): number {
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  if (ta !== tb) return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
  return a.registrationId < b.registrationId ? -1 : a.registrationId > b.registrationId ? 1 : 0;
}

/**
 * THE RULE (§2BQ A): a player's earliest live entry in a paid division of the tournament is their 1st
 * entry; every later one is a next entry. Ordered by creation time, ties by id.
 *
 * `entries` are the player's live paid entries. `target` is the entry being priced - it is always
 * counted even if missing from `entries` (a partner still invited onto it). A null target means an
 * entry that does not exist yet, which is by definition the newest: it is a next entry whenever the
 * player already holds any live paid entry.
 */
export function isNextEntry(entries: readonly EntryRef[], target: EntryRef | null): boolean {
  if (!target) return entries.length > 0;
  const pool = entries.filter((e) => e.registrationId !== target.registrationId);
  if (pool.length === 0) return false;
  const earliest = [...pool, target].sort(entryOrder)[0]!;
  return earliest.registrationId !== target.registrationId;
}

export interface SeatQuote {
  /** Null for a seat with no player yet - priced as a 1st entry. */
  playerId: string | null;
  perPlayer: number;
  standardPerPlayer: number;
  basis: PriceBasis;
  earlyBirdEndsAt: string | null;
}

export interface SeatsQuote {
  seats: SeatQuote[];
  /** Sum of the seats - the whole-team amount. */
  total: number;
  /** How much less than every seat at standard price. */
  saved: number;
}

/**
 * Price every seat of a team on its own and add them up (§2BQ C): "1st entry PHP 1,500 + 2nd entry
 * PHP 1,000 = PHP 2,500". `seats` is one entry per seat in member order; pad with `{ playerId: null,
 * isNextEntry: false }` for a seat not yet filled.
 */
export function quoteSeats(
  base: Omit<FeeInput, 'isNextEntry' | 'teamSize'>,
  seats: readonly { playerId: string | null; isNextEntry: boolean }[],
  at: Date = new Date(),
): SeatsQuote {
  const quoted = seats.map((s): SeatQuote => {
    const q = quoteFee({ ...base, teamSize: 1, isNextEntry: s.isNextEntry }, at);
    return {
      playerId: s.playerId,
      perPlayer: q.perPlayer,
      standardPerPlayer: q.standardPerPlayer,
      basis: q.basis,
      earlyBirdEndsAt: q.earlyBirdEndsAt,
    };
  });
  const total = quoted.reduce((sum, s) => sum + s.perPlayer, 0);
  const standardTotal = quoted.reduce((sum, s) => sum + s.standardPerPlayer, 0);
  return { seats: quoted, total, saved: Math.max(0, standardTotal - total) };
}

/** "2nd entry" / "Early bird" - the one short tag a priced seat shows. Null for a standard price. */
export function priceBasisLabel(basis: string | null | undefined): string | null {
  if (basis === 'next_entry') return '2nd entry';
  if (basis === 'early_bird') return 'Early bird';
  return null;
}

/** A division's next-entry price is valid only when it is lower than the standard fee. */
export function isValidNextEntryFee(feeAmount: number, nextEntryFeeAmount: number | null): boolean {
  if (nextEntryFeeAmount == null) return true;
  return nextEntryFeeAmount >= 0 && nextEntryFeeAmount < feeAmount;
}

/** "PHP 1,500" - one formatter so every fee reads the same wherever it appears. */
export function formatFee(currency: string, amount: number): string {
  if (amount <= 0) return 'Free';
  return `${currency} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
