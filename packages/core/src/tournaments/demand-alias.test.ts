import { describe, expect, it } from 'vitest';
import { legacyDemandAliases, mergeDemandCounts, type DemandDivisionShape } from './demand-alias';

const div = (
  key: string,
  skillBandKey: string | null,
  sex: string,
  hasAgeFloor = false,
): DemandDivisionShape => ({ key, skillBandKey, sex, hasAgeFloor });

/** The B-Steel Hermosa 2026 shape that surfaced this bug: single-band divisions plus 45+ divisions. */
const HERMOSA: DemandDivisionShape[] = [
  div('div_b1m', 'beginner', 'men'),
  div('div_b1w', 'beginner', 'women'),
  div('div_b1x', 'beginner', 'mixed'),
  div('div_n2m', 'novice', 'men'),
  div('div_n2w', 'novice', 'women'),
  div('div_n2x', 'novice', 'mixed'),
  div('div_l3m', 'low_intermediate', 'men'),
  div('div_l3w', 'low_intermediate', 'women'),
  div('div_age_men', null, 'men', true),
  div('div_age_mixed', null, 'mixed', true),
];

describe('legacyDemandAliases', () => {
  it('folds a taxonomy key onto the single division that means the same thing', () => {
    const aliases = legacyDemandAliases(['novice_men', 'low_intermediate_women'], HERMOSA);
    expect(aliases).toEqual({ novice_men: 'div_n2m', low_intermediate_women: 'div_l3w' });
  });

  it('matches an age key on the age floor and category, not the exact age bracket', () => {
    // The taxonomy only offers 50+; the organizer configured 45+. The planning signal is the same.
    expect(legacyDemandAliases(['age_50_plus_men'], HERMOSA)).toEqual({
      age_50_plus_men: 'div_age_men',
    });
  });

  it('leaves a key alone when the organizer has no matching division', () => {
    // No advanced division and no women's age division exist for this event.
    expect(legacyDemandAliases(['advanced_men', 'age_50_plus_women'], HERMOSA)).toEqual({});
  });

  it('refuses to guess when more than one division could match', () => {
    const ambiguous = [div('div_a', 'novice', 'men'), div('div_b', 'novice', 'men')];
    expect(legacyDemandAliases(['novice_men'], ambiguous)).toEqual({});
  });

  it('never maps a skill key onto an age division, or an age key onto a skill division', () => {
    const ageOnly = [div('div_age_men', null, 'men', true)];
    expect(legacyDemandAliases(['novice_men'], ageOnly)).toEqual({});
    const skillOnly = [div('div_n2m', 'novice', 'men')];
    expect(legacyDemandAliases(['age_50_plus_men'], skillOnly)).toEqual({});
  });

  it('ignores keys that are not taxonomy-shaped, including division keys themselves', () => {
    expect(legacyDemandAliases(['div_n2m', 'legacy_unspecified'], HERMOSA)).toEqual({});
  });
});

describe('mergeDemandCounts', () => {
  it('sums a legacy count into its division and drops the legacy row', () => {
    const merged = mergeDemandCounts({ novice_men: 6, div_n2m: 1 }, { novice_men: 'div_n2m' });
    expect(merged).toEqual({ div_n2m: 7 });
  });

  it('passes unaliased keys through untouched', () => {
    expect(mergeDemandCounts({ advanced_men: 2, legacy_unspecified: 1 }, {})).toEqual({
      advanced_men: 2,
      legacy_unspecified: 1,
    });
  });

  it('preserves the total number of recorded interests', () => {
    const counts = { novice_men: 6, novice_women: 4, div_n2m: 1, advanced_men: 2 };
    const aliases = { novice_men: 'div_n2m', novice_women: 'div_n2w' };
    const total = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(total(mergeDemandCounts(counts, aliases))).toBe(total(counts));
  });
});
