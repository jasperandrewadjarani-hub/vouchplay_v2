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

  // Directory (master_plan §2AG A3, D5). Neutral "New" badge / "New this week" filter window.
  new_account_badge_days: 7,

  // Tournament defaults (handover §21.3, §22.1).
  default_max_divisions_per_player: 3,
  default_max_clubs_per_player: 3,
  default_division_capacity_teams: 20,
  // Per-player fee stamped on each of the 15 starter divisions of a new tournament, so an organizer
  // is not left with a set of free divisions to price one by one (master_plan §2J). Per player, in
  // the tournament's currency; the organizer can still edit or zero any division.
  default_division_fee_amount: 1000,
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
  // How long the receipt links in an export stay valid, counted from the moment of export (§2O).
  // 30 days covers a monthly registration cycle; each new export mints fresh links. Longer is more
  // convenient but a leaked export exposes private receipts for that whole window.
  export_receipt_link_days: 30,
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

  // Live "players online" counter in the header (master_plan §2S). Realtime presence, visible-tab
  // only; no DB rows and no Vercel functions. Off switches it off instantly with no deploy.
  online_counter_enabled: true,

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

  // Rig-resistant Community Skill (STS_V2, master_plan §2AF). Operational values only - the STS_V2
  // structural constants are version-locked in STS_V2_CONSTANTS below, not here.
  // The public switch: which algorithm feeds CSL/STS/Skill-Verified/eligibility. Flipping this is a
  // no-deploy, instantly reversible Admin action (§2AF rollout step 2).
  skill_algorithm_active_version: 'STS_V1',
  // Kill switch for the velocity hold (the one live automatic guard, §2AF anomaly table).
  vouch_velocity_guard_enabled: true,
  // Voucher trust VT(u): a brand-new account nobody has vouched for and who is unanchored.
  skill_v2_trust_unknown_factor: 0.25,
  // Voucher trust VT(u): floor for an unanchored voucher who has received at least one vouch.
  skill_v2_trust_unanchored_factor: 0.6,
  // Voucher trust VT(u): standing (received vouches, reciprocal-excluded) saturates at this count.
  skill_v2_trust_standing_saturation: 3,
  // Voucher trust VT(u): account-age maturity ramps from 0.5x to 1.0x over this many days.
  skill_v2_trust_maturity_days: 7,
  // Independence IND(v): multiplier applied when the target also actively vouches the voucher back.
  skill_v2_reciprocal_multiplier: 0.5,
  // Independence IND(v): per-rank decay applied to each additional voucher inside the same club bloc.
  skill_v2_bloc_decay: 0.6,
  // Aggregation: weight given to the target's own self-rating as a Bayesian prior in the shrunk
  // weighted median.
  skill_v2_prior_weight: 2,
  // Skill Verified (V2): minimum independent-equivalent vouchers (N_eff), alongside the existing
  // skill_verified_min_sts threshold (reused, not duplicated).
  skill_v2_min_independent_vouchers: 2,
  // Velocity guard: rolling window (hours) in which a burst is measured.
  skill_v2_velocity_window_hours: 6,
  // Velocity guard: minimum vouches on one target inside the window to be a candidate burst.
  skill_v2_velocity_burst_min: 8,
  // Velocity guard: minimum share of the burst's vouches that must be low-trust to trigger a hold.
  skill_v2_velocity_low_trust_share: 0.6,
  // Velocity guard: voucher-trust (VT) ceiling below which a voucher counts as "low-trust" for the
  // burst share above.
  skill_v2_velocity_low_trust_vt: 0.5,
  // LOW_TRUST_SWARM flag: minimum active vouches from unanchored, zero-standing vouchers.
  skill_v2_swarm_min: 6,
  // RECIPROCAL_RING flag: minimum share of a >=4-vouch set that must be reciprocal edges.
  skill_v2_ring_reciprocal_share: 0.5,
  // CLUB_BLOC flag: minimum share of a >=4-vouch set supplied by one club.
  skill_v2_bloc_share: 0.6,
  // SPIKE flag: minimum skill-band distance (V1 vs V2, or CSL vs self-rating with low N_eff) to flag.
  skill_v2_spike_bands: 2,
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

/**
 * STS_V2 algorithm constants (master_plan §2AF). Version-locked and NOT admin-tunable, deliberately
 * identical in value and structure to STS_CONSTANTS (STS_V2 is still 0.50*count + 0.25*weight +
 * 0.25*agreement scaled to 0..5, so the number still means "confidence"). What changes for V2 is not
 * this formula but what feeds it: `count`/`weight`/`agreement` are computed from independent-equivalent
 * vouches (voucher-trust x independence), not raw voucher/weight sums - see
 * packages/core/src/skill/v2/. Changing any of these values would itself be a new algorithm version;
 * do not mutate historical calculation semantics.
 */
export const STS_V2_CONSTANTS = {
  /** count_component = min(n_eff / this, 1) */
  countDivisor: 5,
  /** weight_component = min(weight_sum_v2 / this, 1) */
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

/** The public skill-algorithm switch (`skill_algorithm_active_version`, §2AF). */
export const SKILL_ALGORITHM_VERSIONS = ['STS_V1', 'STS_V2'] as const;
export type SkillAlgorithmVersion = (typeof SKILL_ALGORITHM_VERSIONS)[number];
