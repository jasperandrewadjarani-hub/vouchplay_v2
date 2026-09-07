import { describe, expect, it } from 'vitest';
import {
  evaluateClubLeaderboardEligibility,
  evaluatePlayerLeaderboardEligibility,
  leaderboardCta,
  type PlayerLeaderboardEligibilityInput,
} from './eligibility';

const base: PlayerLeaderboardEligibilityInput = {
  accountActive: true,
  deleted: false,
  unresolvedHighRiskFraud: false,
  adminExcluded: false,
  directoryHidden: false,
  profilePrivate: false,
  leaderboardOptOut: false,
  dateOfBirth: '1990-05-10',
  excludeUnknownDateOfBirth: true,
  minimumPublicAge: 18,
  hasPublicSlug: true,
  evaluatedAt: new Date('2026-05-09T12:00:00Z'),
};

describe('leaderboard privacy and eligibility', () => {
  it('publishes an eligible adult with private momentum', () => {
    expect(evaluatePlayerLeaderboardEligibility(base)).toEqual({
      exclusionCode: null,
      privateEligible: true,
      publicEligible: true,
    });
  });

  it.each([
    ['directory hidden', { directoryHidden: true }, 'profile_private'],
    ['profile private', { profilePrivate: true }, 'profile_private'],
    ['public opt-out', { leaderboardOptOut: true }, 'opted_out'],
    ['unknown DOB', { dateOfBirth: null }, 'age_unknown'],
    ['minor', { dateOfBirth: '2010-01-01' }, 'minor'],
  ] as const)('keeps %s private but eligible for private momentum', (_label, patch, code) => {
    expect(evaluatePlayerLeaderboardEligibility({ ...base, ...patch })).toEqual({
      exclusionCode: code,
      privateEligible: true,
      publicEligible: false,
    });
  });

  it.each([
    ['restricted account', { accountActive: false }, 'account_restricted'],
    ['deleted account', { deleted: true }, 'account_restricted'],
    ['unresolved high-risk fraud', { unresolvedHighRiskFraud: true }, 'high_risk_review'],
    ['Admin exclusion', { adminExcluded: true }, 'admin_excluded'],
  ] as const)('excludes %s from public and private ranks', (_label, patch, code) => {
    expect(evaluatePlayerLeaderboardEligibility({ ...base, ...patch })).toEqual({
      exclusionCode: code,
      privateEligible: false,
      publicEligible: false,
    });
  });

  it('handles the birthday boundary in UTC', () => {
    expect(
      evaluatePlayerLeaderboardEligibility({ ...base, dateOfBirth: '2008-05-10' }),
    ).toMatchObject({
      exclusionCode: 'minor',
    });
    expect(
      evaluatePlayerLeaderboardEligibility({
        ...base,
        dateOfBirth: '2008-05-10',
        evaluatedAt: new Date('2026-05-10T00:00:00Z'),
      }),
    ).toMatchObject({ exclusionCode: null });
  });

  it('requires a verified, active, public-slugged, non-excluded club', () => {
    expect(
      evaluateClubLeaderboardEligibility({
        verified: true,
        active: true,
        deleted: false,
        adminExcluded: false,
        hasPublicSlug: true,
      }),
    ).toMatchObject({ publicEligible: true });
    expect(
      evaluateClubLeaderboardEligibility({
        verified: true,
        active: true,
        deleted: false,
        adminExcluded: true,
        hasPublicSlug: true,
      }),
    ).toEqual({
      exclusionCode: 'admin_excluded',
      privateEligible: false,
      publicEligible: false,
    });
  });

  it('returns only real, neutral engagement routes', () => {
    expect(leaderboardCta('players', { profile: 0, participation: 0 })).toBe('complete_profile');
    expect(leaderboardCta('players', { profile: 1, participation: 0 })).toBe('register_tournament');
    expect(leaderboardCta('players', { profile: 1, participation: 1 })).toBe('request_vouch');
    expect(leaderboardCta('community', {})).toBe('vouch_known_player');
    expect(leaderboardCta('clubs', {})).toBe('join_club');
  });
});
