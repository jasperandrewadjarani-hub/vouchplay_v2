import { describe, expect, it } from 'vitest';
import { DEFAULT_PARTNER_WEIGHTS, comparePartnerScores, scorePartnerCandidate } from './score';
import type { PartnerScoreInput } from './score';

const NOW = '2026-09-13T12:00:00.000Z';

function input(over: Partial<PartnerScoreInput> = {}): PartnerScoreInput {
  return {
    commonDivisions: [],
    candidateSeat: null,
    viewerSkill: null,
    candidateSkill: null,
    candidateSwipedRightOnViewer: false,
    sameCity: false,
    sameRegion: false,
    candidateIdentityVerified: false,
    candidateCoachVouched: false,
    candidateStsAtOrAboveThreshold: false,
    candidateSearchLastActiveAt: NOW,
    now: NOW,
    ...over,
  };
}

describe('scorePartnerCandidate - slot', () => {
  it('is 0 with no seat', () => {
    expect(scorePartnerCandidate(input()).terms.slot).toBe(0);
  });

  it('is full weight for a paid seat in a common division', () => {
    const r = scorePartnerCandidate(
      input({
        commonDivisions: [{ id: 'd1', recommendedForViewer: false }],
        candidateSeat: { divisionId: 'd1', paid: true },
      }),
    );
    expect(r.terms.slot).toBe(DEFAULT_PARTNER_WEIGHTS.slot);
  });

  it('is half weight for an unpaid seat in a common division', () => {
    const r = scorePartnerCandidate(
      input({
        commonDivisions: [{ id: 'd1', recommendedForViewer: false }],
        candidateSeat: { divisionId: 'd1', paid: false },
      }),
    );
    expect(r.terms.slot).toBe(DEFAULT_PARTNER_WEIGHTS.slot / 2);
  });

  it('is 0 when the seat is NOT in a common division, even if paid', () => {
    const r = scorePartnerCandidate(
      input({
        commonDivisions: [{ id: 'd1', recommendedForViewer: false }],
        candidateSeat: { divisionId: 'd2', paid: true },
      }),
    );
    expect(r.terms.slot).toBe(0);
  });
});

describe('scorePartnerCandidate - division overlap', () => {
  it('is 0 with no common divisions', () => {
    expect(scorePartnerCandidate(input()).terms.divisionOverlap).toBe(0);
  });

  it('adds weight per common division', () => {
    const r = scorePartnerCandidate(
      input({
        commonDivisions: [
          { id: 'd1', recommendedForViewer: false },
          { id: 'd2', recommendedForViewer: false },
        ],
      }),
    );
    expect(r.terms.divisionOverlap).toBe(DEFAULT_PARTNER_WEIGHTS.divisionOverlap * 2);
  });

  it('doubles the per-division weight when recommended for the viewer', () => {
    const r = scorePartnerCandidate(
      input({
        commonDivisions: [
          { id: 'd1', recommendedForViewer: true },
          { id: 'd2', recommendedForViewer: false },
        ],
      }),
    );
    expect(r.terms.divisionOverlap).toBe(DEFAULT_PARTNER_WEIGHTS.divisionOverlap * 3);
  });
});

describe('scorePartnerCandidate - skill proximity', () => {
  it('is full weight when both skills are known and equal', () => {
    const r = scorePartnerCandidate(input({ viewerSkill: 3, candidateSkill: 3 }));
    expect(r.terms.skillProximity).toBe(DEFAULT_PARTNER_WEIGHTS.skillProximity);
  });

  it('is half weight when one band apart', () => {
    const r = scorePartnerCandidate(input({ viewerSkill: 3, candidateSkill: 4 }));
    expect(r.terms.skillProximity).toBe(DEFAULT_PARTNER_WEIGHTS.skillProximity / 2);
  });

  it('is 0 when two or more bands apart', () => {
    const r = scorePartnerCandidate(input({ viewerSkill: 1, candidateSkill: 4 }));
    expect(r.terms.skillProximity).toBe(0);
  });

  it('is 0 when either skill is unknown', () => {
    expect(
      scorePartnerCandidate(input({ viewerSkill: null, candidateSkill: 3 })).terms.skillProximity,
    ).toBe(0);
    expect(
      scorePartnerCandidate(input({ viewerSkill: 3, candidateSkill: null })).terms.skillProximity,
    ).toBe(0);
  });
});

describe('scorePartnerCandidate - reciprocity', () => {
  it('is 0 by default and full weight when the candidate already swiped right', () => {
    expect(scorePartnerCandidate(input()).terms.reciprocity).toBe(0);
    const r = scorePartnerCandidate(input({ candidateSwipedRightOnViewer: true }));
    expect(r.terms.reciprocity).toBe(DEFAULT_PARTNER_WEIGHTS.reciprocity);
  });
});

describe('scorePartnerCandidate - city', () => {
  it('is full weight for the same city', () => {
    const r = scorePartnerCandidate(input({ sameCity: true, sameRegion: true }));
    expect(r.terms.city).toBe(DEFAULT_PARTNER_WEIGHTS.city);
  });

  it('is half weight for same region only', () => {
    const r = scorePartnerCandidate(input({ sameCity: false, sameRegion: true }));
    expect(r.terms.city).toBe(DEFAULT_PARTNER_WEIGHTS.city / 2);
  });

  it('is 0 for neither', () => {
    expect(scorePartnerCandidate(input()).terms.city).toBe(0);
  });
});

describe('scorePartnerCandidate - trust', () => {
  it('is 0 with no trust signals', () => {
    expect(scorePartnerCandidate(input()).terms.trust).toBe(0);
  });

  it('weights identity 0.4, coach 0.3, sts 0.3', () => {
    expect(
      scorePartnerCandidate(input({ candidateIdentityVerified: true })).terms.trust,
    ).toBeCloseTo(0.4 * DEFAULT_PARTNER_WEIGHTS.trust, 5);
    expect(scorePartnerCandidate(input({ candidateCoachVouched: true })).terms.trust).toBeCloseTo(
      0.3 * DEFAULT_PARTNER_WEIGHTS.trust,
      5,
    );
    expect(
      scorePartnerCandidate(input({ candidateStsAtOrAboveThreshold: true })).terms.trust,
    ).toBeCloseTo(0.3 * DEFAULT_PARTNER_WEIGHTS.trust, 5);
  });

  it('sums to full weight when all three are true', () => {
    const r = scorePartnerCandidate(
      input({
        candidateIdentityVerified: true,
        candidateCoachVouched: true,
        candidateStsAtOrAboveThreshold: true,
      }),
    );
    expect(r.terms.trust).toBe(DEFAULT_PARTNER_WEIGHTS.trust);
  });
});

describe('scorePartnerCandidate - freshness', () => {
  it('is full weight within 24 hours', () => {
    const r = scorePartnerCandidate(
      input({ candidateSearchLastActiveAt: '2026-09-13T00:00:01.000Z', now: NOW }),
    );
    expect(r.terms.freshness).toBe(DEFAULT_PARTNER_WEIGHTS.freshness);
  });

  it('is half weight halfway through the 24h-168h decay window', () => {
    // Midpoint of (24h, 168h) is 96h old.
    const r = scorePartnerCandidate(
      input({ candidateSearchLastActiveAt: '2026-09-09T12:00:00.000Z', now: NOW }),
    );
    expect(r.terms.freshness).toBeCloseTo(DEFAULT_PARTNER_WEIGHTS.freshness / 2, 5);
  });

  it('is 0 at exactly 7 days and beyond', () => {
    const r = scorePartnerCandidate(
      input({ candidateSearchLastActiveAt: '2026-09-06T12:00:00.000Z', now: NOW }),
    );
    expect(r.terms.freshness).toBe(0);
    const older = scorePartnerCandidate(
      input({ candidateSearchLastActiveAt: '2026-08-01T00:00:00.000Z', now: NOW }),
    );
    expect(older.terms.freshness).toBe(0);
  });

  it('is 0 for invalid dates and never throws', () => {
    const r = scorePartnerCandidate(input({ candidateSearchLastActiveAt: 'not-a-date', now: NOW }));
    expect(r.terms.freshness).toBe(0);
    expect(r.score).toBe(0);
  });
});

describe('scorePartnerCandidate - score rounding and totals', () => {
  it('rounds the total score to 3 decimals', () => {
    const r = scorePartnerCandidate(
      input({ candidateIdentityVerified: true, candidateCoachVouched: true }),
    );
    expect(r.score).toBe(Math.round(r.score * 1000) / 1000);
  });

  it('sums every term into the score', () => {
    const r = scorePartnerCandidate(
      input({
        commonDivisions: [{ id: 'd1', recommendedForViewer: true }],
        candidateSeat: { divisionId: 'd1', paid: true },
        viewerSkill: 2,
        candidateSkill: 2,
        candidateSwipedRightOnViewer: true,
        sameCity: true,
        candidateIdentityVerified: true,
        candidateCoachVouched: true,
        candidateStsAtOrAboveThreshold: true,
      }),
    );
    const expectedSum = Object.values(r.terms).reduce((s, v) => s + v, 0);
    expect(r.score).toBeCloseTo(expectedSum, 5);
    expect(r.score).toBeGreaterThan(0);
  });

  it('never throws on a candidate seat missing its divisionId shape safely', () => {
    expect(() =>
      scorePartnerCandidate(input({ candidateSeat: { divisionId: 'x', paid: true } })),
    ).not.toThrow();
  });
});

describe('comparePartnerScores', () => {
  it('sorts by score descending', () => {
    const list = [
      { score: 1, lastActiveAt: NOW },
      { score: 5, lastActiveAt: NOW },
      { score: 3, lastActiveAt: NOW },
    ];
    expect([...list].sort(comparePartnerScores).map((x) => x.score)).toEqual([5, 3, 1]);
  });

  it('breaks ties by most recently active first', () => {
    const list = [
      { score: 2, lastActiveAt: '2026-09-01T00:00:00.000Z' },
      { score: 2, lastActiveAt: '2026-09-10T00:00:00.000Z' },
      { score: 2, lastActiveAt: '2026-09-05T00:00:00.000Z' },
    ];
    expect([...list].sort(comparePartnerScores).map((x) => x.lastActiveAt)).toEqual([
      '2026-09-10T00:00:00.000Z',
      '2026-09-05T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
    ]);
  });
});
