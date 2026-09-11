import { describe, it, expect } from 'vitest';
import {
  activeFilterCount,
  buildCityOptions,
  clampSts,
  clampVouches,
  clearFilter,
  describeActiveFilters,
  effectiveSkillOrdinal,
  hasAnyFilter,
  idsMatchingIndexFilters,
  inRange,
  intersectIds,
  matchesSkill,
  matchesSts,
  normalizeCityKey,
  orderIdsForSort,
  parsePlayerFilters,
  parseSkills,
  playerFiltersToQuery,
  resolveSort,
  type PlayerFilters,
  type SkillIndexEntry,
  type SortableRow,
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

describe('matchesSkill / matchesSts / inRange', () => {
  it('matches everything when no bands are selected', () => {
    expect(matchesSkill(3, undefined)).toBe(true);
    expect(matchesSkill(null, [])).toBe(true);
  });

  it('matches only the selected bands', () => {
    expect(matchesSkill(3, [2, 3])).toBe(true);
    expect(matchesSkill(4, [2, 3])).toBe(false);
  });

  it('treats a minimum STS of 0 as no filter (legacy single-sided helper)', () => {
    expect(matchesSts(null, 0)).toBe(true);
    expect(matchesSts(null, undefined)).toBe(true);
  });

  it('is inclusive at the boundary (legacy single-sided helper)', () => {
    expect(matchesSts(3, 3)).toBe(true);
    expect(matchesSts(2.9, 3)).toBe(false);
  });

  it('inRange has no limit on an absent side', () => {
    expect(inRange(5, undefined, undefined)).toBe(true);
    expect(inRange(5, 10, undefined)).toBe(false);
    expect(inRange(5, undefined, 4)).toBe(false);
  });

  it('inRange is inclusive on both bounds', () => {
    expect(inRange(3, 3, 3)).toBe(true);
    expect(inRange(2.9, 3, undefined)).toBe(false);
  });
});

describe('idsMatchingIndexFilters', () => {
  const index: Record<string, SkillIndexEntry> = {
    a: {
      effectiveSkill: 2,
      sts: 4.7,
      vouchesReceived: 10,
      vouchesGiven: 2,
      onboardedAt: '2026-01-01',
      displayName: 'Ana',
    },
    b: {
      effectiveSkill: 5,
      sts: 1.9,
      vouchesReceived: 0,
      vouchesGiven: 30,
      onboardedAt: '2026-02-01',
      displayName: 'Bea',
    },
    c: {
      effectiveSkill: null,
      sts: 0,
      vouchesReceived: 0,
      vouchesGiven: 0,
      onboardedAt: '2026-03-01',
      displayName: 'Cy',
    },
    d: {
      effectiveSkill: 2,
      sts: 0,
      vouchesReceived: 5,
      vouchesGiven: 0,
      onboardedAt: '2026-04-01',
      displayName: 'Dan',
    },
  };

  it('returns null (unrestricted) when nothing in this group is active', () => {
    expect(idsMatchingIndexFilters(index, {})).toBeNull();
    expect(idsMatchingIndexFilters(index, { skills: [] })).toBeNull();
  });

  it('filters by band', () => {
    expect(idsMatchingIndexFilters(index, { skills: [2] })?.sort()).toEqual(['a', 'd']);
  });

  it('filters by STS range - lower bound only', () => {
    expect(idsMatchingIndexFilters(index, { stsMin: 1.5 })?.sort()).toEqual(['a', 'b']);
  });

  it('filters by STS range - upper bound only', () => {
    expect(idsMatchingIndexFilters(index, { stsMax: 2 })?.sort()).toEqual(['b', 'c', 'd']);
  });

  it('filters by STS range - both bounds', () => {
    expect(idsMatchingIndexFilters(index, { stsMin: 1, stsMax: 2 })).toEqual(['b']);
  });

  it('filters by vouches-received range', () => {
    expect(idsMatchingIndexFilters(index, { vouchesMin: 1, vouchesMax: 6 })).toEqual(['d']);
    expect(idsMatchingIndexFilters(index, { vouchesMin: 1, vouchesMax: 20 })?.sort()).toEqual([
      'a',
      'd',
    ]);
  });

  it('filters by vouches-given range', () => {
    expect(idsMatchingIndexFilters(index, { givenMin: 5 })?.sort()).toEqual(['b']);
  });

  it('applies every active kind together, not either', () => {
    expect(idsMatchingIndexFilters(index, { skills: [2], stsMax: 1 })).toEqual(['d']);
  });

  it('can legitimately return an empty list, which is not the same as unrestricted', () => {
    expect(idsMatchingIndexFilters(index, { skills: [6] })).toEqual([]);
  });
});

describe('orderIdsForSort', () => {
  const rows: SortableRow[] = [
    { id: 'a', onboardedAt: '2026-01-01T00:00:00Z', displayName: 'Zed' },
    { id: 'b', onboardedAt: '2026-03-01T00:00:00Z', displayName: 'Ana' },
    { id: 'c', onboardedAt: '2026-02-01T00:00:00Z', displayName: 'Mia' },
  ];
  const index: Record<string, SkillIndexEntry> = {
    a: {
      effectiveSkill: null,
      sts: 4.0,
      vouchesReceived: 10,
      vouchesGiven: 0,
      onboardedAt: '2026-01-01T00:00:00Z',
      displayName: 'Zed',
    },
    b: {
      effectiveSkill: null,
      sts: 1.0,
      vouchesReceived: 0,
      vouchesGiven: 0,
      onboardedAt: '2026-03-01T00:00:00Z',
      displayName: 'Ana',
    },
    c: {
      effectiveSkill: null,
      sts: 2.5,
      vouchesReceived: 3,
      vouchesGiven: 0,
      onboardedAt: '2026-02-01T00:00:00Z',
      displayName: 'Mia',
    },
  };

  it('new_unvouched: zero-vouch players first, then most-recently-onboarded', () => {
    expect(orderIdsForSort(rows, index, 'new_unvouched')).toEqual(['b', 'c', 'a']);
  });

  it('treats a player missing from the index as unvouched (safe default)', () => {
    expect(orderIdsForSort(rows, {}, 'new_unvouched')).toEqual(['b', 'c', 'a']);
  });

  it('newest / oldest: by onboarded date', () => {
    expect(orderIdsForSort(rows, index, 'newest')).toEqual(['b', 'c', 'a']);
    expect(orderIdsForSort(rows, index, 'oldest')).toEqual(['a', 'c', 'b']);
  });

  it('name: alphabetical by display name', () => {
    expect(orderIdsForSort(rows, index, 'name')).toEqual(['b', 'c', 'a']);
  });

  it('most_vouched: by vouches received, descending', () => {
    expect(orderIdsForSort(rows, index, 'most_vouched')).toEqual(['a', 'c', 'b']);
  });

  it('sts_desc: by STS, descending (staff-only sort - gating happens at parse/query time)', () => {
    expect(orderIdsForSort(rows, index, 'sts_desc')).toEqual(['a', 'c', 'b']);
  });
});

describe('resolveSort', () => {
  it('defaults to new_unvouched for an absent or unknown value', () => {
    expect(resolveSort(undefined, false)).toBe('new_unvouched');
    expect(resolveSort('nonsense', true)).toBe('new_unvouched');
  });

  it('allows every public sort for anyone', () => {
    for (const s of ['new_unvouched', 'newest', 'oldest', 'name', 'most_vouched']) {
      expect(resolveSort(s, false)).toBe(s);
      expect(resolveSort(s, true)).toBe(s);
    }
  });

  it('gates sts_desc to staff only (D3, §8.4)', () => {
    expect(resolveSort('sts_desc', true)).toBe('sts_desc');
    expect(resolveSort('sts_desc', false)).toBe('new_unvouched');
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
      stsMin: '2.5',
      stsMax: '4',
      vouchesMin: '3',
      vouchesMax: '20',
      givenMin: '1',
      givenMax: '10',
      club: 'hermosa-club',
      identityVerified: '1',
      coach: '1',
      lookingForPartner: '1',
      openForSponsorship: '1',
      new: '1',
      tournament: 'tourney-1',
      page: '3',
    });
    expect(f).toEqual({
      q: 'maria',
      city: 'zamboanga',
      sex: 'female',
      skills: [2, 3],
      stsMin: 2.5,
      stsMax: 4,
      vouchesMin: 3,
      vouchesMax: 20,
      givenMin: 1,
      givenMax: 10,
      club: 'hermosa-club',
      identityVerified: true,
      coach: true,
      lookingForPartner: true,
      openForSponsorship: true,
      newOnly: true,
      tournament: 'tourney-1',
      sort: 'new_unvouched',
      page: 3,
    });
  });

  it('rejects nonsense rather than throwing', () => {
    const f = parsePlayerFilters({ sex: 'other', skill: '9,abc', stsMin: 'x', page: '-2' });
    expect(f.sex).toBeUndefined();
    expect(f.skills).toBeUndefined();
    expect(f.stsMin).toBeUndefined();
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

  it('keeps the old single-thumb ?minSts= link working as the new lower bound', () => {
    expect(parsePlayerFilters({ minSts: '3' }).stsMin).toBe(3);
    expect(parsePlayerFilters({ minSts: '3' }).stsMax).toBeUndefined();
  });

  it('lets an explicit stsMin win over a legacy minSts', () => {
    expect(parsePlayerFilters({ minSts: '3', stsMin: '1' }).stsMin).toBe(1);
  });

  it('clamps and steps a hand-edited STS range', () => {
    expect(parsePlayerFilters({ stsMin: '900' }).stsMin).toBe(5);
    expect(parsePlayerFilters({ stsMin: '0.37' }).stsMin).toBe(0.5);
    expect(parsePlayerFilters({ stsMin: '-3' }).stsMin).toBeUndefined();
    expect(parsePlayerFilters({ stsMax: '3.26' }).stsMax).toBe(3.5);
    // stsMax=0 is a real, narrow bound ("at most 0.0") - NOT the same as "no upper bound" - so it
    // survives, unlike stsMax at the ceiling (covered by the next test).
    expect(parsePlayerFilters({ stsMax: '0' }).stsMax).toBe(0);
  });

  it('drops a range side that does not narrow the full span', () => {
    expect(parsePlayerFilters({ stsMax: '5' }).stsMax).toBeUndefined();
    expect(parsePlayerFilters({ vouchesMax: '50' }).vouchesMax).toBeUndefined();
    expect(parsePlayerFilters({ vouchesMin: '0' }).vouchesMin).toBeUndefined();
  });

  it('clamps and steps a hand-edited vouches range', () => {
    expect(parsePlayerFilters({ vouchesMin: '-5' }).vouchesMin).toBeUndefined();
    expect(parsePlayerFilters({ vouchesMax: '9000' }).vouchesMax).toBeUndefined();
    expect(parsePlayerFilters({ vouchesMax: '30.6' }).vouchesMax).toBe(31);
  });

  it('takes the first value when a param is repeated', () => {
    expect(parsePlayerFilters({ sex: ['male', 'female'] }).sex).toBe('male');
  });

  it('defaults sort to new_unvouched and never allows sts_desc for a non-staff parse', () => {
    expect(parsePlayerFilters({}).sort).toBe('new_unvouched');
    expect(parsePlayerFilters({ sort: 'sts_desc' }).sort).toBe('new_unvouched');
    expect(parsePlayerFilters({ sort: 'sts_desc' }, { staff: false }).sort).toBe('new_unvouched');
  });

  it('allows sts_desc only when the parser is told the viewer is staff', () => {
    expect(parsePlayerFilters({ sort: 'sts_desc' }, { staff: true }).sort).toBe('sts_desc');
  });

  it('allows every public sort regardless of staff', () => {
    expect(parsePlayerFilters({ sort: 'most_vouched' }).sort).toBe('most_vouched');
    expect(parsePlayerFilters({ sort: 'name' }, { staff: true }).sort).toBe('name');
  });
});

describe('clampSts / clampVouches', () => {
  it('rounds to the half step and clamps to 0..5', () => {
    expect(clampSts(3.26)).toBe(3.5);
    expect(clampSts(-1)).toBe(0);
    expect(clampSts(11)).toBe(5);
    expect(clampSts(Number.NaN)).toBe(0);
  });

  it('rounds to the whole step and clamps to 0..50', () => {
    expect(clampVouches(30.6)).toBe(31);
    expect(clampVouches(-5)).toBe(0);
    expect(clampVouches(9000)).toBe(50);
    expect(clampVouches(Number.NaN)).toBe(0);
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
      stsMin: 2.5,
      stsMax: 4,
      vouchesMin: 3,
      vouchesMax: 20,
      givenMin: 1,
      club: 'hermosa-club',
      identityVerified: true,
      coach: false,
      lookingForPartner: true,
      openForSponsorship: false,
      newOnly: true,
      tournament: 'tourney-1',
      sort: 'most_vouched',
      page: 2,
    };
    const qs = playerFiltersToQuery(f);
    const parsed = parsePlayerFilters(Object.fromEntries(new URLSearchParams(qs.slice(1))));
    expect(parsed.q).toBe('maria');
    expect(parsed.city).toBe('zamboanga');
    expect(parsed.sex).toBe('female');
    expect(parsed.skills).toEqual([2, 3]);
    expect(parsed.stsMin).toBe(2.5);
    expect(parsed.stsMax).toBe(4);
    expect(parsed.vouchesMin).toBe(3);
    expect(parsed.vouchesMax).toBe(20);
    expect(parsed.givenMin).toBe(1);
    expect(parsed.club).toBe('hermosa-club');
    expect(parsed.identityVerified).toBe(true);
    expect(parsed.coach).toBe(false);
    expect(parsed.newOnly).toBe(true);
    expect(parsed.tournament).toBe('tourney-1');
    expect(parsed.sort).toBe('most_vouched');
    expect(parsed.page).toBe(2);
  });

  it('writes nothing for an empty filter set', () => {
    expect(playerFiltersToQuery({})).toBe('');
  });

  it('omits the default sort and only writes a non-default one', () => {
    expect(playerFiltersToQuery({ sort: 'new_unvouched' })).toBe('');
    expect(playerFiltersToQuery({ sort: 'newest' })).toBe('?sort=newest');
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

  it('does not count sort - it is not a filter', () => {
    expect(activeFilterCount({ sort: 'most_vouched' })).toBe(0);
  });

  it('counts a whole band selection as one filter', () => {
    expect(activeFilterCount({ skills: [1, 2, 3] })).toBe(1);
  });

  it('counts an STS range as one filter, whichever side is set', () => {
    expect(activeFilterCount({ stsMin: 2 })).toBe(1);
    expect(activeFilterCount({ stsMax: 4 })).toBe(1);
    expect(activeFilterCount({ stsMin: 2, stsMax: 4 })).toBe(1);
  });

  it('counts vouches-received and vouches-given as separate filters', () => {
    expect(activeFilterCount({ vouchesMin: 3, givenMin: 2 })).toBe(2);
  });

  it('ignores a false toggle', () => {
    expect(activeFilterCount({ coach: false })).toBe(0);
  });

  it('adds up across kinds', () => {
    expect(
      activeFilterCount({
        city: 'zamboanga',
        sex: 'male',
        stsMin: 3,
        coach: true,
        club: 'x',
        newOnly: true,
        tournament: 't1',
      }),
    ).toBe(7);
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

  it('shows a two-sided STS range to one decimal', () => {
    expect(describeActiveFilters({ stsMin: 2, stsMax: 4 })[0]?.label).toBe('STS 2.0–4.0');
  });

  it('shows a one-sided STS range with just that bound', () => {
    expect(describeActiveFilters({ stsMin: 2.5 })[0]?.label).toBe('STS ≥2.5');
    expect(describeActiveFilters({ stsMax: 4 })[0]?.label).toBe('STS ≤4.0');
  });

  it('shows the vouches-received range, distinct from vouches-given', () => {
    expect(describeActiveFilters({ vouchesMin: 3, vouchesMax: 20 })[0]?.label).toBe('Vouches 3–20');
    expect(describeActiveFilters({ givenMax: 10 })[0]?.label).toBe('Given ≤10');
    expect(describeActiveFilters({ givenMin: 5 })[0]?.label).toBe('Given ≥5');
  });

  it('shows the new-account and tournament chips', () => {
    expect(describeActiveFilters({ newOnly: true })).toEqual([
      { key: 'newOnly', label: 'New this week' },
    ]);
    expect(
      describeActiveFilters(
        { tournament: 't1' },
        { tournamentOptions: [{ id: 't1', name: 'Hermosa 2026' }] },
      ),
    ).toEqual([{ key: 'tournament', label: 'Hermosa 2026' }]);
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

  it('never shows a chip for sort', () => {
    expect(describeActiveFilters({ sort: 'newest' })).toEqual([]);
  });
});

describe('clearFilter', () => {
  const full: PlayerFilters = {
    q: 'maria',
    city: 'zamboanga',
    sex: 'male',
    skills: [2],
    stsMin: 3,
    stsMax: 4,
    vouchesMin: 1,
    vouchesMax: 20,
    givenMin: 1,
    givenMax: 10,
    club: 'c',
    identityVerified: true,
    coach: true,
    lookingForPartner: true,
    openForSponsorship: true,
    newOnly: true,
    tournament: 't1',
    sort: 'newest',
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

  it('clears both ends of the STS range at once', () => {
    const next = clearFilter(full, 'sts');
    expect(next.stsMin).toBeUndefined();
    expect(next.stsMax).toBeUndefined();
  });

  it('clears both ends of the vouches-received and vouches-given ranges independently', () => {
    const next = clearFilter(full, 'vouches');
    expect(next.vouchesMin).toBeUndefined();
    expect(next.vouchesMax).toBeUndefined();
    expect(next.givenMin).toBe(1);
    expect(next.givenMax).toBe(10);
  });

  it('clears the tournament filter', () => {
    expect(clearFilter(full, 'tournament').tournament).toBeUndefined();
  });

  it('turns a toggle off rather than deleting it', () => {
    expect(clearFilter(full, 'coach').coach).toBe(false);
    expect(clearFilter(full, 'newOnly').newOnly).toBe(false);
  });

  it('never touches sort', () => {
    expect(clearFilter(full, 'coach').sort).toBe('newest');
  });

  it('always returns to page 1, because page 4 of a wider result is a different page', () => {
    expect(clearFilter(full, 'coach').page).toBe(1);
  });

  it('does not mutate the input', () => {
    clearFilter(full, 'city');
    expect(full.city).toBe('zamboanga');
  });
});
