/**
 * Default system settings (handover §30.7). These are seed defaults for the `system_settings`
 * table. Domain logic must read live values from that table at runtime, not import these directly
 * for business decisions (handover coding standard: "no magic numeric business values").
 */

export const DEFAULT_SYSTEM_SETTINGS = {
  // Vouch rate limits (rolling 24h windows, not calendar-day).
  player_vouches_per_24h: 5,
  coach_vouches_per_24h: 20,
  vouch_requests_per_24h: 10,
  vouch_update_cooldown_days: 30,

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
  club_representation_required: false,
  verified_clubs_only: false,

  // Slot & payment timing (handover §23.1, §24).
  slot_hold_minutes: 30,
  submitted_payment_review_grace_hours: 24,

  // Privacy (handover §13.3).
  identity_file_retention_days_after_decision: 30,

  // Feature flags (handover §61).
  maintenance_mode: false,
  signup_enabled: true,
  role_applications_enabled: true,
  club_creation_enabled: true,
} as const;

export type SystemSettingsKey = keyof typeof DEFAULT_SYSTEM_SETTINGS;

/**
 * STS_V1 algorithm constants (handover §10.6, §10.7). Changing any of these is a new algorithm
 * version — increment `STS_ALGORITHM_VERSION` and never mutate historical calculation semantics.
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
