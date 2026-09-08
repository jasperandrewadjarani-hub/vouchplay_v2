/**
 * Philippine time (UTC+8) helpers.
 *
 * VouchPlay's audience is in the Philippines, so every date a person reads or types is PH time. Two
 * bugs made that unreliable before this module existed:
 *  - `datetime-local` inputs were parsed with `new Date(value)`, which resolves in the *runtime's*
 *    timezone. On Vercel (UTC) an organizer typing 5:00 PM stored 17:00Z, i.e. 1:26 AM the next day
 *    in Manila.
 *  - Display used bare `toLocale*` calls, so the server and the browser could format differently.
 *
 * The Philippines has had a fixed UTC+8 offset with no DST since 1978, so a constant offset is exact
 * and avoids depending on the host's timezone database for the input conversions.
 */

export const PH_TIME_ZONE = 'Asia/Manila';
export const PH_UTC_OFFSET_MINUTES = 8 * 60;

const MINUTE_MS = 60_000;
const INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * A `datetime-local` value the user typed as PH time -> a UTC ISO instant.
 * "2026-09-09T17:00" (5 PM Manila) -> "2026-09-09T09:00:00.000Z".
 */
export function phInputToIso(value: string): string | null {
  const m = INPUT_RE.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const asIfUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  if (Number.isNaN(asIfUtc)) return null;
  return new Date(asIfUtc - PH_UTC_OFFSET_MINUTES * MINUTE_MS).toISOString();
}

/** A date-only input typed as a PH calendar date -> the UTC instant of PH midnight that day. */
export function phDateInputToIso(value: string): string | null {
  const m = DATE_RE.exec(value.trim());
  if (!m) return null;
  return phInputToIso(`${value.trim()}T00:00`);
}

/** A stored UTC instant -> the `datetime-local` value showing PH time. */
export function isoToPhInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const ph = new Date(t + PH_UTC_OFFSET_MINUTES * MINUTE_MS);
  return (
    `${ph.getUTCFullYear()}-${pad(ph.getUTCMonth() + 1)}-${pad(ph.getUTCDate())}` +
    `T${pad(ph.getUTCHours())}:${pad(ph.getUTCMinutes())}`
  );
}

/** A stored UTC instant -> a `date` input value in PH time. */
export function isoToPhDateInput(iso: string | null | undefined): string {
  const full = isoToPhInput(iso);
  return full ? full.slice(0, 10) : '';
}
