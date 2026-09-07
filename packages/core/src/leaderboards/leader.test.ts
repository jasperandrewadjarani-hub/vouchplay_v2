import { describe, expect, it } from 'vitest';
import { derivePublicLeaderboardScopes, rankLeaderboard, type LeaderboardFact } from './leader';

const cfg = {
  weights: { participation: 2, placement: 4 },
  minimumScore: 1,
  maximumComponentValue: 100,
};
const facts: LeaderboardFact[] = [
  {
    subjectId: 'b',
    eligible: true,
    components: { participation: 5, placement: 1 },
    tieBreak: [1, 5],
    explanation: 'Played consistently.',
  },
  {
    subjectId: 'a',
    eligible: true,
    components: { participation: 3, placement: 2 },
    tieBreak: [2, 3],
    explanation: 'Official placement.',
  },
  {
    subjectId: 'z',
    eligible: false,
    components: { participation: 100, placement: 100 },
    tieBreak: [100],
    explanation: 'Excluded.',
  },
];

describe('LEADER_V1', () => {
  it('is deterministic across input order', () => {
    expect(rankLeaderboard(facts, cfg)).toEqual(rankLeaderboard([...facts].reverse(), cfg));
  });
  it('excludes ineligible subjects before ranking', () => {
    expect(rankLeaderboard(facts, cfg).map((row) => row.subjectId)).not.toContain('z');
  });
  it('uses stable tie-break facts then subject id', () => {
    const tie = [
      {
        ...facts[0]!,
        subjectId: 'b',
        components: { participation: 1, placement: 1 },
        tieBreak: [1],
      },
      {
        ...facts[0]!,
        subjectId: 'a',
        components: { participation: 1, placement: 1 },
        tieBreak: [1],
      },
    ];
    expect(rankLeaderboard(tie, cfg).map((row) => row.subjectId)).toEqual(['a', 'b']);
  });
  it('reads only configured components', () => {
    const clean = facts[0]!;
    const poisoned = { ...clean, components: { ...clean.components, sts: 5, vouchWeight: 9999 } };
    expect(rankLeaderboard([clean], cfg)[0]?.score).toBe(
      rankLeaderboard([poisoned], cfg)[0]?.score,
    );
  });
  it('derives public scopes only from eligible subjects', () => {
    expect(
      derivePublicLeaderboardScopes(
        [
          { publicEligible: false, city: 'Private City', region: 'Private Region' },
          { publicEligible: true, city: 'Cebu', region: 'Visayas' },
          { publicEligible: true, city: 'Bacolod', region: 'Visayas' },
        ],
        3,
      ),
    ).toEqual({ cities: ['Bacolod', 'Cebu'], regions: ['Visayas'] });
  });
  it('caps and sorts public scope metadata deterministically', () => {
    const subjects = [
      { publicEligible: true, city: 'Cebu', region: 'Visayas' },
      { publicEligible: true, city: 'Bacolod', region: 'Visayas' },
      { publicEligible: true, city: 'Davao', region: 'Mindanao' },
    ];
    expect(derivePublicLeaderboardScopes(subjects, 2)).toEqual({
      cities: ['Bacolod', 'Cebu'],
      regions: [],
    });
    expect(derivePublicLeaderboardScopes([...subjects].reverse(), 2)).toEqual(
      derivePublicLeaderboardScopes(subjects, 2),
    );
  });
});
