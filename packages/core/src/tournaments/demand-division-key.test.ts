import { describe, it, expect } from 'vitest';
import {
  demandKeyForDivision,
  isDivisionDemandKey,
  demandKeyMatchesDivision,
} from './demand-division-key';
import { isTournamentDemandDivision } from './demand-interest';

const ID = '9f8b2c1d-4e5a-4b6c-8d7e-0a1b2c3d4e5f';
const KEY = 'div_9f8b2c1d4e5a4b6c8d7e0a1b2c3d4e5f';

describe('demandKeyForDivision', () => {
  it('strips hyphens and prefixes the id', () => {
    expect(demandKeyForDivision(ID)).toBe(KEY);
  });

  it('accepts uppercase and surrounding space', () => {
    expect(demandKeyForDivision(`  ${ID.toUpperCase()}  `)).toBe(KEY);
  });

  it('rejects a malformed id', () => {
    expect(demandKeyForDivision('not-a-uuid')).toBeNull();
    expect(demandKeyForDivision('')).toBeNull();
  });

  it('produces a key the database pattern accepts', () => {
    expect(KEY).toMatch(/^[a-z0-9_]{3,64}$/);
  });
});

describe('isDivisionDemandKey', () => {
  it('recognises its own keys and nothing else', () => {
    expect(isDivisionDemandKey(KEY)).toBe(true);
    expect(isDivisionDemandKey('beginner_men')).toBe(false);
    expect(isDivisionDemandKey('div_short')).toBe(false);
  });

  it('never collides with the fixed planning taxonomy', () => {
    expect(isTournamentDemandDivision(KEY)).toBe(false);
    expect(isDivisionDemandKey('advanced_mixed')).toBe(false);
  });
});

describe('demandKeyMatchesDivision', () => {
  it('matches only the division it was built from', () => {
    expect(demandKeyMatchesDivision(KEY, ID)).toBe(true);
    expect(demandKeyMatchesDivision(KEY, '00000000-0000-4000-8000-000000000000')).toBe(false);
    expect(demandKeyMatchesDivision('beginner_men', ID)).toBe(false);
  });
});
