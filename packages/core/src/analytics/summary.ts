/**
 * Admin analytics summary (handover §31). Pure, deterministic derivation of the platform KPIs from
 * raw counts gathered by the app data layer. Kept framework-free and unit-tested so the metric
 * definitions (conversion rates, averages, the North Star) live in one auditable place rather than
 * being computed ad hoc in a React component.
 */

export interface AnalyticsRaw {
  // Growth (§31.1)
  totalUsers: number;
  onboardedUsers: number;
  newUsers7d: number;
  newUsers30d: number;
  identityVerifiedUsers: number;
  skillVerifiedProfiles: number;
  activeProfiles: number;
  // Vouching (§31.2)
  activeVouches: number;
  uniqueVouchers: number;
  ratedPlayers: number;
  vouchRequests: number;
  coachVouches: number;
  vouches7d: number;
  vouches30d: number;
  // Tournaments (§31.3)
  tournamentsCreated: number;
  tournamentsPublished: number;
  interestedCount: number;
  registrationsTotal: number;
  confirmedTeams: number;
  waitlisted: number;
  withdrawn: number;
  eligibilityReview: number;
  eligibilityMismatch: number;
  paymentsVerified: number;
  revenueCents: number;
  // Clubs (§31.4)
  activeClubs: number;
  verifiedClubs: number;
  clubMemberships: number;
  // Safety (§31.5)
  openReports: number;
  openSkillReviews: number;
  openFraudFlags: number;
  accountActions: number;
}

export interface AnalyticsSummary {
  growth: {
    totalUsers: number;
    onboardedUsers: number;
    onboardedRate: number; // 0..1
    newUsers7d: number;
    newUsers30d: number;
    identityVerifiedUsers: number;
    skillVerifiedProfiles: number;
  };
  vouching: {
    activeVouches: number;
    uniqueVouchers: number;
    avgVouchesPerRatedPlayer: number;
    vouchRequests: number;
    coachVouches: number;
    vouches7d: number;
    vouches30d: number;
  };
  tournaments: {
    tournamentsCreated: number;
    tournamentsPublished: number;
    publishRate: number; // 0..1
    interestToRegistration: number; // 0..1
    confirmedTeams: number;
    waitlisted: number;
    withdrawn: number;
    eligibilityReview: number;
    eligibilityMismatch: number;
    mismatchRate: number; // 0..1 of registrations
    revenueCents: number;
  };
  clubs: {
    activeClubs: number;
    verifiedClubs: number;
    verifiedRate: number; // 0..1
    avgMembersPerClub: number;
  };
  safety: {
    openReports: number;
    openSkillReviews: number;
    openFraudFlags: number;
    accountActions: number;
  };
  /** North Star (§31.6): Skill-Verified active player profiles. */
  northStar: number;
  /** Secondary (§31.6): confirmed registrations backed by eligibility data. */
  secondary: number;
}

/** Safe ratio in [0,1]; 0 when the denominator is 0. */
export function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  const r = numerator / denominator;
  if (!Number.isFinite(r) || r < 0) return 0;
  return r;
}

export function computeAnalyticsSummary(raw: AnalyticsRaw): AnalyticsSummary {
  return {
    growth: {
      totalUsers: raw.totalUsers,
      onboardedUsers: raw.onboardedUsers,
      onboardedRate: ratio(raw.onboardedUsers, raw.totalUsers),
      newUsers7d: raw.newUsers7d,
      newUsers30d: raw.newUsers30d,
      identityVerifiedUsers: raw.identityVerifiedUsers,
      skillVerifiedProfiles: raw.skillVerifiedProfiles,
    },
    vouching: {
      activeVouches: raw.activeVouches,
      uniqueVouchers: raw.uniqueVouchers,
      avgVouchesPerRatedPlayer: raw.ratedPlayers > 0 ? raw.activeVouches / raw.ratedPlayers : 0,
      vouchRequests: raw.vouchRequests,
      coachVouches: raw.coachVouches,
      vouches7d: raw.vouches7d,
      vouches30d: raw.vouches30d,
    },
    tournaments: {
      tournamentsCreated: raw.tournamentsCreated,
      tournamentsPublished: raw.tournamentsPublished,
      publishRate: ratio(raw.tournamentsPublished, raw.tournamentsCreated),
      interestToRegistration: ratio(raw.registrationsTotal, raw.interestedCount),
      confirmedTeams: raw.confirmedTeams,
      waitlisted: raw.waitlisted,
      withdrawn: raw.withdrawn,
      eligibilityReview: raw.eligibilityReview,
      eligibilityMismatch: raw.eligibilityMismatch,
      mismatchRate: ratio(raw.eligibilityMismatch, raw.registrationsTotal),
      revenueCents: raw.revenueCents,
    },
    clubs: {
      activeClubs: raw.activeClubs,
      verifiedClubs: raw.verifiedClubs,
      verifiedRate: ratio(raw.verifiedClubs, raw.activeClubs),
      avgMembersPerClub: raw.activeClubs > 0 ? raw.clubMemberships / raw.activeClubs : 0,
    },
    safety: {
      openReports: raw.openReports,
      openSkillReviews: raw.openSkillReviews,
      openFraudFlags: raw.openFraudFlags,
      accountActions: raw.accountActions,
    },
    northStar: raw.skillVerifiedProfiles,
    secondary: raw.confirmedTeams,
  };
}
