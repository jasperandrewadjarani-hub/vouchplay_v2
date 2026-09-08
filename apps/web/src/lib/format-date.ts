/**
 * Deterministic date formatting for server-rendered UI. Bare `toLocaleDateString()` /
 * `toLocaleString()` format in the runtime's own locale and timezone, so the server (UTC/en-US) and
 * the client (the browser's locale) can produce different strings and trip a React hydration mismatch
 * (error #418). Pinning the locale and timezone keeps the server and client output identical.
 */

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
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
