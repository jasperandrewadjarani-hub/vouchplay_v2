import { describe, expect, it } from 'vitest';
import { PH_CITIES, normalizeCity } from './ph-cities';

describe('PH_CITIES', () => {
  it('is deduplicated and alphabetically sorted', () => {
    const sorted = [...PH_CITIES].sort((a, b) => a.localeCompare(b));
    expect(PH_CITIES).toEqual(sorted);
    expect(new Set(PH_CITIES).size).toBe(PH_CITIES.length);
  });

  it('is a reasonable, genuine PH-place list (100-200 entries)', () => {
    expect(PH_CITIES.length).toBeGreaterThanOrEqual(100);
    expect(PH_CITIES.length).toBeLessThanOrEqual(200);
  });

  it('includes every place present in the live directory data', () => {
    for (const place of [
      'Zamboanga City',
      'Isabela City',
      'Lamitan City',
      'Dumaguete City',
      'Cotabato City',
      'Santo Tomas',
      'Toledo',
    ]) {
      expect(PH_CITIES).toContain(place);
    }
  });
});

describe('normalizeCity - Zamboanga City group (322 players, 8 spellings)', () => {
  it.each([
    'Zamboanga',
    'Zamboanga City',
    'Zamboanga city',
    'zamboanga city',
    'ZAMBOANGA CITY',
    'City of Zamboanga',
    'City Of Zamboanga',
    'Zamboaga city', // typo: missing "n"
    'Zamboanga i', // truncated typo
  ])('%s -> Zamboanga City', (input) => {
    expect(normalizeCity(input)).toBe('Zamboanga City');
  });
});

describe('normalizeCity - Isabela City group (12 players)', () => {
  it.each([
    'Isabela City',
    'Isabela city',
    'City Of Isabela',
    'City of Isabela',
    'Isabella city', // typo: extra "l"
    'Isabela city basilan',
    'Isabela basilan',
  ])('%s -> Isabela City', (input) => {
    expect(normalizeCity(input)).toBe('Isabela City');
  });
});

describe('normalizeCity - Lamitan City group (6 players)', () => {
  it.each(['Lamitan City', 'Lamitan city', 'lamitan city', 'City of Lamitan', 'Lamitan'])(
    '%s -> Lamitan City',
    (input) => {
      expect(normalizeCity(input)).toBe('Lamitan City');
    },
  );
});

describe('normalizeCity - Dumaguete City group (5 players)', () => {
  it.each(['Dumaguete City', 'Dumaguete city', 'Dumaguete', 'City of Dumaguete'])(
    '%s -> Dumaguete City',
    (input) => {
      expect(normalizeCity(input)).toBe('Dumaguete City');
    },
  );
});

describe('normalizeCity - remaining live typos/variants', () => {
  it('Sto.tomas -> Santo Tomas', () => {
    expect(normalizeCity('Sto.tomas')).toBe('Santo Tomas');
  });
  it('Sto tomas -> Santo Tomas', () => {
    expect(normalizeCity('Sto tomas')).toBe('Santo Tomas');
  });
  it('Santo tomas -> Santo Tomas', () => {
    expect(normalizeCity('Santo tomas')).toBe('Santo Tomas');
  });
  it('Toledo City -> Toledo', () => {
    expect(normalizeCity('Toledo City')).toBe('Toledo');
  });
  it('Toledo -> Toledo', () => {
    expect(normalizeCity('Toledo')).toBe('Toledo');
  });
  it('COTABATO -> Cotabato City', () => {
    expect(normalizeCity('COTABATO')).toBe('Cotabato City');
  });
  it('Zamboanga i -> Zamboanga City', () => {
    expect(normalizeCity('Zamboanga i')).toBe('Zamboanga City');
  });
});

describe('normalizeCity - alias map entries directly', () => {
  it.each([
    ['zamboaga', 'Zamboanga City'],
    ['zamboanga i', 'Zamboanga City'],
    ['isabella', 'Isabela City'],
    ['isabela basilan', 'Isabela City'],
    ['isabela city basilan', 'Isabela City'],
    ['sto tomas', 'Santo Tomas'],
    ['sto.tomas', 'Santo Tomas'],
    ['cotabato', 'Cotabato City'],
    ['toledo', 'Toledo'],
  ])('alias "%s" -> %s', (input, expected) => {
    expect(normalizeCity(input)).toBe(expected);
  });
});

describe('normalizeCity - unknown places survive, never blanked', () => {
  it('passes through an unrecognised place, cleaned and Title-Cased', () => {
    expect(normalizeCity('some weird BARANGAY')).toBe('Some Weird Barangay');
  });

  it('does not special-case the "Phase 13 City" test rows (left to the data script)', () => {
    expect(normalizeCity('Phase 13 City')).toBe('Phase 13');
  });

  it('never returns an empty string for non-empty input', () => {
    expect(normalizeCity('xyzzy')).not.toBe('');
  });

  it('returns "" only for null/undefined/blank input', () => {
    expect(normalizeCity(null)).toBe('');
    expect(normalizeCity(undefined)).toBe('');
    expect(normalizeCity('   ')).toBe('');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeCity('  General   Santos  ')).toBe('General Santos');
  });

  it('title-cases a hyphenated proper noun', () => {
    expect(normalizeCity('lapu-lapu')).toBe('Lapu-Lapu');
  });
});

describe('normalizeCity - idempotence', () => {
  it.each([
    'Zamboanga',
    'Zamboanga City',
    'City of Zamboanga',
    'Zamboaga city',
    'Isabella city',
    'Isabela city basilan',
    'Sto.tomas',
    'Toledo City',
    'COTABATO',
    'Phase 13 City',
    'some weird BARANGAY',
    'lapu-lapu',
    '  General   Santos  ',
  ])('normalizeCity(normalizeCity(%s)) === normalizeCity(%s)', (input) => {
    const once = normalizeCity(input);
    expect(normalizeCity(once)).toBe(once);
  });

  it('is idempotent for every canonical PH_CITIES entry', () => {
    for (const city of PH_CITIES) {
      expect(normalizeCity(city)).toBe(city);
      expect(normalizeCity(normalizeCity(city))).toBe(city);
    }
  });
});
