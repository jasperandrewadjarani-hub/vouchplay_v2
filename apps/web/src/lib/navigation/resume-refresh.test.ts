import { describe, expect, it } from 'vitest';
import { RESUME_IDLE_MS, shouldRefreshOnResume } from './resume-refresh';

describe('resume refresh policy', () => {
  it('refreshes once after a meaningful hidden interval', () => {
    expect(
      shouldRefreshOnResume({
        now: 100_000,
        hiddenAt: 100_000 - RESUME_IDLE_MS,
        lastRefreshAt: null,
        persistedRestore: false,
      }),
    ).toBe(true);
  });

  it('does not refresh for an ordinary short focus/visibility change', () => {
    expect(
      shouldRefreshOnResume({
        now: 100_000,
        hiddenAt: 99_999,
        lastRefreshAt: null,
        persistedRestore: false,
      }),
    ).toBe(false);
  });

  it('refreshes a persisted restore but deduplicates overlapping browser events', () => {
    expect(
      shouldRefreshOnResume({
        now: 100_000,
        hiddenAt: null,
        lastRefreshAt: null,
        persistedRestore: true,
      }),
    ).toBe(true);
    expect(
      shouldRefreshOnResume({
        now: 100_001,
        hiddenAt: 0,
        lastRefreshAt: 100_000,
        persistedRestore: true,
      }),
    ).toBe(false);
  });
});
