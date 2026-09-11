/**
 * Rolling-limit arithmetic (handover §10.3, master_plan §2AJ). Pure so it is unit-testable and shared
 * by the vouch and vouch-request actions.
 */

/**
 * The cap that actually applies to one actor. Every limit uses the same convention: `0` (or less) means
 * "no cap". A newcomer's cap applies only when it is STRICTER than the global one, so an admin who has
 * set a tight global cap is never loosened by the newcomer default, and an admin who runs unlimited for
 * established players (the launch setting) still gets the newcomer cap on new accounts.
 */
export function effectiveVouchLimit(globalLimit: number, newcomerLimit: number): number {
  const positives = [globalLimit, newcomerLimit].filter((n) => Number.isFinite(n) && n > 0);
  if (positives.length === 0) return 0;
  return Math.min(...positives);
}
