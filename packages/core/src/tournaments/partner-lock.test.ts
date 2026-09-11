import { describe, expect, it } from 'vitest';
import {
  isPartnerLockPassed,
  partnerLockEffectiveAt,
  PARTNER_LOCK_DEFAULT_DAYS,
} from './partner-lock';

const START = '2026-10-16T00:00:00Z';

describe('partnerLockEffectiveAt', () => {
  it('uses the organizer-set explicit lock when one is present', () => {
    expect(partnerLockEffectiveAt(START, '2026-10-01T00:00:00Z')).toBe('2026-10-01T00:00:00.000Z');
  });

  it('defaults to exactly PARTNER_LOCK_DEFAULT_DAYS before the start date', () => {
    expect(PARTNER_LOCK_DEFAULT_DAYS).toBe(7);
    expect(partnerLockEffectiveAt(START, null)).toBe('2026-10-09T00:00:00.000Z');
  });

  it('the explicit lock wins even when it falls after the default would', () => {
    expect(partnerLockEffectiveAt(START, '2026-10-15T00:00:00Z')).toBe('2026-10-15T00:00:00.000Z');
  });

  it('is null when neither a start date nor an explicit lock is set', () => {
    expect(partnerLockEffectiveAt(null, null)).toBeNull();
  });

  it('falls back to the default when the explicit lock fails to parse', () => {
    expect(partnerLockEffectiveAt(START, 'not-a-date')).toBe('2026-10-09T00:00:00.000Z');
  });

  it('is null when the start date fails to parse and there is no explicit lock', () => {
    expect(partnerLockEffectiveAt('not-a-date', null)).toBeNull();
  });
});

describe('isPartnerLockPassed', () => {
  it('is false before the lock', () => {
    expect(isPartnerLockPassed('2026-10-08T23:59:59Z', START, null)).toBe(false);
  });

  it('is true at the exact boundary (now == lock)', () => {
    expect(isPartnerLockPassed('2026-10-09T00:00:00.000Z', START, null)).toBe(true);
  });

  it('is true after the lock', () => {
    expect(isPartnerLockPassed('2026-10-10T00:00:00Z', START, null)).toBe(true);
  });

  it('respects an explicit lock over the default', () => {
    expect(isPartnerLockPassed('2026-10-02T00:00:00Z', START, '2026-10-01T00:00:00Z')).toBe(true);
    expect(isPartnerLockPassed('2026-10-02T00:00:00Z', START, '2026-10-03T00:00:00Z')).toBe(false);
  });

  it('fails open (false) when there is no effective lock to have passed', () => {
    expect(isPartnerLockPassed('2026-10-10T00:00:00Z', null, null)).toBe(false);
  });

  it('fails open (false) when `now` itself does not parse', () => {
    expect(isPartnerLockPassed('not-a-date', START, null)).toBe(false);
  });
});
