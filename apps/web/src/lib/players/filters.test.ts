import { describe, it, expect } from 'vitest';
import {
  activeFilterCount,
  buildCityOptions,
  clampSts,
  clearFilter,
  describeActiveFilters,
  effectiveSkillOrdinal,
  hasAnyFilter,
  idsMatchingSkillFilters,
  intersectIds,
  matchesSkill,
  matchesSts,
  normalizeCityKey,
  parsePlayerFilters,
  parseSkills,
  playerFiltersToQuery,
  type PlayerFilters,
  type SkillIndexEntry,
} from './filters';

describe('normalizeCityKey', () => {
  it('collapses the six real spellings of one city into one key', () => {
    const variants = [
      'Zamboanga',
      'Zamboanga City',
      'Zamboanga city',
      'zamboanga city',
      'zamboanga',
      'City of Zamboanga',
    ];
    const keys = new Set(variants.map(normalizeCityKey));
    expect([...keys]).toEqual(['zamboanga']);
  });

  it('keeps genuinely different cities apart', () => {
    expect(normalizeCityKey('Isabela City')).toBe('isabela');
    expect(normalizeCityKey('Valenzuela')).toBe('valenzuela');
    expect(normalizeCityKey('Isabela City')).not.toBe(normalizeCityKey('Zamboanga City'));
  });

  it('treats blank and missing as no city', () => {
    expect(normalizeCityKey(null)).toBe('');
    expect(normalizeCityKey(undefined)).toBe('');
    expect(normalizeCityKey('   ')).toBe('');
  });

  it('normalises internal whitespace', () => {
    expect(normalizeCityKey('  Zamboanga    City ')).toBe('zamboanga');
  });
});

describe('buildCityOptions', () => {
  it('groups spellings, counts every row, and labels with the most common spelling', () => {
    const options = buildCityOptions([
      'Zamboanga City',
      'Zamboanga City',
      'zamboanga',
      'Isabela City',
      null,
      '',
    ]);
    expect(options).toEqual([
      { key: 'zamboanga', label: 'Zamboanga City', count: 3 },
      { key: 'isabela', label: 'Isabela City', count: 1 },
    ]);
  });

  it('breaks a tie on spelling alphabetically so the label is deterministic', () => {
    const a = buildCityOptions(['Zamboanga', 'Zamboanga City']);
    const b = buildCityOptions(['Zamboanga City', 'Zamboanga']);
    expect(a[0]?.label).toBe(b[0]?.label);
    expect(a[0]?.label).toBe('Zamboanga');
  });

  it('orders by population, then alphabetically', () => {
    const options = buildCityOptions(['Cebu', 'Davao', 'Davao', 'Bacolod']);
    expect(options.map((o) => o.label)).toEqual(['Davao', 'Bacolod', 'Cebu']);
  });
});

describe('effectiveSkillOrdinal', () => {
  it('prefers the community rating over the self-rating', () => {
    expect(effectiveSkillOrdinal(2, 5)).toBe(2);
  });

  it('falls back to the self-rating when the community has not rated them', () => {
    expect(effectiveSkillOrdinal(null, 4)).toBe(4);
  });

  it('is null when nothing is known, and a null never matches a skill filter', () => {
    expect(effectiveSkillOrdinal(null, null)).toBeNull();
    expect(matchesSkill(null, [3])).toBe(false);
  });

  it('treats a community rating of 0 (Newbie) as a real rating, not as absent', () => {
    expect(effectiveSkillOrdinal(0, 6)).toBe(0);
  });
});

describe('matchesSkill / matchesSts', () => {
  it('matches everything when no bands are selected', () => {
    expect(matchesSkill(3, undefined)).toBe(true);
    expect(matchesSkill(null, [])).toBe(true);
  });

  it('matches only the selected bands', () => {
    expect(matchesSkill(3, [2, 3])).toBe(true);
    expect(matchesSkill(4, [2, 3])).toBe(false);
  });

  it('treats a minimum STS of 0 as no filter', () => {
    expect(matchesSts(null, 0)).toBe(true);
    expect(matchesSts(null, undefined)).toBe(true);
  });

  it('treats an unrated player as STS 0, matching the chip that renders 0.0', () => {
    expect(matchesSts(null, 0.5)).toBe(false);
    expect(matchesSts(undefined, 0.5)).toBe(false);
  });

  it('is inclusive at the boundary', () => {
    expect(matchesSts(3, 3)).toBe(true);
    expect(matchesSts(2.9, 3)).toBe(false);
  });
});

describe('idsMatchingSkillFilters', () => {
  const index: Record<string, SkillIndexEntry> = {
    a: { effectiveSkill: 2, sts: 4.7 },
    b: { effectiveSkill: 5, sts: 1.9 },
    c: { effectiveSkill: null, sts: 0 },
    d: { effectiveSkill: 2, sts: 0 },
  };

  it('returns null (unrestricted) when neither filter is active', () => {
    expect(idsMatchingSkillFilters(index, {})).toBeNull();
    expect(idsMatchingSkillFilters(index, { skills: [], minSts: 0 })).toBeNull();
  });

  it('filters by band', () => {
    expect(idsMatchingSkillFilters(index, { skills: [2] })?.sort()).toEqual(['a', 'd']);
  });

  it('filters by minimum STS', () => {
    expect(idsMatchingSkillFilters(index, { minSts: 1.5 })?.sort()).toEqual(['a', 'b']);
  });

  it('applies both together, not either', () => {
    expect(idsMatchingSkillFilters(index, { skills: [2], minSts: 1.5 })).toEqual(['a']);
  });

  it('can legitimately return an empty list, which is not the same as unrestricted', () => {
    expect(idsMatchingSkillFilters(index, { skills: [6] })).toEqual([]);
  });
});

describe('intersectIds', () => {
  it('treats null as unrestricted on either side', () => {
    expect(intersectIds(null, null)).toBeNull();
    expect(intersectIds(['a'], null)).toEqual(['a']);
    expect(intersectIds(null, ['b'])).toEqual(['b']);
  });

  it('keeps only ids present in both', () => {
    expect(intersectIds(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual(['b', 'c']);
  });

  it('produces an empty list when nothing overlaps', () => {
    expect(intersectIds(['a'], ['b'])).toEqual([]);
  });
});

describe('parsePlayerFilters', () => {
  it('reads every filter off the URL', () => {
    const f = parsePlayerFilters({
      q: ' maria ',
      city: 'Zamboanga City',
      sex: 'female',
      skill: '3,2,2',
      minSts: '2.5',
      club: 'hermosa-club',
      identityVerified: '1',
      coach: '1',
      lookingForPartner: '1',
      openForSponsorship: '1',
      page: '3',
    });
    expect(f).toEqual({
      q: 'maria',
      city: 'zamboanga',
      sex: 'female',
      skills: [2, 3],
      minSts: 2.5,
      club: 'hermosa-club',
      identityVerified: true,
      coach: true,
      lookingForPartner: true,
      openForSponsorship: true,
      page: 3,
    });
  });

  it('rejects nonsense rather than throwing', () => {
    const f = parsePlayerFilters({ sex: 'other', skill: '9,abc', minSts: 'x', page: '-2' });
    expect(f.sex).toBeUndefined();
    expect(f.skills).toBeUndefined();
    expect(f.minSts).toBeUndefined();
    expect(f.page).toBe(1);
  });

  it('keeps old ?minSkill= links working by mapping to "that band and up"', () => {
    const f = parsePlayerFilters({ minSkill: '4' });
    expect(f.skills).toEqual([4, 5, 6]);
  });

  it('lets an explicit skill selection win over a legacy minSkill', () => {
    const f = parsePlayerFilters({ minSkill: '4', skill: '1' });
    expect(f.skills).toEqual([1]);
  });

  it('clamps and steps a hand-edited STS', () => {
    expect(parsePlayerFilters({ minSts: '900' }).minSts).toBe(5);
    expect(parsePlayerFilters({ minSts: '0.37' }).minSts).toBe(0.5);
    expect(parsePlayerFilters({ minSts: '-3' }).minSts).toBeUndefined();
  });

  it('takes the first value when a param is repeated', () => {
    expect(parsePlayerFilters({ sex: ['male', 'female'] }).sex).toBe('male');
  });
});

describe('clampSts', () => {
  it('rounds to the half step and clamps to 0..5', () => {
    expect(clampSts(3.26)).toBe(3.5);
    expect(clampSts(-1)).toBe(0);
    expect(clampSts(11)).toBe(5);
    expect(clampSts(Number.NaN)).toBe(0);
  });
});

describe('parseSkills', () => {
  it('sorts, de-duplicates and drops out-of-range ordinals', () => {
    expect(parseSkills('6,0,6,99,-1')).toEqual([0, 6]);
  });

  it('is undefined when nothing valid survives', () => {
    expect(parseSkills('abc')).toBeUndefined();
    expect(parseSkills('')).toBeUndefined();
  });
});

describe('playerFiltersToQuery', () => {
  it('round-trips through parsePlayerFilters', () => {
    const f: PlayerFilters = {
      q: 'maria',
      city: 'zamboanga',
      sex: 'female',
      skills: [2, 3],
      minSts: 2.5,
      club: 'hermosa-club',
      identityVerified: true,
      coach: false,
      lookingForPartner: true,
      openForSponsorship: false,
      page: 2,
    };
    const qs = playerFiltersToQuery(f);
    const parsed = parsePlayerFilters(Object.fromEntries(new URLSearchParams(qs.slice(1))));
    expect(parsed.q).toBe('maria');
    expect(parsed.city).toBe('zamboanga');
    expect(parsed.sex).toBe('female');
    expect(parsed.skills).toEqual([2, 3]);
    expect(parsed.minSts).toBe(2.5);
    expect(parsed.club).toBe('hermosa-club');
    expect(parsed.identityVerified).toBe(true);
    expect(parsed.coach).toBe(false);
    expect(parsed.page).toBe(2);
  });

  it('writes nothing for an empty filter set', () => {
    expect(playerFiltersToQuery({})).toBe('');
  });

  it('omits page 1 and only writes the non-default view', () => {
    expect(playerFiltersToQuery({}, { page: 1, compact: true })).toBe('');
    expect(playerFiltersToQuery({}, { page: 2, compact: false })).toBe('?view=detailed&page=2');
  });
});

describe('activeFilterCount / hasAnyFilter', () => {
  it('does not count the free-text search, which has its own visible box', () => {
    expect(activeFilterCount({ q: 'maria' })).toBe(0);
    expect(hasAnyFilter({ q: 'maria' })).toBe(true);
  });

  it('counts a whole band selection as one filter', () => {
    expect(activeFilterCount({ skills: [1, 2, 3] })).toBe(1);
  });

  it('ignores a zero STS and a false toggle', () => {
    expect(activeFilterCount({ minSts: 0, coach: false })).toBe(0);
  });

  it('adds up across kinds', () => {
    expect(
      activeFilterCount({ city: 'zamboanga', sex: 'male', minSts: 3, coach: true, club: 'x' }),
    ).toBe(5);
  });
});

describe('describeActiveFilters', () => {
  it('labels a city with its real spelling, not the normalised key', () => {
    const chips = describeActiveFilters(
      { city: 'zamboanga' },
      { cityOptions: [{ key: 'zamboanga', label: 'Zamboanga City', count: 3 }] },
    );
    expect(chips).toEqual([{ key: 'city', label: 'Zamboanga City' }]);
  });

  it('names one or two bands but summarises three or more', () => {
    expect(describeActiveFilters({ skills: [2, 3] })[0]?.label).toBe('Novice, Low Intermediate');
    expect(describeActiveFilters({ skills: [2, 3, 4] })[0]?.label).toBe('3 skill levels');
  });

  it('shows the STS threshold to one decimal, matching the chip on the card', () => {
    expect(describeActiveFilters({ minSts: 2.5 })[0]?.label).toBe('STS 2.5+');
  });

  it('includes the text search so it can be removed', () => {
    expect(describeActiveFilters({ q: 'maria' })[0]).toEqual({ key: 'q', label: '"maria"' });
  });

  it('falls back to the slug when a club is no longer in the options', () => {
    expect(describeActiveFilters({ club: 'gone-club' })[0]?.label).toBe('gone-club');
  });

  it('is empty when nothing is applied', () => {
    expect(describeActiveFilters({})).toEqual([]);
  });
});

describe('clearFilter', () => {
  const full: PlayerFilters = {
    q: 'maria',
    city: 'zamboanga',
    sex: 'male',
    skills: [2],
    minSts: 3,
    club: 'c',
    identityVerified: true,
    coach: true,
    lookingForPartner: true,
    openForSponsorship: true,
    page: 4,
  };

  it('removes exactly one filter and leaves the rest', () => {
    const next = clearFilter(full, 'city');
    expect(next.city).toBeUndefined();
    expect(next.sex).toBe('male');
    expect(activeFilterCount(next)).toBe(activeFilterCount(full) - 1);
  });

  it('clears the whole band selection at once', () => {
    expect(clearFilter(full, 'skills').skills).toBeUndefined();
  });

  it('turns a toggle off rather than deleting it', () => {
    expect(clearFilter(full, 'coach').coach).toBe(false);
  });

  it('always returns to page 1, because page 4 of a wider result is a different page', () => {
    expect(clearFilter(full, 'coach').page).toBe(1);
  });

  it('does not mutate the input', () => {
    clearFilter(full, 'city');
    expect(full.city).toBe('zamboanga');
  });
});
