/**
 * Partner lock-in (§2AM decision 5): the deadline after which partner invites, acceptances,
 * release requests and swaps stop - not because anyone is punished, but because a team's
 * composition needs to settle before the tournament runs. Declines still work after the lock
 * (nobody is forced to play with someone) and the organizer's own tools (confirm / reject / refund)
 * are untouched; this module only says WHEN the player-facing partner actions close.
 *
 * The effective lock is computed LIVE - `coalesce(partner_lock_at, start_at - 7 days)` - so an
 * organizer who moves the tournament's start date never carries a stale default forward. This is the
 * TypeScript twin of the `partner_lock_effective_at()` SQL function added in migration 0040, and the
 * two must agree.
 *
 * Pure, ISO in / ISO out, UTC. No `Date.now()` - `now` is always injected so the caller (and its
 * tests) control the clock.
 */

export const PARTNER_LOCK_DEFAULT_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The effective partner lock: the organizer's explicit `partnerLockAt` if they set one, otherwise
 * `PARTNER_LOCK_DEFAULT_DAYS` before the tournament's start date. Null when there is nothing to
 * compute from (no explicit lock and no start date, or either date fails to parse) - callers should
 * treat a null effective lock as "partner changes are open" (§2AM decision 5, fail-open).
 */
export function partnerLockEffectiveAt(
  startAt: string | null,
  partnerLockAt: string | null,
): string | null {
  if (partnerLockAt) {
    const explicit = Date.parse(partnerLockAt);
    if (!Number.isNaN(explicit)) return new Date(explicit).toISOString();
  }
  if (!startAt) return null;
  const start = Date.parse(startAt);
  if (Number.isNaN(start)) return null;
  return new Date(start - PARTNER_LOCK_DEFAULT_DAYS * MS_PER_DAY).toISOString();
}

/**
 * True once `now` is AT OR AFTER the effective lock. False when there is no effective lock to have
 * passed (fail-open, matching `partnerLockEffectiveAt`'s null case) or when `now` itself fails to
 * parse.
 */
export function isPartnerLockPassed(
  now: string,
  startAt: string | null,
  partnerLockAt: string | null,
): boolean {
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) return false;
  const effective = partnerLockEffectiveAt(startAt, partnerLockAt);
  if (!effective) return false;
  return nowMs >= Date.parse(effective);
}
