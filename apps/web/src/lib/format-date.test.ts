import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatMonthDay,
  formatMonthYear,
  formatShortMonthYear,
} from './format-date';

/**
 * Every case below uses an instant that falls on a DIFFERENT calendar day in UTC than in Manila.
 * 2026-08-31T17:00:00Z is 1 September 2026, 1:00 AM in Manila. A bare `toLocale*` on a UTC runtime
 * (Vercel) renders "Aug 31"; the pinned formatters must render September. That is the exact live
 * defect this module exists to prevent, so a regression fails here rather than shipping quietly.
 */
const CROSSES_MIDNIGHT = '2026-08-31T17:00:00Z';

describe('formatters are pinned to Philippine time', () => {
  it('formatDate rolls to the Manila calendar day', () => {
    expect(formatDate(CROSSES_MIDNIGHT)).toBe('Sep 1, 2026');
  });

  it('formatDateTime shows the Manila wall clock', () => {
    // ICU separates the date and time with either ', ' or ' at ' depending on its version, so the
    // assertion pins the calendar day and the wall clock rather than the separator.
    expect(formatDateTime(CROSSES_MIDNIGHT)).toMatch(/^Sep 1, 2026(,|\sat)\s1:00\sAM$/);
  });

  it('formatMonthDay rolls to the Manila calendar day', () => {
    expect(formatMonthDay(CROSSES_MIDNIGHT)).toBe('Sep 1');
  });

  it('formatMonthYear rolls to the Manila month', () => {
    expect(formatMonthYear(CROSSES_MIDNIGHT)).toBe('September 2026');
  });

  it('formatShortMonthYear rolls to the Manila month', () => {
    expect(formatShortMonthYear(CROSSES_MIDNIGHT)).toBe('Sep 2026');
  });
});

describe('formatters are safe on bad input', () => {
  it.each([null, undefined, '', 'not a date'])('returns an empty string for %p', (value) => {
    expect(formatDate(value as string | null | undefined)).toBe('');
    expect(formatDateTime(value as string | null | undefined)).toBe('');
    expect(formatMonthDay(value as string | null | undefined)).toBe('');
    expect(formatMonthYear(value as string | null | undefined)).toBe('');
    expect(formatShortMonthYear(value as string | null | undefined)).toBe('');
  });
});
