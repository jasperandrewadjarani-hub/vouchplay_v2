/**
 * Admin settings catalog (handover §30.7). The single source of truth describing each
 * admin-configurable `system_settings` key: its display metadata (label/group/help) and its
 * validation contract (kind + bounds). The Admin Control Center renders and validates the settings
 * form from this catalog, and the update action validates every incoming value against it
 * server-side, so operational values are always tunable through the UI and never hardcoded.
 *
 * Pure + framework-free so it can be unit-tested and shared by both the form and the server action.
 */

import { DEFAULT_SYSTEM_SETTINGS, type SystemSettingsKey } from './settings';

export type SettingKind = 'int' | 'float' | 'bool' | 'text';

export type SettingGroupKey =
  | 'vouch_limits'
  | 'vouch_weights'
  | 'skill_verified'
  | 'eligibility'
  | 'tournament'
  | 'timing'
  | 'privacy'
  | 'safety'
  | 'coaching'
  | 'contribution'
  | 'leaderboards'
  | 'flags'
  | 'announcement'
  | 'vouch_integrity'
  | 'directory';

export interface SettingGroup {
  key: SettingGroupKey;
  label: string;
  help?: string;
}

export interface SettingField {
  key: SystemSettingsKey;
  label: string;
  group: SettingGroupKey;
  kind: SettingKind;
  help?: string;
  /** Numeric bounds (inclusive) for int/float. */
  min?: number;
  max?: number;
  step?: number;
  /** Max length for text. */
  maxLength?: number;
  /** A flag whose toggle-on carries operational risk (shown with a warning in the UI). */
  sensitive?: boolean;
}

/** Display order of the groups in the settings UI. */
export const SETTING_GROUPS: readonly SettingGroup[] = [
  {
    key: 'vouch_limits',
    label: 'Vouch rate limits',
    help: 'Rolling 24-hour windows (§10, §30.7).',
  },
  {
    key: 'vouch_weights',
    label: 'Vouch weights',
    help: 'Effective weight model (§10.5). Skill-Verified and Facebook never affect weight.',
  },
  {
    key: 'skill_verified',
    label: 'Skill Verified rule',
    help: 'Community Skill-Verified (§10.8).',
  },
  {
    key: 'eligibility',
    label: 'Eligibility engine',
    help: 'Anti-sandbagging thresholds (ELIG_V1, §25.4). Decision-support by default.',
  },
  {
    key: 'tournament',
    label: 'Tournament defaults',
    help: 'Division/representation defaults (§21, §22).',
  },
  {
    key: 'timing',
    label: 'Slot & payment timing',
    help: 'Slot holds and payment review grace (§23, §24).',
  },
  { key: 'privacy', label: 'Privacy & retention', help: 'Sensitive-data retention (§13.3).' },
  {
    key: 'safety',
    label: 'Safety limits',
    help: 'Report / skill-review abuse limits (§14, §11.3).',
  },
  {
    key: 'coaching',
    label: 'Coach applications',
    help: 'Evidence, review, and retention controls (§4.4, Phase 13C).',
  },
  {
    key: 'contribution',
    label: 'Community Contribution',
    help: 'CONTRIB_V1 engagement-only scoring. Never affects skill, trust, weight, or eligibility.',
  },
  {
    key: 'leaderboards',
    label: 'Home leaderboards',
    help: 'LEADER_V1 publication, privacy, category weights, and cadence (§6.1).',
  },
  { key: 'flags', label: 'Feature flags', help: 'Platform-wide switches (§30.7, §61).' },
  {
    key: 'announcement',
    label: 'Announcement banner',
    help: 'A site-wide banner shown to every visitor when enabled (§30.7).',
  },
  {
    key: 'vouch_integrity',
    label: 'Vouch integrity',
    help: 'Rig-resistant Community Skill (STS_V2, master_plan §2AF): the independent-evidence model and the velocity guard.',
  },
  {
    key: 'directory',
    label: 'Player directory',
    help: 'Sort, filter and badge windows for the public player directory (master_plan §2AG).',
  },
] as const;

/**
 * Every admin-editable setting. Keep in sync with DEFAULT_SYSTEM_SETTINGS (a unit test asserts this
 * catalog covers exactly the editable keys). STS algorithm constants are intentionally NOT here -
 * they are version-locked with STS_V1, not admin-tunable.
 */
export const SETTINGS_CATALOG: readonly SettingField[] = [
  // Vouch rate limits
  {
    key: 'player_vouches_per_24h',
    label: 'Player vouches / 24h',
    group: 'vouch_limits',
    kind: 'int',
    min: 0,
    max: 1000,
    help: '0 = unlimited. The one-active-vouch-per-player rule always applies.',
  },
  {
    key: 'coach_vouches_per_24h',
    label: 'Coach vouches / 24h',
    group: 'vouch_limits',
    kind: 'int',
    min: 0,
    max: 1000,
    help: '0 = unlimited.',
  },
  {
    key: 'coach_vouch_weight_enabled',
    label: 'Enable Coach-weighted vouches',
    group: 'coaching',
    kind: 'bool',
    sensitive: true,
    help: 'Safety kill switch. The per-vouch Coach option remains unchecked by default.',
  },
  {
    key: 'vouch_requests_per_24h',
    label: 'Vouch requests / 24h',
    group: 'vouch_limits',
    kind: 'int',
    min: 0,
    max: 1000,
  },
  {
    key: 'vouch_update_cooldown_days',
    label: 'Vouch update cooldown (days)',
    group: 'vouch_limits',
    kind: 'int',
    min: 0,
    max: 365,
  },
  {
    key: 'player_comments_per_24h',
    label: 'Profile comments / 24h',
    group: 'vouch_limits',
    kind: 'int',
    min: 0,
    max: 1000,
    help: 'A comment no longer needs a rating attached. 0 = unlimited.',
  },
  {
    key: 'vouch_newcomer_per_24h',
    label: 'Newcomer vouches / 24h',
    group: 'vouch_limits',
    kind: 'int',
    min: 0,
    max: 1000,
    help: 'Cap for accounts that are not yet established (no confirmed registration, ID, or coach role, and no standing from received vouches). 0 = no newcomer cap. Applies when stricter than the player cap (§2AJ).',
  },
  {
    key: 'vouch_newcomer_requests_per_24h',
    label: 'Newcomer vouch requests / 24h',
    group: 'vouch_limits',
    kind: 'int',
    min: 0,
    max: 1000,
    help: 'Cap on vouch requests for accounts that are not yet established (no confirmed registration, ID, or coach role, and no standing from received vouches). 0 = no newcomer cap. Applies when stricter than the request cap (§2AJ).',
  },
  {
    key: 'vouch_newcomer_graduate_standing',
    label: 'Newcomer graduation standing',
    group: 'vouch_limits',
    kind: 'float',
    min: 0,
    max: 10,
    step: 0.5,
    help: 'Received-vouch standing at which a newcomer becomes established: an anchored giver counts 1.0, an unanchored one 0.5; mutual pairs never count (§2AJ).',
  },

  // Vouch weights
  {
    key: 'weight_normal',
    label: 'Normal weight',
    group: 'vouch_weights',
    kind: 'float',
    min: 0,
    max: 10,
    step: 0.05,
  },
  {
    key: 'weight_identity_verified',
    label: 'Identity-Verified weight',
    group: 'vouch_weights',
    kind: 'float',
    min: 0,
    max: 10,
    step: 0.05,
  },
  {
    key: 'weight_coach',
    label: 'Coach weight',
    group: 'vouch_weights',
    kind: 'float',
    min: 0,
    max: 10,
    step: 0.05,
  },
  {
    key: 'weight_identity_verified_coach',
    label: 'Identity-Verified Coach weight',
    group: 'vouch_weights',
    kind: 'float',
    min: 0,
    max: 10,
    step: 0.05,
  },

  // Skill Verified
  {
    key: 'skill_verified_min_sts',
    label: 'Minimum STS',
    group: 'skill_verified',
    kind: 'float',
    min: 0,
    max: 5,
    step: 0.1,
  },
  {
    key: 'skill_verified_min_unique_vouchers',
    label: 'Minimum unique vouchers',
    group: 'skill_verified',
    kind: 'int',
    min: 0,
    max: 100,
  },

  // Eligibility engine
  {
    key: 'eligibility_min_unique_vouchers',
    label: 'Min evidence vouchers',
    group: 'eligibility',
    kind: 'int',
    min: 0,
    max: 100,
  },
  {
    key: 'eligibility_review_below_sts',
    label: 'Review below STS',
    group: 'eligibility',
    kind: 'float',
    min: 0,
    max: 5,
    step: 0.1,
  },
  {
    key: 'eligibility_enforce_hard_rules',
    label: 'Enforce hard rules (block registration)',
    group: 'eligibility',
    kind: 'bool',
    help: 'Off keeps the engine decision-support only. On lets a hard-rule failure block registration outright.',
    sensitive: true,
  },

  // Tournament defaults
  {
    key: 'default_max_divisions_per_player',
    label: 'Max divisions / player',
    group: 'tournament',
    kind: 'int',
    min: 1,
    max: 50,
  },
  {
    key: 'default_max_clubs_per_player',
    label: 'Max clubs / player / tournament',
    group: 'tournament',
    kind: 'int',
    min: 1,
    max: 10,
  },
  {
    key: 'default_division_capacity_teams',
    label: 'Starter division capacity (teams)',
    group: 'tournament',
    kind: 'int',
    min: 1,
    max: 512,
    help: 'Applied to each of the 15 starter divisions created with a new tournament.',
  },
  {
    key: 'default_division_fee_amount',
    label: 'Starter division fee per player',
    group: 'tournament',
    kind: 'int',
    min: 0,
    max: 1000000,
    help: 'Per-player fee stamped on each of the 15 starter divisions of a new tournament. 0 = free.',
  },
  {
    key: 'export_receipt_link_days',
    label: 'Export receipt link validity (days)',
    group: 'tournament',
    kind: 'int',
    min: 1,
    max: 90,
    help: 'How long the receipt links in an export stay valid, from the time of export. Re-export to refresh them.',
  },
  {
    key: 'club_representation_required',
    label: 'Club representation required',
    group: 'tournament',
    kind: 'bool',
  },
  { key: 'verified_clubs_only', label: 'Verified clubs only', group: 'tournament', kind: 'bool' },
  {
    key: 'tournament_demand_interest_enabled',
    label: 'Tournament demand interest enabled',
    group: 'tournament',
    kind: 'bool',
    help: 'Planning signal only. It never registers a player or holds a slot.',
  },
  {
    key: 'tournament_demand_anonymous_daily_limit',
    label: 'Anonymous demand interests / 24h',
    group: 'tournament',
    kind: 'int',
    min: 1,
    max: 100,
    help: 'Per privacy-preserving browser token; cookie resets can create a new estimate.',
  },
  {
    key: 'tournament_demand_public_avatar_limit',
    label: 'Public demand avatar limit',
    group: 'tournament',
    kind: 'int',
    min: 0,
    max: 12,
    help: 'Only public signed-in profiles may appear; anonymous interest is never identifiable.',
  },

  // Timing
  {
    key: 'slot_hold_minutes',
    label: 'Slot hold (minutes)',
    group: 'timing',
    kind: 'int',
    min: 1,
    max: 1440,
  },
  {
    key: 'submitted_payment_review_grace_hours',
    label: 'Payment review grace (hours)',
    group: 'timing',
    kind: 'int',
    min: 1,
    max: 720,
  },
  {
    key: 'player_registration_self_service_enabled',
    label: 'Player registration changes',
    group: 'timing',
    kind: 'bool',
    help: 'Allows eligible player cancellation and division moves before the change lock.',
    sensitive: true,
  },
  {
    key: 'player_registration_change_lock_hours_before_start',
    label: 'Player change lock before start (hours)',
    group: 'timing',
    kind: 'int',
    min: 0,
    max: 720,
    help: 'Player changes close this many hours before tournament start.',
  },

  // Privacy
  {
    key: 'identity_file_retention_days_after_decision',
    label: 'Identity file retention (days after decision)',
    group: 'privacy',
    kind: 'int',
    min: 1,
    max: 3650,
  },
  {
    key: 'identity_verification_enabled',
    label: 'Identity verification enabled',
    group: 'privacy',
    kind: 'bool',
    help: 'Feature flag for the identity verification pipeline (master_plan §2AG Phase C).',
  },
  {
    key: 'identity_doc_retention_days',
    label: 'Identity document backstop (days from submission)',
    group: 'privacy',
    kind: 'int',
    min: 1,
    max: 365,
    help: 'Pre-decision backstop only - the ID image is deleted on decision either way.',
  },

  // Safety
  {
    key: 'reports_per_24h',
    label: 'Reports / 24h',
    group: 'safety',
    kind: 'int',
    min: 0,
    max: 1000,
  },
  {
    key: 'skill_reviews_per_24h',
    label: 'Skill reviews / 24h',
    group: 'safety',
    kind: 'int',
    min: 0,
    max: 1000,
  },

  // Coach applications
  {
    key: 'coach_application_review_sla_days',
    label: 'Review SLA (days)',
    group: 'coaching',
    kind: 'int',
    min: 1,
    max: 90,
  },
  {
    key: 'coach_evidence_max_files',
    label: 'Maximum evidence files',
    group: 'coaching',
    kind: 'int',
    min: 0,
    max: 20,
  },
  {
    key: 'coach_evidence_max_bytes',
    label: 'Maximum bytes per evidence file',
    group: 'coaching',
    kind: 'int',
    min: 1024,
    max: 20971520,
  },
  {
    key: 'coach_evidence_allowed_mime_types',
    label: 'Allowed evidence MIME types',
    group: 'coaching',
    kind: 'text',
    maxLength: 300,
    help: 'Comma-separated subset of image/jpeg, image/png, image/webp, and application/pdf.',
  },
  {
    key: 'coach_evidence_signed_url_seconds',
    label: 'Signed URL lifetime (seconds)',
    group: 'coaching',
    kind: 'int',
    min: 15,
    max: 600,
  },
  {
    key: 'coach_evidence_retention_days_after_decision',
    label: 'Evidence retention after decision (days)',
    group: 'coaching',
    kind: 'int',
    min: 1,
    max: 3650,
  },
  {
    key: 'coach_application_reference_min_count',
    label: 'Minimum public references',
    group: 'coaching',
    kind: 'int',
    min: 0,
    max: 10,
  },
  {
    key: 'coach_application_reason_min_chars',
    label: 'Minimum decision reason length',
    group: 'coaching',
    kind: 'int',
    min: 3,
    max: 200,
  },

  // Community Contribution (CONTRIB_V1)
  {
    key: 'contribution_enabled',
    label: 'Contribution enabled',
    group: 'contribution',
    kind: 'bool',
  },
  {
    key: 'contribution_active_version',
    label: 'Active contribution version',
    group: 'contribution',
    kind: 'text',
    maxLength: 40,
  },
  {
    key: 'contribution_base_distinct_points',
    label: 'Base distinct-player points',
    group: 'contribution',
    kind: 'float',
    min: 0,
    max: 1000,
    step: 0.1,
  },
  {
    key: 'contribution_newcomer_voucher_threshold',
    label: 'Newcomer prior-voucher threshold',
    group: 'contribution',
    kind: 'int',
    min: 0,
    max: 100,
  },
  {
    key: 'contribution_newcomer_bonus',
    label: 'Newcomer-support bonus',
    group: 'contribution',
    kind: 'float',
    min: 0,
    max: 1000,
    step: 0.1,
  },
  {
    key: 'contribution_reciprocal_multiplier',
    label: 'Reciprocal-pair multiplier',
    group: 'contribution',
    kind: 'float',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'contribution_ring_multiplier',
    label: 'Flagged-ring multiplier',
    group: 'contribution',
    kind: 'float',
    min: 0,
    max: 1,
    step: 0.05,
    sensitive: true,
  },
  {
    key: 'contribution_daily_full_credit_limit',
    label: 'Daily full-credit events',
    group: 'contribution',
    kind: 'int',
    min: 0,
    max: 1000,
  },
  {
    key: 'contribution_daily_reduced_credit_limit',
    label: 'Daily reduced-credit ceiling',
    group: 'contribution',
    kind: 'int',
    min: 0,
    max: 1000,
  },
  {
    key: 'contribution_daily_reduced_multiplier',
    label: 'Reduced-credit multiplier',
    group: 'contribution',
    kind: 'float',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'contribution_daily_floor_multiplier',
    label: 'Daily floor multiplier',
    group: 'contribution',
    kind: 'float',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'contribution_decay_half_life_days',
    label: 'Decay half-life (days)',
    group: 'contribution',
    kind: 'int',
    min: 0,
    max: 3650,
  },
  {
    key: 'contribution_level_base_points',
    label: 'Level curve base points',
    group: 'contribution',
    kind: 'float',
    min: 1,
    max: 10000,
    step: 1,
  },
  {
    key: 'contribution_newcomer_badge_count',
    label: 'Newcomer Champion count',
    group: 'contribution',
    kind: 'int',
    min: 1,
    max: 1000,
  },
  {
    key: 'contribution_streak_badge_weeks',
    label: 'Consistent Voucher weeks',
    group: 'contribution',
    kind: 'int',
    min: 1,
    max: 520,
  },
  {
    key: 'contribution_pillar_score',
    label: 'Community Pillar score',
    group: 'contribution',
    kind: 'float',
    min: 1,
    max: 1000000,
    step: 1,
  },
  {
    key: 'contribution_builder_max_fact_rows',
    label: 'Builder fact-row cap',
    group: 'contribution',
    kind: 'int',
    min: 100,
    max: 50000,
    sensitive: true,
  },

  // Home leaderboards (LEADER_V1)
  {
    key: 'leaderboards_enabled',
    label: 'Leaderboards enabled',
    group: 'leaderboards',
    kind: 'bool',
  },
  {
    key: 'leaderboard_most_bidded_enabled',
    label: 'Most Bidded enabled',
    group: 'leaderboards',
    kind: 'bool',
    help: 'Keep off until §16A is live.',
    sensitive: true,
  },
  {
    key: 'leaderboard_active_version',
    label: 'Active scoring version',
    group: 'leaderboards',
    kind: 'text',
    maxLength: 40,
    sensitive: true,
  },
  {
    key: 'leaderboard_publish_cadence_hours',
    label: 'Publication cadence (hours)',
    group: 'leaderboards',
    kind: 'int',
    min: 24,
    max: 720,
    help: 'The production scheduler checks daily and publishes when this cadence is due.',
  },
  {
    key: 'leaderboard_home_limit',
    label: 'Home rows',
    group: 'leaderboards',
    kind: 'int',
    min: 3,
    max: 25,
  },
  {
    key: 'leaderboard_full_limit',
    label: 'Full leaderboard rows',
    group: 'leaderboards',
    kind: 'int',
    min: 10,
    max: 1000,
  },
  {
    key: 'leaderboard_builder_max_subjects',
    label: 'Builder subject cap',
    group: 'leaderboards',
    kind: 'int',
    min: 100,
    max: 50000,
    sensitive: true,
  },
  {
    key: 'leaderboard_builder_max_scopes',
    label: 'Builder city/region scope cap',
    group: 'leaderboards',
    kind: 'int',
    min: 1,
    max: 100,
    sensitive: true,
  },
  {
    key: 'leaderboard_component_cap',
    label: 'Per-component score cap',
    group: 'leaderboards',
    kind: 'float',
    min: 1,
    max: 10000,
    step: 1,
    sensitive: true,
  },
  {
    key: 'leaderboard_component_cap_players',
    label: 'Per-component score cap - Players',
    group: 'leaderboards',
    kind: 'float',
    min: 1,
    max: 100000000,
    step: 1,
    sensitive: true,
  },
  {
    key: 'leaderboard_component_cap_community',
    label: 'Per-component score cap - Community Champions',
    group: 'leaderboards',
    kind: 'float',
    min: 1,
    max: 100000000,
    step: 1,
    sensitive: true,
  },
  {
    key: 'leaderboard_component_cap_clubs',
    label: 'Per-component score cap - Clubs',
    group: 'leaderboards',
    kind: 'float',
    min: 1,
    max: 100000000,
    step: 1,
    sensitive: true,
  },
  {
    key: 'leaderboard_club_movement_notify_places',
    label: 'Club movement notification places',
    group: 'leaderboards',
    kind: 'int',
    min: 1,
    max: 100,
  },
  {
    key: 'leaderboard_min_age',
    label: 'Minimum public age',
    group: 'leaderboards',
    kind: 'int',
    min: 13,
    max: 25,
  },
  {
    key: 'leaderboard_exclude_unknown_dob',
    label: 'Exclude players with unknown date of birth',
    group: 'leaderboards',
    kind: 'bool',
    help: 'Off by default: date of birth is optional. Supplied minors remain excluded.',
  },
  {
    key: 'leaderboard_month_days',
    label: 'This month lookback (days)',
    group: 'leaderboards',
    kind: 'int',
    min: 1,
    max: 93,
  },
  {
    key: 'leaderboard_season_start',
    label: 'Season start (MM-DD)',
    group: 'leaderboards',
    kind: 'text',
    maxLength: 5,
  },
  {
    key: 'leaderboard_city_region_map',
    label: 'City-to-region JSON map',
    group: 'leaderboards',
    kind: 'text',
    maxLength: 20000,
    help: 'Example: {"Malolos":"Central Luzon"}',
  },
  {
    key: 'leaderboard_players_paused',
    label: 'Pause Players category',
    group: 'leaderboards',
    kind: 'bool',
    sensitive: true,
  },
  {
    key: 'leaderboard_community_paused',
    label: 'Pause Community category',
    group: 'leaderboards',
    kind: 'bool',
    sensitive: true,
  },
  {
    key: 'leaderboard_clubs_paused',
    label: 'Pause Clubs category',
    group: 'leaderboards',
    kind: 'bool',
    sensitive: true,
  },
  {
    key: 'leaderboard_milestone_notifications_enabled',
    label: 'Milestone notifications',
    group: 'leaderboards',
    kind: 'bool',
  },
  {
    key: 'leaderboard_player_min_score',
    label: 'Players minimum score',
    group: 'leaderboards',
    kind: 'float',
    min: 0,
    max: 100000,
    step: 0.1,
  },
  {
    key: 'leaderboard_player_participation_weight',
    label: 'Players participation weight',
    group: 'leaderboards',
    kind: 'float',
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: 'leaderboard_player_placement_weight',
    label: 'Players placement weight',
    group: 'leaderboards',
    kind: 'float',
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: 'leaderboard_player_profile_weight',
    label: 'Players profile-complete weight',
    group: 'leaderboards',
    kind: 'float',
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: 'leaderboard_player_skill_verified_weight',
    label: 'Players Skill-Verified weight',
    group: 'leaderboards',
    kind: 'float',
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: 'leaderboard_community_min_score',
    label: 'Community minimum score',
    group: 'leaderboards',
    kind: 'float',
    min: 0,
    max: 100000,
    step: 0.1,
  },
  {
    key: 'leaderboard_community_contribution_weight',
    label: 'Community contribution weight',
    group: 'leaderboards',
    kind: 'float',
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: 'leaderboard_club_min_score',
    label: 'Clubs minimum score',
    group: 'leaderboards',
    kind: 'float',
    min: 0,
    max: 100000,
    step: 0.1,
  },
  {
    key: 'leaderboard_club_participation_weight',
    label: 'Clubs participation weight',
    group: 'leaderboards',
    kind: 'float',
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: 'leaderboard_club_active_members_weight',
    label: 'Clubs normalized member weight',
    group: 'leaderboards',
    kind: 'float',
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: 'leaderboard_club_attendance_weight',
    label: 'Clubs represented attendance weight',
    group: 'leaderboards',
    kind: 'float',
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: 'leaderboard_club_placement_weight',
    label: 'Clubs placement weight',
    group: 'leaderboards',
    kind: 'float',
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: 'leaderboard_club_contribution_weight',
    label: 'Clubs contribution weight',
    group: 'leaderboards',
    kind: 'float',
    min: 0,
    max: 100,
    step: 0.1,
  },

  // Feature flags
  {
    key: 'maintenance_mode',
    label: 'Maintenance mode',
    group: 'flags',
    kind: 'bool',
    help: 'When on, non-staff visitors see a maintenance screen. Staff keep full access.',
    sensitive: true,
  },
  {
    key: 'signup_enabled',
    label: 'Signups enabled',
    group: 'flags',
    kind: 'bool',
    sensitive: true,
  },
  {
    key: 'role_applications_enabled',
    label: 'Role applications enabled',
    group: 'flags',
    kind: 'bool',
  },
  {
    key: 'coach_applications_enabled',
    label: 'Coach applications enabled',
    group: 'flags',
    kind: 'bool',
  },
  { key: 'club_creation_enabled', label: 'Club creation enabled', group: 'flags', kind: 'bool' },
  { key: 'recruitment_enabled', label: 'Club offers enabled', group: 'flags', kind: 'bool' },
  {
    key: 'club_offers_per_24h',
    label: 'Club offers / 24h',
    group: 'safety',
    kind: 'int',
    min: 0,
    max: 1000,
  },
  {
    key: 'offer_responses_per_24h',
    label: 'Offer responses / 24h',
    group: 'safety',
    kind: 'int',
    min: 0,
    max: 1000,
  },
  {
    key: 'offer_default_expiry_days',
    label: 'Offer expiry (days)',
    group: 'safety',
    kind: 'int',
    min: 1,
    max: 180,
  },

  // Live presence counter
  {
    key: 'online_counter_enabled',
    label: 'Show "players online" counter',
    group: 'announcement',
    kind: 'bool',
    help: 'A small live count of players viewing the app now, in the header. Uses Supabase Realtime presence (no extra database load); turn off if ever needed.',
  },

  // Announcement banner
  {
    key: 'announcement_banner_enabled',
    label: 'Show announcement banner',
    group: 'announcement',
    kind: 'bool',
  },
  {
    key: 'announcement_banner',
    label: 'Banner message',
    group: 'announcement',
    kind: 'text',
    maxLength: 280,
    help: 'Plain text, shown site-wide. Keep it short.',
  },

  // Launch / campaign welcome modal
  {
    key: 'welcome_modal_enabled',
    label: 'Show welcome pop-up',
    group: 'announcement',
    kind: 'bool',
    help: 'Shows once per visitor per version, on whichever page they land on.',
  },
  {
    key: 'welcome_modal_version',
    label: 'Welcome pop-up version',
    group: 'announcement',
    kind: 'text',
    maxLength: 40,
    help: 'Change this to show the pop-up again to everyone (e.g. when the message changes).',
  },
  {
    key: 'welcome_modal_headline',
    label: 'Welcome headline',
    group: 'announcement',
    kind: 'text',
    maxLength: 80,
  },
  {
    key: 'welcome_modal_subhead',
    label: 'Welcome subheadline',
    group: 'announcement',
    kind: 'text',
    maxLength: 120,
  },
  {
    key: 'welcome_modal_event_label',
    label: 'Event label',
    group: 'announcement',
    kind: 'text',
    maxLength: 40,
    help: 'Small label above the event name, e.g. "Upcoming event".',
  },
  {
    key: 'welcome_modal_event_name',
    label: 'Event name',
    group: 'announcement',
    kind: 'text',
    maxLength: 160,
  },
  {
    key: 'welcome_modal_detail',
    label: 'Event detail',
    group: 'announcement',
    kind: 'text',
    maxLength: 160,
    help: 'Use an absolute date and time, not "tomorrow" - the pop-up can be seen after midnight.',
  },
  {
    key: 'welcome_modal_cta_note',
    label: 'Call to action line',
    group: 'announcement',
    kind: 'text',
    maxLength: 160,
    help: 'Never promise a reserved slot; signing up does not hold a place.',
  },
  {
    key: 'welcome_modal_image_url',
    label: 'Welcome image URL',
    group: 'announcement',
    kind: 'text',
    maxLength: 300,
    help: 'Optional. A path like /welcome/launch.jpg or a full URL. Leave empty for text only.',
  },
  {
    key: 'welcome_modal_link_url',
    label: 'Event link',
    group: 'announcement',
    kind: 'text',
    maxLength: 300,
    help: 'Where "See the tournament" goes, e.g. /tournaments/your-slug.',
  },

  // Rig-resistant Community Skill (STS_V2, master_plan §2AF)
  {
    key: 'skill_algorithm_active_version',
    label: 'Active skill algorithm (public)',
    group: 'vouch_integrity',
    kind: 'text',
    maxLength: 10,
    help: 'STS_V1 (current, unchanged) or STS_V2 (independent-evidence model). Switching is instant and reversible - no deploy.',
    sensitive: true,
  },
  {
    key: 'vouch_velocity_guard_enabled',
    label: 'Velocity guard enabled',
    group: 'vouch_integrity',
    kind: 'bool',
    help: 'The one automatic guard: holds low-trust vouches inside a burst for moderator review. Off disables the hold entirely.',
    sensitive: true,
  },
  {
    key: 'skill_v2_trust_unknown_factor',
    label: 'Trust: brand-new unvouched account factor',
    group: 'vouch_integrity',
    kind: 'float',
    min: 0,
    max: 1,
    step: 0.05,
    help: 'Voucher trust for a fresh, unanchored account with no vouches received.',
  },
  {
    key: 'skill_v2_trust_unanchored_factor',
    label: 'Trust: unanchored voucher floor',
    group: 'vouch_integrity',
    kind: 'float',
    min: 0,
    max: 1,
    step: 0.05,
    help: 'Minimum voucher trust once an unanchored voucher has received at least one vouch.',
  },
  {
    key: 'skill_v2_trust_standing_saturation',
    label: 'Trust: standing saturation (vouches)',
    group: 'vouch_integrity',
    kind: 'int',
    min: 0,
    max: 100,
    help: 'Received-vouch count (reciprocal pairs excluded) at which a voucher’s standing maxes out.',
  },
  {
    key: 'skill_v2_trust_maturity_days',
    label: 'Trust: account maturity (days)',
    group: 'vouch_integrity',
    kind: 'int',
    min: 0,
    max: 365,
    help: 'Days for a new account’s trust to ramp from half to full strength.',
  },
  {
    key: 'skill_v2_reciprocal_multiplier',
    label: 'Independence: reciprocal-pair multiplier',
    group: 'vouch_integrity',
    kind: 'float',
    min: 0,
    max: 1,
    step: 0.05,
    help: 'Multiplier applied to a vouch when the target vouches that voucher back.',
  },
  {
    key: 'skill_v2_bloc_decay',
    label: 'Independence: bloc decay per extra club-mate',
    group: 'vouch_integrity',
    kind: 'float',
    min: 0,
    max: 1,
    step: 0.05,
    help: 'Per-rank decay applied to each additional voucher from the same club bloc. Lower = a club bloc counts for less.',
  },
  {
    key: 'skill_v2_prior_weight',
    label: 'Prior weight of the player’s own rating',
    group: 'vouch_integrity',
    kind: 'float',
    min: 0,
    max: 10,
    step: 0.1,
    help: 'How strongly the community skill level shrinks toward the player’s own self-rating until independent evidence is strong.',
  },
  {
    key: 'skill_v2_min_independent_vouchers',
    label: 'Skill Verified (V2): minimum independent vouchers',
    group: 'vouch_integrity',
    kind: 'float',
    min: 0,
    max: 20,
    step: 0.1,
    help: 'Minimum independent-equivalent vouchers (N_eff), alongside the existing minimum STS, for Skill Verified under STS_V2.',
  },
  {
    key: 'skill_v2_velocity_window_hours',
    label: 'Burst: window (hours)',
    group: 'vouch_integrity',
    kind: 'int',
    min: 1,
    max: 168,
    help: 'Rolling window in which vouches on one player are counted for a velocity burst.',
  },
  {
    key: 'skill_v2_velocity_burst_min',
    label: 'Burst: min vouches in window',
    group: 'vouch_integrity',
    kind: 'int',
    min: 1,
    max: 100,
    help: 'Vouches on one player inside the window before a burst is even considered.',
  },
  {
    key: 'skill_v2_velocity_low_trust_share',
    label: 'Burst: low-trust share to trigger a hold',
    group: 'vouch_integrity',
    kind: 'float',
    min: 0,
    max: 1,
    step: 0.05,
    help: 'Share of a burst’s vouches that must be low-trust before the low-trust ones are held for review.',
  },
  {
    key: 'skill_v2_velocity_low_trust_vt',
    label: 'Burst: low-trust voucher-trust ceiling',
    group: 'vouch_integrity',
    kind: 'float',
    min: 0,
    max: 1,
    step: 0.05,
    help: 'Voucher trust below which a voucher counts as low-trust for the burst share above.',
  },
  {
    key: 'skill_v2_swarm_min',
    label: 'Swarm flag: min unanchored vouches',
    group: 'vouch_integrity',
    kind: 'int',
    min: 1,
    max: 100,
    help: 'Active vouches from unanchored, zero-standing vouchers before a low-trust swarm is flagged (flag only, no hold).',
  },
  {
    key: 'skill_v2_ring_reciprocal_share',
    label: 'Ring flag: reciprocal share',
    group: 'vouch_integrity',
    kind: 'float',
    min: 0,
    max: 1,
    step: 0.05,
    help: 'Share of a >=4-vouch set that must be reciprocal pairs before a reciprocal ring is flagged.',
  },
  {
    key: 'skill_v2_bloc_share',
    label: 'Bloc flag: one-club share',
    group: 'vouch_integrity',
    kind: 'float',
    min: 0,
    max: 1,
    step: 0.05,
    help: 'Share of a >=4-vouch set supplied by one club before a club bloc is flagged.',
  },
  {
    key: 'skill_v2_spike_bands',
    label: 'Spike flag: skill-band distance',
    group: 'vouch_integrity',
    kind: 'int',
    min: 0,
    max: 6,
    help: 'Minimum skill-band gap (V1 vs V2, or community level vs self-rating with thin evidence) before a spike is flagged.',
  },
  {
    key: 'vouch_cluster_guard_enabled',
    label: 'Single-purpose cluster hold',
    group: 'vouch_integrity',
    kind: 'bool',
    help: "Automatically hold vouches when most of a player's vouches come from accounts that exist only to vouch them (§2AJ). Reversible from the Vouch integrity queue.",
    sensitive: true,
  },
  {
    key: 'skill_v2_cluster_max_outgoing',
    label: 'Cluster: max vouches given',
    group: 'vouch_integrity',
    kind: 'int',
    min: 0,
    max: 20,
    help: 'A voucher with at most this many vouches given, no standing and no anchor counts as single-purpose.',
  },
  {
    key: 'skill_v2_cluster_min',
    label: 'Cluster: min single-purpose vouches',
    group: 'vouch_integrity',
    kind: 'int',
    min: 1,
    max: 100,
    help: 'Minimum single-purpose vouches on one target before a cluster hold is even considered.',
  },
  {
    key: 'skill_v2_cluster_share',
    label: 'Cluster: min share',
    group: 'vouch_integrity',
    kind: 'float',
    min: 0,
    max: 1,
    step: 0.05,
    help: "Minimum share of a target's vouches that must be single-purpose to trigger a hold.",
  },

  // Player directory
  {
    key: 'new_account_badge_days',
    label: 'New-account badge window (days)',
    group: 'directory',
    kind: 'int',
    min: 0,
    max: 90,
    help: 'How recently a player must have onboarded to show the neutral "New" pill and match "New this week" (0 disables it, §2AG D5).',
  },
] as const;

/** Fast lookup of a field by key. */
export const SETTINGS_BY_KEY: Readonly<Record<string, SettingField>> = Object.freeze(
  Object.fromEntries(SETTINGS_CATALOG.map((f) => [f.key, f])),
);

export type SettingValue = number | boolean | string;

export type SettingValidation = { ok: true; value: SettingValue } | { ok: false; error: string };

/**
 * Validate + coerce a single incoming setting value against the catalog. `raw` may be the value
 * itself or its string form (as it arrives from a form/JSON). Pure and total - never throws.
 */
export function validateSettingValue(key: string, raw: unknown): SettingValidation {
  const field = SETTINGS_BY_KEY[key];
  if (!field) return { ok: false, error: `Unknown setting: ${key}` };

  if (field.kind === 'bool') {
    if (typeof raw === 'boolean') return { ok: true, value: raw };
    if (raw === 'true' || raw === 'on' || raw === '1') return { ok: true, value: true };
    if (raw === 'false' || raw === 'off' || raw === '0' || raw === '' || raw == null)
      return { ok: true, value: false };
    return { ok: false, error: `${field.label} must be true or false.` };
  }

  if (field.kind === 'text') {
    const s = raw == null ? '' : String(raw);
    if (field.maxLength != null && s.length > field.maxLength) {
      return { ok: false, error: `${field.label} must be ${field.maxLength} characters or fewer.` };
    }
    return { ok: true, value: s.trim() };
  }

  // int | float
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return { ok: false, error: `${field.label} must be a number.` };
  if (field.kind === 'int' && !Number.isInteger(n)) {
    return { ok: false, error: `${field.label} must be a whole number.` };
  }
  if (field.min != null && n < field.min) {
    return { ok: false, error: `${field.label} must be at least ${field.min}.` };
  }
  if (field.max != null && n > field.max) {
    return { ok: false, error: `${field.label} must be at most ${field.max}.` };
  }
  return { ok: true, value: n };
}

/** The current value of a setting from a merged map, falling back to the seed default. */
export function settingCurrentValue(
  key: SystemSettingsKey,
  merged: Record<string, unknown>,
): SettingValue {
  const v = merged[key];
  const def = DEFAULT_SYSTEM_SETTINGS[key] as SettingValue;
  if (v == null) return def;
  const field = SETTINGS_BY_KEY[key];
  if (!field) return v as SettingValue;
  if (field.kind === 'bool') return typeof v === 'boolean' ? v : def;
  if (field.kind === 'text') return typeof v === 'string' ? v : def;
  return typeof v === 'number' ? v : def;
}
