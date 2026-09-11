import { describe, expect, it } from 'vitest';
import { PH_CITIES, isValidPhCity, normalizeCity } from './ph-cities';

/**
 * Every real city/municipality currently present in the live directory data. Strict validation must
 * never reject one of these (that would block a legitimate resident at signup). Forms match the
 * canonical `PH_CITIES` display spelling (cities keep their "<Name> City" form).
 */
const LIVE_DATA_PLACES = [
  'Zamboanga City',
  'Isabela City',
  'Lamitan City',
  'Dumaguete City',
  'Jolo',
  'Santo Tomas',
  'Valenzuela City',
  'Cotabato City',
  'Dipolog City',
  'Toledo City',
  'Titay',
] as const;

describe('PH_CITIES', () => {
  it('is deduplicated and alphabetically sorted', () => {
    const sorted = [...PH_CITIES].sort((a, b) => a.localeCompare(b));
    expect(PH_CITIES).toEqual(sorted);
    expect(new Set(PH_CITIES).size).toBe(PH_CITIES.length);
  });

  it('covers the complete PH cities+municipalities set (~1,600 places, deduped to ~1,400 names)', () => {
    // The PSGC lists ~1,630 cities+municipalities, but many municipalities share a name across
    // provinces (dozens of "Santa Cruz", "San Isidro", etc.), so a genuine flat, de-duplicated name
    // list is smaller (currently 1423). A resident of any same-named place still validates. The range
    // is generous so a later one-line addition of a newly-created place does not break this test.
    expect(PH_CITIES.length).toBeGreaterThanOrEqual(1400);
    expect(PH_CITIES.length).toBeLessThanOrEqual(1600);
  });

  it('includes every place present in the live directory data', () => {
    for (const place of LIVE_DATA_PLACES) {
      expect(PH_CITIES).toContain(place);
    }
  });

  it('does not include provinces or garbage as if they were cities', () => {
    for (const notACity of [
      'Za',
      'Bulacan',
      'Zamboanga Sibugay',
      'Zamboanga del Sur',
      'Cotabato',
    ]) {
      expect(PH_CITIES).not.toContain(notACity);
    }
  });
});

describe('normalizeCity - maps live-data spellings onto canonical list members', () => {
  it.each([
    ['Zamboanga', 'Zamboanga City'],
    ['zamboanga city', 'Zamboanga City'],
    ['ZAMBOANGA CITY', 'Zamboanga City'],
    ['City of Zamboanga', 'Zamboanga City'],
    ['Zamboaga city', 'Zamboanga City'], // typo: missing "n"
    ['Zamboanga i', 'Zamboanga City'], // truncated typo
    ['Dumaguete', 'Dumaguete City'],
    ['Dipolog', 'Dipolog City'],
    ['Toledo', 'Toledo City'],
    ['Toledo City', 'Toledo City'],
    ['valenzuela', 'Valenzuela City'],
    ['Isabella city', 'Isabela City'], // typo: extra "l"
    ['Isabela city basilan', 'Isabela City'],
    ['Isabela basilan', 'Isabela City'],
    ['City of Lamitan', 'Lamitan City'],
    ['santo tomas', 'Santo Tomas'],
    ['Sto tomas', 'Santo Tomas'],
    ['Sto.tomas', 'Santo Tomas'],
    ['jolo', 'Jolo'],
    ['COTABATO', 'Cotabato City'],
  ])('normalizeCity(%o) === %o', (input, expected) => {
    expect(normalizeCity(input)).toBe(expected);
  });
});

describe('normalizeCity - purity and idempotence', () => {
  it('returns "" only for null/undefined/blank input', () => {
    expect(normalizeCity(null)).toBe('');
    expect(normalizeCity(undefined)).toBe('');
    expect(normalizeCity('   ')).toBe('');
  });

  it('never blanks a non-empty input - unknown places survive, cleaned and Title-Cased', () => {
    expect(normalizeCity('some weird BARANGAY')).toBe('Some Weird Barangay');
    expect(normalizeCity('xyzzy')).not.toBe('');
    // Collapses internal whitespace, then resolves onto the canonical city entry.
    expect(normalizeCity('  General   Santos  ')).toBe('General Santos City');
    expect(normalizeCity('lapu-lapu')).toBe('Lapu-Lapu City');
  });

  it('is idempotent for a spread of messy inputs', () => {
    for (const input of [
      'Zamboanga',
      'City of Zamboanga',
      'Zamboaga city',
      'Isabella city',
      'Toledo',
      'valenzuela',
      'Sto.tomas',
      'some weird BARANGAY',
      'xyzzy',
      'lapu-lapu',
    ]) {
      const once = normalizeCity(input);
      expect(normalizeCity(once)).toBe(once);
    }
  });

  it('is idempotent (round-trips to itself) for every canonical PH_CITIES entry', () => {
    for (const city of PH_CITIES) {
      expect(normalizeCity(city)).toBe(city);
      expect(normalizeCity(normalizeCity(city))).toBe(city);
    }
  });
});

describe('isValidPhCity', () => {
  it('is true for every place in the live directory data', () => {
    for (const place of LIVE_DATA_PLACES) {
      expect(isValidPhCity(place)).toBe(true);
    }
  });

  it('is true for messy-but-real spellings (case / suffix / typo tolerant)', () => {
    for (const input of [
      'DAVAO CITY',
      'jolo',
      'Zamboanga',
      'City of Zamboanga',
      'Isabella city',
      'valenzuela',
      'santo tomas',
      'Titay',
    ]) {
      expect(isValidPhCity(input)).toBe(true);
    }
  });

  it('is true for every canonical PH_CITIES entry', () => {
    for (const city of PH_CITIES) {
      expect(isValidPhCity(city)).toBe(true);
    }
  });

  it('is false for garbage, provinces, and empty input', () => {
    for (const bad of ['Za', '', '   ', 'Bulacan', 'Xyzzy', 'Zamboanga Sibugay', null, undefined]) {
      expect(isValidPhCity(bad)).toBe(false);
    }
  });
});
