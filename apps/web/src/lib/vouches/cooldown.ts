/**
 * Human-friendly remaining-time for the vouch update cooldown (master_plan §2U). Returns a bare
 * duration phrase ("45 minutes", "3 hours", "2 days") so the caller can drop it into copy like
 * "You can change your vouch in {…}". Pure and unit-tested; rounds UP so it never tells someone the
 * wait is shorter than it is.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatVouchCooldown(ms: number): string {
  if (ms <= 0) return 'now';
  if (ms < MINUTE) return 'less than a minute';
  if (ms < HOUR) {
    const m = Math.ceil(ms / MINUTE);
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  if (ms < DAY) {
    const h = Math.ceil(ms / HOUR);
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  const d = Math.ceil(ms / DAY);
  return `${d} day${d === 1 ? '' : 's'}`;
}
