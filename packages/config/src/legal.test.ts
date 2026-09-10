import { describe, it, expect } from 'vitest';
import { LEGAL, isCurrentLegalVersion } from './legal';

describe('isCurrentLegalVersion', () => {
  it('is true only for the exact current version', () => {
    expect(isCurrentLegalVersion(LEGAL.version)).toBe(true);
  });

  it('is false for an old, empty, or missing version (existing players must re-accept)', () => {
    expect(isCurrentLegalVersion('2020-01-01')).toBe(false);
    expect(isCurrentLegalVersion('')).toBe(false);
    expect(isCurrentLegalVersion(null)).toBe(false);
    expect(isCurrentLegalVersion(undefined)).toBe(false);
  });
});
