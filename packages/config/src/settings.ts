/**
 * Default system settings (handover §30.7). These are seed defaults for the `system_settings`
 * table. Domain logic must read live values from that table at runtime, not import these directly
 * for business decisions (handover coding standard: "no magic numeric business values").
 */

export const DEFAULT_SYSTEM_SETTINGS = {
  // Vouch rate limits (rolling 24h windows, not calendar-day). 0 = unlimited. Default is unlimited
  // vouches/day per player (the one-active-vouch-per-pair rule still applies), per JT decision
  // 2026-09-07; still admin-tunable, so an anti-abuse cap can be set anytime.
  player_vouches_per_24h: 0,
  coach_vouches_per_24h: 0,
  // Kill switch is enabled by default; the per-vouch "Vouch as a Coach" control itself is always
  // unchecked by default, as required by §4.4.
  coach_vouch_weight_enabled: true,
  vouch_requests_per_24h: 10,
  vouch_update_cooldown_days: 1,
  // A comment can now be written without a rating attached (master_plan §2B), which is a new way to
  // write on a stranger's profile, so it gets its own rolling cap. 10/day is generous for a real
  // player and cheap to lower. 0 = unlimited; the one-active-comment-per-pair rule still applies.
  player_comments_per_24h: 10,

  // Vouch weight model (handover §10.5). Skill-Verified status and Facebook do NOT affect weight.
  weight_normal: 1.0,
  weight_identity_verified: 1.25,
  weight_coach: 2.0,
  weight_identity_verified_coach: 2.5,

  // Skill Verified rule (handover §10.8).
  skill_verified_min_sts: 3.0,
  skill_verified_min_unique_vouchers: 2,

  // Tournament defaults (handover §21.3, §22.1).
  default_max_divisions_per_player: 3,
  default_max_clubs_per_player: 3,
  default_division_capacity_teams: 20,
  club_representation_required: false,
  verified_clubs_only: false,
  // Tournament planning demand (not registration, eligibility, or a slot).
  // Fail closed until migration 0019 has seeded the explicit live setting.
  tournament_demand_interest_enabled: false,
  tournament_demand_anonymous_daily_limit: 12,
  tournament_demand_public_avatar_limit: 5,

  // Slot & payment timing (handover §23.1, §24).
  slot_hold_minutes: 30,
  submitted_payment_review_grace_hours: 24,
  // Player-controlled registration changes (§1D). The database RPC is authoritative.
  player_registration_self_service_enabled: true,
  player_registration_change_lock_hours_before_start: 24,

  // Privacy (handover §13.3).
  identity_file_retention_days_after_decision: 30,

  // Safety & moderation abuse limits (handover §14, §11.3, §30.7). Rolling 24h windows.
  reports_per_24h: 10,
  skill_reviews_per_24h: 5,

  // Eligibility engine thresholds (handover §25.4, ELIG_V1). Admin-tunable, never hardcoded.
  eligibility_min_unique_vouchers: 2,
  eligibility_review_below_sts: 3.0,
  /** When true, a hard-rule failure blocks registration outright; default keeps it decision-support. */
  eligibility_enforce_hard_rules: false,

  // Feature flags (handover §61).
  maintenance_mode: false,
  signup_enabled: true,
  role_applications_enabled: true,
  coach_applications_enabled: true,
  club_creation_enabled: true,

  // Club offers - recruitment / sponsorship (handover §16, Phase 14A). 0 = unlimited where noted.
  recruitment_enabled: true,
  club_offers_per_24h: 10,
  offer_responses_per_24h: 20,
  offer_default_expiry_days: 30,

  // Coach application operations (handover §4.4, Phase 13C).
  coach_application_review_sla_days: 7,
  coach_evidence_max_files: 5,
  coach_evidence_max_bytes: 5 * 1024 * 1024,
  coach_evidence_allowed_mime_types: 'image/jpeg,image/png,image/webp,application/pdf',
  coach_evidence_signed_url_seconds: 60,
  coach_evidence_retention_days_after_decision: 90,
  coach_application_reference_min_count: 1,
  coach_application_reason_min_chars: 10,

  // Community Contribution (CONTRIB_V1, Phase 13A). Separate from every skill/trust decision.
  contribution_enabled: true,
  contribution_active_version: 'CONTRIB_V1',
  contribution_base_distinct_points: 10,
  contribution_newcomer_voucher_threshold: 1,
  contribution_newcomer_bonus: 5,
  contribution_reciprocal_multiplier: 0.25,
  contribution_ring_multiplier: 0,
  contribution_daily_full_credit_limit: 5,
  contribution_daily_reduced_credit_limit: 10,
  contribution_daily_reduced_multiplier: 0.5,
  contribution_daily_floor_multiplier: 0.1,
  contribution_decay_half_life_days: 180,
  contribution_level_base_points: 50,
  contribution_newcomer_badge_count: 5,
  contribution_streak_badge_weeks: 4,
  contribution_pillar_score: 500,
  contribution_builder_max_fact_rows: 5000,

  // Home leaderboards (LEADER_V1, Phase 13D). Most Bidded stays off until §16A.
  leaderboards_enabled: true,
  leaderboard_most_bidded_enabled: false,
  leaderboard_active_version: 'LEADER_V1',
  leaderboard_publish_cadence_hours: 24,
  leaderboard_home_limit: 10,
  leaderboard_full_limit: 100,
  leaderboard_builder_max_subjects: 5000,
  leaderboard_builder_max_scopes: 20,
  leaderboard_component_cap: 100,
  // Per-category caps (master_plan §1W). The cap guards a multi-component score against one runaway
  // component. Community Champions has a SINGLE component, so a cap there only truncates the leaders
  // into a tie - it is set high enough to never bind.
  leaderboard_component_cap_players: 100,
  leaderboard_component_cap_community: 1000000,
  leaderboard_component_cap_clubs: 100,
  leaderboard_club_movement_notify_places: 3,
  leaderboard_min_age: 18,
  leaderboard_exclude_unknown_dob: false,
  leaderboard_month_days: 30,
  leaderboard_season_start: '01-01',
  leaderboard_city_region_map: '{}',
  leaderboard_players_paused: false,
  leaderboard_community_paused: false,
  leaderboard_clubs_paused: false,
  leaderboard_milestone_notifications_enabled: true,
  leaderboard_player_min_score: 1,
  leaderboard_player_participation_weight: 4,
  leaderboard_player_placement_weight: 6,
  leaderboard_player_profile_weight: 1,
  leaderboard_player_skill_verified_weight: 1,
  leaderboard_community_min_score: 1,
  leaderboard_community_contribution_weight: 1,
  // 1 let a club with no contribution, no participation and one member onto the board on the
  // strength of the member count alone. 5 keeps empty clubs off without touching anyone real
  // (master_plan §1X).
  leaderboard_club_min_score: 5,
  leaderboard_club_participation_weight: 4,
  leaderboard_club_active_members_weight: 2,
  leaderboard_club_attendance_weight: 4,
  leaderboard_club_placement_weight: 6,
  leaderboard_club_contribution_weight: 1,

  // Site-wide announcement banner (handover §30.7). When enabled, shown to every visitor.
  announcement_banner_enabled: false,
  announcement_banner: '',

  // Launch / campaign welcome modal. Shown once per visitor per version, on any route, while enabled.
  // Copy is Admin-editable so a campaign can change without a deploy; bump the version to re-show it.
  welcome_modal_enabled: false,
  welcome_modal_version: '2026-09-08',
  welcome_modal_headline: 'Welcome to VouchPlay!',
  welcome_modal_subhead: 'Be part of the movement.',
  welcome_modal_event_label: 'Upcoming event',
  welcome_modal_event_name: 'B-Steel Hermosa 2026 Grand Pickleball Tournament - Rise of Empires',
  welcome_modal_detail: 'Registration opens Sep 9 at 5:00 PM.',
  welcome_modal_cta_note: 'Sign-up now to register tomorrow.',
  welcome_modal_image_url: '',
  welcome_modal_link_url: '',
} as const;

export type SystemSettingsKey = keyof typeof DEFAULT_SYSTEM_SETTINGS;

/**
 * STS_V1 algorithm constants (handover §10.6, §10.7). Changing any of these is a new algorithm
 * version - increment `STS_ALGORITHM_VERSION` and never mutate historical calculation semantics.
 */
export const STS_ALGORITHM_VERSION = 'STS_V1';

export const STS_CONSTANTS = {
  /** count_component = min(unique_active_vouchers / this, 1) */
  countDivisor: 5,
  /** weight_component = min(sum_effective_weights / this, 1) */
  weightDivisor: 7.5,
  /** agreement_component = max(0, 1 - min(dispersion / this, 1)) */
  dispersionDivisor: 2.0,
  /** Final blend: 0.50*count + 0.25*weight + 0.25*agreement, scaled to 0..5. */
  countCoefficient: 0.5,
  weightCoefficient: 0.25,
  agreementCoefficient: 0.25,
  scale: 5,
  min: 0.0,
  max: 5.0,
} as const;
