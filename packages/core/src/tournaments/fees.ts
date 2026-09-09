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
}

export interface FeeQuote {
  /** What each player pays. */
  perPlayer: number;
  /** What the team sends in total. */
  teamTotal: number;
  /** True when the early-bird price is the one being charged right now. */
  earlyBirdApplied: boolean;
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
  const applies = windowOpen && early != null && early >= 0 && early < standard;
  const perPlayer = applies ? early : standard;
  return {
    perPlayer,
    teamTotal: perPlayer * size,
    earlyBirdApplied: applies,
    standardPerPlayer: standard,
    earlyBirdEndsAt: applies ? (input.earlyBirdEndsAt ?? null) : null,
  };
}

/** "PHP 1,500" - one formatter so every fee reads the same wherever it appears. */
export function formatFee(currency: string, amount: number): string {
  if (amount <= 0) return 'Free';
  return `${currency} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
