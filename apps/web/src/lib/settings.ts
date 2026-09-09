import { unstable_cache } from 'next/cache';
import { DEFAULT_SYSTEM_SETTINGS, STS_CONSTANTS, type SystemSettingsKey } from '@vouchplay/config';
import { createPublicClient } from '@/lib/supabase/public';
import type { ContributionConfig } from '@vouchplay/core';

export const SYSTEM_SETTINGS_TAG = 'system_settings';

/**
 * Live operational settings (handover §30.7): read from `system_settings` (public read) with the
 * canonical config values as fallback. Business numbers are NEVER hardcoded in domain logic - this
 * is the single runtime source. STS algorithm constants come from @vouchplay/config (they are
 * version-locked with STS_V1, not admin-tunable), everything else is admin-configurable.
 */
const loadSettings = unstable_cache(
  async (): Promise<Record<string, unknown>> => {
    const merged: Record<string, unknown> = { ...DEFAULT_SYSTEM_SETTINGS };
    try {
      const supabase = createPublicClient();
      const { data } = await supabase.from('system_settings').select('key, value');
      for (const row of data ?? []) {
        const r = row as { key: string; value: unknown };
        merged[r.key] = r.value;
      }
    } catch {
      // fall back to config defaults
    }
    return merged;
  },
  ['system-settings'],
  { revalidate: 300, tags: [SYSTEM_SETTINGS_TAG] },
);

function num(map: Record<string, unknown>, key: SystemSettingsKey): number {
  const v = map[key];
  return typeof v === 'number' ? v : Number(DEFAULT_SYSTEM_SETTINGS[key]);
}

export interface VouchSettings {
  coachWeightEnabled: boolean;
  weights: {
    normal: number;
    identityVerified: number;
    coach: number;
    identityVerifiedCoach: number;
  };
  limits: {
    playerPer24h: number;
    coachPer24h: number;
    requestsPer24h: number;
    updateCooldownDays: number;
  };
  skillVerified: { minSts: number; minUniqueVouchers: number };
  stsConstants: {
    countDivisor: number;
    weightDivisor: number;
    dispersionDivisor: number;
    countCoefficient: number;
    weightCoefficient: number;
    agreementCoefficient: number;
    scale: number;
  };
}

/** Read a boolean feature flag from system_settings (handover §30.7), with a fallback default. */
export async function loadSettingFlag(key: SystemSettingsKey, fallback: boolean): Promise<boolean> {
  const m = await loadSettings();
  const v = m[key];
  return typeof v === 'boolean' ? v : fallback;
}

/** Read a numeric setting from system_settings (handover §30.7), with a fallback default. */
export async function loadSettingNumber(key: SystemSettingsKey, fallback: number): Promise<number> {
  const m = await loadSettings();
  const v = m[key];
  return typeof v === 'number' ? v : fallback;
}

/** Read a text setting from system_settings (handover §30.7), with a fallback default. */
export async function loadSettingText(key: SystemSettingsKey, fallback = ''): Promise<string> {
  const m = await loadSettings();
  const v = m[key];
  return typeof v === 'string' ? v : fallback;
}

/** Whether migration 0021 has installed the player-change policy rows. */
export async function hasPlayerRegistrationChangePolicy(): Promise<boolean> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from('system_settings')
      .select('key')
      .in('key', [
        'player_registration_self_service_enabled',
        'player_registration_change_lock_hours_before_start',
      ]);
    return (data ?? []).length === 2;
  } catch {
    return false;
  }
}

export interface SafetySettings {
  reportsPer24h: number;
  skillReviewsPer24h: number;
}

/** Safety & moderation abuse limits (handover §14, §30.7). */
export async function getSafetySettings(): Promise<SafetySettings> {
  const m = await loadSettings();
  return {
    reportsPer24h: num(m, 'reports_per_24h'),
    skillReviewsPer24h: num(m, 'skill_reviews_per_24h'),
  };
}

export interface EligibilitySettings {
  thresholds: { minEvidenceVouchers: number; reviewBelowSts: number };
  enforceHardRules: boolean;
}

/** Eligibility engine thresholds (handover §25.4, ELIG_V1). Admin-tunable via system_settings. */
export async function getEligibilitySettings(): Promise<EligibilitySettings> {
  const m = await loadSettings();
  const enforce = m['eligibility_enforce_hard_rules'];
  return {
    thresholds: {
      minEvidenceVouchers: num(m, 'eligibility_min_unique_vouchers'),
      reviewBelowSts: num(m, 'eligibility_review_below_sts'),
    },
    enforceHardRules: typeof enforce === 'boolean' ? enforce : false,
  };
}

export async function getVouchSettings(): Promise<VouchSettings> {
  const m = await loadSettings();
  return {
    coachWeightEnabled:
      typeof m.coach_vouch_weight_enabled === 'boolean' ? m.coach_vouch_weight_enabled : true,
    weights: {
      normal: num(m, 'weight_normal'),
      identityVerified: num(m, 'weight_identity_verified'),
      coach: num(m, 'weight_coach'),
      identityVerifiedCoach: num(m, 'weight_identity_verified_coach'),
    },
    limits: {
      playerPer24h: num(m, 'player_vouches_per_24h'),
      coachPer24h: num(m, 'coach_vouches_per_24h'),
      requestsPer24h: num(m, 'vouch_requests_per_24h'),
      updateCooldownDays: num(m, 'vouch_update_cooldown_days'),
    },
    skillVerified: {
      minSts: num(m, 'skill_verified_min_sts'),
      minUniqueVouchers: num(m, 'skill_verified_min_unique_vouchers'),
    },
    stsConstants: {
      countDivisor: STS_CONSTANTS.countDivisor,
      weightDivisor: STS_CONSTANTS.weightDivisor,
      dispersionDivisor: STS_CONSTANTS.dispersionDivisor,
      countCoefficient: STS_CONSTANTS.countCoefficient,
      weightCoefficient: STS_CONSTANTS.weightCoefficient,
      agreementCoefficient: STS_CONSTANTS.agreementCoefficient,
      scale: STS_CONSTANTS.scale,
    },
  };
}

/** Tournament planning interest is fail-closed until migration 0019 seeds its explicit flag. */
export async function getTournamentDemandSettings(): Promise<{ enabled: boolean }> {
  return { enabled: await loadSettingFlag('tournament_demand_interest_enabled', false) };
}

export async function getContributionSettings(): Promise<{
  enabled: boolean;
  activeVersion: string;
  maxFactRows: number;
  config: ContributionConfig;
}> {
  const m = await loadSettings();
  return {
    enabled: typeof m.contribution_enabled === 'boolean' ? m.contribution_enabled : true,
    activeVersion:
      typeof m.contribution_active_version === 'string'
        ? m.contribution_active_version
        : 'CONTRIB_V1',
    maxFactRows: num(m, 'contribution_builder_max_fact_rows'),
    config: {
      baseDistinctPoints: num(m, 'contribution_base_distinct_points'),
      newcomerThreshold: num(m, 'contribution_newcomer_voucher_threshold'),
      newcomerBonus: num(m, 'contribution_newcomer_bonus'),
      reciprocalMultiplier: num(m, 'contribution_reciprocal_multiplier'),
      ringMultiplier: num(m, 'contribution_ring_multiplier'),
      dailyFullCreditLimit: num(m, 'contribution_daily_full_credit_limit'),
      dailyReducedCreditLimit: num(m, 'contribution_daily_reduced_credit_limit'),
      dailyReducedMultiplier: num(m, 'contribution_daily_reduced_multiplier'),
      dailyFloorMultiplier: num(m, 'contribution_daily_floor_multiplier'),
      decayHalfLifeDays: num(m, 'contribution_decay_half_life_days'),
      levelBasePoints: num(m, 'contribution_level_base_points'),
      newcomerBadgeCount: num(m, 'contribution_newcomer_badge_count'),
      streakBadgeWeeks: num(m, 'contribution_streak_badge_weeks'),
      pillarScore: num(m, 'contribution_pillar_score'),
    },
  };
}

export interface LeaderboardSettings {
  enabled: boolean;
  mostBiddedEnabled: boolean;
  activeVersion: string;
  cadenceHours: number;
  homeLimit: number;
  fullLimit: number;
  maxSubjects: number;
  maxScopes: number;
  componentCap: number;
  /** Per-category component caps (§1W). Fall back to the global cap when unset. */
  componentCaps: { players: number; community: number; clubs: number };
  clubMovementNotifyPlaces: number;
  minAge: number;
  excludeUnknownDob: boolean;
  monthDays: number;
  seasonStart: string;
  cityRegionMap: Record<string, string>;
  milestoneNotifications: boolean;
  paused: { players: boolean; community: boolean; clubs: boolean };
  weights: {
    players: Record<string, number>;
    community: Record<string, number>;
    clubs: Record<string, number>;
  };
  minimumScores: { players: number; community: number; clubs: number };
}

export async function getLeaderboardSettings(): Promise<LeaderboardSettings> {
  const m = await loadSettings();
  let cityRegionMap: Record<string, string> = {};
  try {
    const raw =
      typeof m.leaderboard_city_region_map === 'string' ? m.leaderboard_city_region_map : '{}';
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      cityRegionMap = parsed as Record<string, string>;
  } catch {
    cityRegionMap = {};
  }
  const bool = (key: SystemSettingsKey, fallback: boolean) =>
    typeof m[key] === 'boolean' ? (m[key] as boolean) : fallback;
  return {
    enabled: bool('leaderboards_enabled', true),
    mostBiddedEnabled: bool('leaderboard_most_bidded_enabled', false),
    activeVersion:
      typeof m.leaderboard_active_version === 'string' ? m.leaderboard_active_version : 'LEADER_V1',
    cadenceHours: num(m, 'leaderboard_publish_cadence_hours'),
    homeLimit: num(m, 'leaderboard_home_limit'),
    fullLimit: num(m, 'leaderboard_full_limit'),
    maxSubjects: num(m, 'leaderboard_builder_max_subjects'),
    maxScopes: num(m, 'leaderboard_builder_max_scopes'),
    componentCap: num(m, 'leaderboard_component_cap'),
    componentCaps: {
      players: num(m, 'leaderboard_component_cap_players') || num(m, 'leaderboard_component_cap'),
      community:
        num(m, 'leaderboard_component_cap_community') || num(m, 'leaderboard_component_cap'),
      clubs: num(m, 'leaderboard_component_cap_clubs') || num(m, 'leaderboard_component_cap'),
    },
    clubMovementNotifyPlaces: num(m, 'leaderboard_club_movement_notify_places'),
    minAge: num(m, 'leaderboard_min_age'),
    excludeUnknownDob: bool('leaderboard_exclude_unknown_dob', false),
    monthDays: num(m, 'leaderboard_month_days'),
    seasonStart:
      typeof m.leaderboard_season_start === 'string' ? m.leaderboard_season_start : '01-01',
    cityRegionMap,
    milestoneNotifications: bool('leaderboard_milestone_notifications_enabled', true),
    paused: {
      players: bool('leaderboard_players_paused', false),
      community: bool('leaderboard_community_paused', false),
      clubs: bool('leaderboard_clubs_paused', false),
    },
    weights: {
      players: {
        participation: num(m, 'leaderboard_player_participation_weight'),
        placement: num(m, 'leaderboard_player_placement_weight'),
        profile: num(m, 'leaderboard_player_profile_weight'),
        skillVerified: num(m, 'leaderboard_player_skill_verified_weight'),
      },
      community: { contribution: num(m, 'leaderboard_community_contribution_weight') },
      clubs: {
        participation: num(m, 'leaderboard_club_participation_weight'),
        activeMembers: num(m, 'leaderboard_club_active_members_weight'),
        attendance: num(m, 'leaderboard_club_attendance_weight'),
        placement: num(m, 'leaderboard_club_placement_weight'),
        contribution: num(m, 'leaderboard_club_contribution_weight'),
      },
    },
    minimumScores: {
      players: num(m, 'leaderboard_player_min_score'),
      community: num(m, 'leaderboard_community_min_score'),
      clubs: num(m, 'leaderboard_club_min_score'),
    },
  };
}
