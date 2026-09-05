-- =============================================================================
-- VouchPlay v2 — Migration 0002: Seed system_settings
-- Mirrors DEFAULT_SYSTEM_SETTINGS in @vouchplay/config (handover §30.7). Safe to re-run:
-- existing keys are left untouched so Admin edits are never overwritten by a redeploy.
-- =============================================================================
insert into system_settings (key, value, description) values
  ('player_vouches_per_24h', '5'::jsonb, 'Rolling 24h vouch limit for normal players (§10.3)'),
  ('coach_vouches_per_24h', '20'::jsonb, 'Rolling 24h vouch limit for coaches (§10.3)'),
  ('vouch_requests_per_24h', '10'::jsonb, 'Rolling 24h vouch-request limit (§12)'),
  ('vouch_update_cooldown_days', '30'::jsonb, 'Cooldown before a vouch can be updated (§10.4)'),
  ('weight_normal', '1.0'::jsonb, 'Vouch weight: normal player (§10.5)'),
  ('weight_identity_verified', '1.25'::jsonb, 'Vouch weight: identity-verified player (§10.5)'),
  ('weight_coach', '2.0'::jsonb, 'Vouch weight: approved coach using coach toggle (§10.5)'),
  ('weight_identity_verified_coach', '2.5'::jsonb, 'Vouch weight: identity-verified coach (§10.5)'),
  ('skill_verified_min_sts', '3.0'::jsonb, 'Minimum STS for community Skill Verified (§10.8)'),
  ('skill_verified_min_unique_vouchers', '2'::jsonb, 'Minimum unique vouchers for Skill Verified (§10.8)'),
  ('default_max_divisions_per_player', '3'::jsonb, 'Default max divisions per player per tournament (§21.3)'),
  ('default_max_clubs_per_player', '3'::jsonb, 'Default max represented clubs per player per tournament (§22.1)'),
  ('club_representation_required', 'false'::jsonb, 'Whether tournaments require club representation (§22.1)'),
  ('verified_clubs_only', 'false'::jsonb, 'Whether only verified clubs may be represented (§22.2)'),
  ('slot_hold_minutes', '30'::jsonb, 'Temporary registration slot hold duration (§23.1)'),
  ('submitted_payment_review_grace_hours', '24'::jsonb, 'Organizer review grace after payment submitted (§23.1)'),
  ('identity_file_retention_days_after_decision', '30'::jsonb, 'Delete ID image N days after decision (§13.3)'),
  ('maintenance_mode', 'false'::jsonb, 'Global maintenance mode (§30.7, §61)'),
  ('signup_enabled', 'true'::jsonb, 'Whether new signups are allowed (§30.7)'),
  ('role_applications_enabled', 'true'::jsonb, 'Whether coach/organizer applications are open (§61)'),
  ('club_creation_enabled', 'true'::jsonb, 'Whether players may create clubs (§61)')
on conflict (key) do nothing;
