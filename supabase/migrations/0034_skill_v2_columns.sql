-- 0034_skill_v2_columns.sql
-- Rig-resistant Community Skill: the "independent evidence" model, STS_V2 (master_plan §2AF).
--
-- Why: vouch blocs (clubs, reciprocal pairs, fresh-account swarms) are inflating rivals and
-- deflating friends because the locked §10 model treats every vouch as an independent opinion.
-- STS_V2 weighs each vouch by voucher-trust x independence (reciprocity/club-bloc decay) and
-- shrinks toward the player's own self-rating until real, cross-club evidence accumulates.
--
-- What this migration does: adds six nullable columns to player_skill_profiles so V2 can be
-- computed and stored ALONGSIDE the existing V1 columns on every vouch write, with nothing public
-- changed yet. Additive, nullable, no RLS change (the table's existing RLS already covers these
-- columns) and no backfill - existing rows simply get nulls until the app starts writing V2.
-- App reads are fail-open (the §2R pattern): until this migration is applied, the V2 write inside
-- the recompute path no-ops, so nothing breaks on a live registration event. The public
-- CSL/STS/Skill-Verified/eligibility outputs continue to read V1 through the accessor until an
-- Admin flips `skill_algorithm_active_version` to 'STS_V2' after reviewing the shadow report - see
-- scripts/skill-v2-shadow-report.mjs and scripts/backfill-skill-v2.mjs.
--
-- Also seeds the 18 new admin-tunable `system_settings` keys for STS_V2 (trust, independence,
-- prior, velocity-guard, and anomaly-flag thresholds) plus the public algorithm-version switch and
-- the velocity-guard kill switch. Existing keys are left untouched (on conflict do nothing) so an
-- Admin's prior edits are never overwritten by a redeploy. The STS_V2 structural constants
-- (STS_V2_CONSTANTS in @vouchplay/config) are version-locked, NOT admin-tunable, and therefore not
-- seeded here - only operational values live in system_settings.
--
-- Apply via the Supabase SQL editor (same method as 0001-0033); see scripts/apply-0034.sql.

alter table public.player_skill_profiles
  add column if not exists community_skill_level_v2 smallint,
  add column if not exists sts_v2 numeric(2, 1),
  add column if not exists n_eff_v2 numeric,
  add column if not exists weight_sum_v2 numeric,
  add column if not exists components_v2 jsonb,
  add column if not exists calculated_v2_at timestamptz;

comment on column public.player_skill_profiles.community_skill_level_v2 is
  'STS_V2 shrunk weighted median skill ordinal (master_plan §2AF). Null until computed; read only through the version-aware accessor.';
comment on column public.player_skill_profiles.sts_v2 is
  'STS_V2 confidence score, same 0..5 structure as sts (STS_V2_CONSTANTS), fed by independent-equivalent evidence instead of raw counts.';
comment on column public.player_skill_profiles.n_eff_v2 is
  'Independent-equivalent voucher count (sum of voucher-trust x independence weights, prior excluded). Drives Skill Verified (V2) alongside sts_v2.';
comment on column public.player_skill_profiles.weight_sum_v2 is
  'Sum of STS_V2 effective weights (credential x voucher-trust x independence) feeding sts_v2''s weight component.';
comment on column public.player_skill_profiles.components_v2 is
  'STS_V2 component breakdown (count/weight/agreement/dispersion) plus any anomaly-flag context, for moderation and the shadow report.';
comment on column public.player_skill_profiles.calculated_v2_at is
  'Timestamp of the most recent STS_V2 computation for this player. Null until the first V2 recompute.';

insert into system_settings (key, value, description) values
  ('skill_algorithm_active_version', '"STS_V1"'::jsonb, 'Public skill-algorithm switch: STS_V1 (unchanged) or STS_V2 (independent-evidence model) (§2AF)'),
  ('vouch_velocity_guard_enabled', 'true'::jsonb, 'Kill switch for the automatic velocity hold on low-trust vouch bursts (§2AF)'),
  ('skill_v2_trust_unknown_factor', '0.25'::jsonb, 'STS_V2 voucher trust: brand-new unanchored, zero-standing account factor (§2AF)'),
  ('skill_v2_trust_unanchored_factor', '0.6'::jsonb, 'STS_V2 voucher trust: unanchored floor once the voucher has received a vouch (§2AF)'),
  ('skill_v2_trust_standing_saturation', '3'::jsonb, 'STS_V2 voucher trust: received-vouch count at which standing saturates (§2AF)'),
  ('skill_v2_trust_maturity_days', '7'::jsonb, 'STS_V2 voucher trust: days for account-age maturity to ramp 0.5x to 1.0x (§2AF)'),
  ('skill_v2_reciprocal_multiplier', '0.5'::jsonb, 'STS_V2 independence: multiplier for a reciprocal (mutual) vouch pair (§2AF)'),
  ('skill_v2_bloc_decay', '0.6'::jsonb, 'STS_V2 independence: per-rank decay within a shared-club voucher bloc (§2AF)'),
  ('skill_v2_prior_weight', '2'::jsonb, 'STS_V2 aggregation: Bayesian prior weight of the player''s own self-rating (§2AF)'),
  ('skill_v2_min_independent_vouchers', '2'::jsonb, 'STS_V2 Skill Verified: minimum independent-equivalent vouchers (N_eff) (§2AF)'),
  ('skill_v2_velocity_window_hours', '6'::jsonb, 'STS_V2 velocity guard: rolling burst-detection window in hours (§2AF)'),
  ('skill_v2_velocity_burst_min', '8'::jsonb, 'STS_V2 velocity guard: minimum vouches on one target inside the window (§2AF)'),
  ('skill_v2_velocity_low_trust_share', '0.6'::jsonb, 'STS_V2 velocity guard: low-trust share of a burst required to trigger a hold (§2AF)'),
  ('skill_v2_velocity_low_trust_vt', '0.5'::jsonb, 'STS_V2 velocity guard: voucher-trust ceiling counted as low-trust (§2AF)'),
  ('skill_v2_swarm_min', '6'::jsonb, 'STS_V2 anomaly flag LOW_TRUST_SWARM: minimum unanchored, zero-standing active vouches (§2AF)'),
  ('skill_v2_ring_reciprocal_share', '0.5'::jsonb, 'STS_V2 anomaly flag RECIPROCAL_RING: minimum reciprocal share of a >=4-vouch set (§2AF)'),
  ('skill_v2_bloc_share', '0.6'::jsonb, 'STS_V2 anomaly flag CLUB_BLOC: minimum one-club share of a >=4-vouch set (§2AF)'),
  ('skill_v2_spike_bands', '2'::jsonb, 'STS_V2 anomaly flag SPIKE: minimum skill-band distance to flag (§2AF)')
on conflict (key) do nothing;
