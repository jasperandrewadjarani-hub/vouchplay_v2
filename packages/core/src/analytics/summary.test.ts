import { describe, it, expect } from 'vitest';
import { computeAnalyticsSummary, ratio, type AnalyticsRaw } from './summary';

const RAW: AnalyticsRaw = {
  totalUsers: 200,
  onboardedUsers: 150,
  newUsers7d: 12,
  newUsers30d: 40,
  identityVerifiedUsers: 30,
  skillVerifiedProfiles: 25,
  activeProfiles: 190,
  activeVouches: 300,
  uniqueVouchers: 120,
  ratedPlayers: 100,
  vouchRequests: 50,
  coachVouches: 20,
  vouches7d: 15,
  vouches30d: 80,
  tournamentsCreated: 10,
  tournamentsPublished: 6,
  interestedCount: 200,
  registrationsTotal: 80,
  confirmedTeams: 60,
  waitlisted: 5,
  withdrawn: 8,
  eligibilityReview: 12,
  eligibilityMismatch: 4,
  paymentsVerified: 55,
  revenueCents: 275000,
  activeClubs: 8,
  verifiedClubs: 3,
  clubMemberships: 64,
  openReports: 2,
  openSkillReviews: 1,
  openFraudFlags: 0,
  accountActions: 7,
};

describe('ratio', () => {
  it('is 0 when the denominator is 0', () => {
    expect(ratio(5, 0)).toBe(0);
  });
  it('computes a fraction', () => {
    expect(ratio(1, 4)).toBe(0.25);
  });
  it('never returns negative or non-finite', () => {
    expect(ratio(-5, 10)).toBe(0);
  });
});

describe('computeAnalyticsSummary', () => {
  const s = computeAnalyticsSummary(RAW);

  it('derives the onboarded rate', () => {
    expect(s.growth.onboardedRate).toBeCloseTo(0.75, 5);
  });

  it('averages vouches per rated player', () => {
    expect(s.vouching.avgVouchesPerRatedPlayer).toBeCloseTo(3, 5);
  });

  it('derives publish and interest->registration conversions', () => {
    expect(s.tournaments.publishRate).toBeCloseTo(0.6, 5);
    expect(s.tournaments.interestToRegistration).toBeCloseTo(0.4, 5);
  });

  it('derives the mismatch rate against total registrations', () => {
    expect(s.tournaments.mismatchRate).toBeCloseTo(0.05, 5);
  });

  it('averages members per club and the verified rate', () => {
    expect(s.clubs.avgMembersPerClub).toBeCloseTo(8, 5);
    expect(s.clubs.verifiedRate).toBeCloseTo(0.375, 5);
  });

  it('sets the North Star to Skill-Verified profiles and the secondary to confirmed teams', () => {
    expect(s.northStar).toBe(25);
    expect(s.secondary).toBe(60);
  });

  it('is safe with all-zero input', () => {
    const zero = Object.fromEntries(Object.keys(RAW).map((k) => [k, 0])) as unknown as AnalyticsRaw;
    const z = computeAnalyticsSummary(zero);
    expect(z.growth.onboardedRate).toBe(0);
    expect(z.vouching.avgVouchesPerRatedPlayer).toBe(0);
    expect(z.clubs.avgMembersPerClub).toBe(0);
    expect(z.northStar).toBe(0);
  });
});
