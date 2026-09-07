/**
 * @vouchplay/analytics - product-analytics event catalog (handover §52). Never include sensitive
 * identity/payment content in events. Scaffold placeholder with the critical domain events named.
 */
export const ANALYTICS_EVENTS = [
  'signup_completed',
  'profile_completed',
  'vouch_created',
  'skill_verified',
  'club_created',
  'tournament_published',
  'partner_team_formed',
  'registration_confirmed',
  'payment_verified',
  'eligibility_mismatch_flagged',
  'coach_application_submitted',
  'coach_application_withdrawn',
  'coach_application_resubmitted',
  'coach_application_information_requested',
  'coach_application_approved',
  'coach_application_rejected',
  'coach_role_revoked',
  'coach_evidence_opened',
  'leaderboard_viewed',
  'leaderboard_cta_selected',
  'leaderboard_privacy_changed',
  'leaderboard_rebuilt',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];
