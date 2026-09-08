import { PH_TIME_ZONE } from '@vouchplay/core';

/**
 * Deterministic date formatting for server-rendered UI, in Philippine time.
 *
 * Two reasons the locale and timezone are pinned rather than left to the runtime: bare `toLocale*`
 * calls format in the host's own locale/timezone, so the server (UTC) and the browser can disagree
 * and trip a React hydration mismatch (error #418); and the audience is in the Philippines, so every
 * displayed time must be PH time regardless of where it is rendered or who is travelling.
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

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', DATE_OPTS);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', DATETIME_OPTS);
}
