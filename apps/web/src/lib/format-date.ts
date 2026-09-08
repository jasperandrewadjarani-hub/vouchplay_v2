import { PH_TIME_ZONE } from '@vouchplay/core';

/**
 * Deterministic date formatting for the whole app, in Philippine time.
 *
 * Two reasons the locale and timezone are pinned rather than left to the runtime: bare `toLocale*`
 * calls format in the host's own locale/timezone, so the server (UTC) and the browser can disagree
 * and trip a React hydration mismatch (error #418); and the audience is in the Philippines, so every
 * displayed time must be PH time regardless of where it is rendered or who is travelling.
 *
 * Every date a person reads comes from one of these helpers. If a call site needs a shape that is
 * not here, add it here rather than reaching for `toLocale*` in a component.
 */

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: PH_TIME_ZONE,
};

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  ...DATE_OPTS,
  hour: 'numeric',
  minute: '2-digit',
};

const MONTH_DAY_OPTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  timeZone: PH_TIME_ZONE,
};

const MONTH_YEAR_OPTS: Intl.DateTimeFormatOptions = {
  month: 'long',
  year: 'numeric',
  timeZone: PH_TIME_ZONE,
};

const SHORT_MONTH_YEAR_OPTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  year: 'numeric',
  timeZone: PH_TIME_ZONE,
};

function format(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', opts);
}

/** "Sep 8, 2026" */
export function formatDate(iso: string | null | undefined): string {
  return format(iso, DATE_OPTS);
}

/** "Sep 8, 2026, 5:00 PM" */
export function formatDateTime(iso: string | null | undefined): string {
  return format(iso, DATETIME_OPTS);
}

/** "Sep 8" - for lists where the year is obvious from context. */
export function formatMonthDay(iso: string | null | undefined): string {
  return format(iso, MONTH_DAY_OPTS);
}

/** "September 2026" */
export function formatMonthYear(iso: string | null | undefined): string {
  return format(iso, MONTH_YEAR_OPTS);
}

/** "Sep 2026" */
export function formatShortMonthYear(iso: string | null | undefined): string {
  return format(iso, SHORT_MONTH_YEAR_OPTS);
}
