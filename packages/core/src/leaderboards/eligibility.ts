export type PlayerLeaderboardExclusionCode =
  | 'account_restricted'
  | 'high_risk_review'
  | 'admin_excluded'
  | 'profile_private'
  | 'opted_out'
  | 'age_unknown'
  | 'minor';

export interface PlayerLeaderboardEligibilityInput {
  accountActive: boolean;
  deleted: boolean;
  unresolvedHighRiskFraud: boolean;
  adminExcluded: boolean;
  directoryHidden: boolean;
  profilePrivate: boolean;
  leaderboardOptOut: boolean;
  dateOfBirth: string | null;
  excludeUnknownDateOfBirth: boolean;
  minimumPublicAge: number;
  hasPublicSlug: boolean;
  evaluatedAt: Date;
}

export interface LeaderboardEligibilityDecision {
  exclusionCode: PlayerLeaderboardExclusionCode | 'club_ineligible' | null;
  privateEligible: boolean;
  publicEligible: boolean;
}

function ageOn(dateOfBirth: string, at: Date): number | null {
  const born = new Date(`${dateOfBirth}T00:00:00Z`);
  if (!Number.isFinite(born.getTime())) return null;
  let age = at.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday =
    at.getUTCMonth() < born.getUTCMonth() ||
    (at.getUTCMonth() === born.getUTCMonth() && at.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Pure §6.1 public/privacy decision. Private momentum preserves privacy/age exclusions only. */
export function evaluatePlayerLeaderboardEligibility(
  input: Readonly<PlayerLeaderboardEligibilityInput>,
): LeaderboardEligibilityDecision {
  let exclusionCode: PlayerLeaderboardExclusionCode | null = null;
  if (!input.accountActive || input.deleted) exclusionCode = 'account_restricted';
  else if (input.unresolvedHighRiskFraud) exclusionCode = 'high_risk_review';
  else if (input.adminExcluded) exclusionCode = 'admin_excluded';
  else if (input.directoryHidden || input.profilePrivate) exclusionCode = 'profile_private';
  else if (input.leaderboardOptOut) exclusionCode = 'opted_out';
  else if (!input.dateOfBirth && input.excludeUnknownDateOfBirth) exclusionCode = 'age_unknown';
  else if (input.dateOfBirth) {
    const age = ageOn(input.dateOfBirth, input.evaluatedAt);
    if (age === null || age < input.minimumPublicAge) exclusionCode = 'minor';
  }
  const privateEligible = !['account_restricted', 'high_risk_review', 'admin_excluded'].includes(
    exclusionCode ?? '',
  );
  return {
    exclusionCode,
    privateEligible,
    publicEligible: exclusionCode === null && input.hasPublicSlug,
  };
}

export interface ClubLeaderboardEligibilityInput {
  verified: boolean;
  active: boolean;
  deleted: boolean;
  adminExcluded: boolean;
  hasPublicSlug: boolean;
}

/** Pure §6.1 club eligibility decision. Clubs have no private momentum surface. */
export function evaluateClubLeaderboardEligibility(
  input: Readonly<ClubLeaderboardEligibilityInput>,
): LeaderboardEligibilityDecision {
  const publicEligible =
    input.verified && input.active && !input.deleted && !input.adminExcluded && input.hasPublicSlug;
  return {
    publicEligible,
    privateEligible: publicEligible,
    exclusionCode: publicEligible
      ? null
      : input.adminExcluded
        ? 'admin_excluded'
        : 'club_ineligible',
  };
}

/** Pure engagement suggestion; never asks for favorable vouches or raw-volume activity. */
export function leaderboardCta(
  category: 'players' | 'community' | 'clubs',
  components: Readonly<Record<string, number>>,
):
  | 'register_tournament'
  | 'complete_profile'
  | 'request_vouch'
  | 'vouch_known_player'
  | 'join_club' {
  if (category === 'community') return 'vouch_known_player';
  if (category === 'clubs') return 'join_club';
  if ((components.profile ?? 0) < 1) return 'complete_profile';
  if ((components.participation ?? 0) === 0) return 'register_tournament';
  return 'request_vouch';
}
