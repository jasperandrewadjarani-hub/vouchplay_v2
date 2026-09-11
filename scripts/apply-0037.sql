-- =============================================================================
-- VouchPlay v2 - apply 0037: Newcomer vouching controls (master_plan §2AJ)
--
-- Paste-and-run copy of supabase/migrations/0037_newcomer_vouching.sql for the Supabase SQL editor,
-- with a verification SELECT appended.
--
-- Why: today the only voucher-side check is the rolling 24h cap, and it is currently 0 = unlimited
-- for both players and coaches (2026-09-07 launch decision). A one-minute-old account can vouch
-- without limit, at full weight. Live data (398 six-day-old accounts, 4,187 active vouches) shows
-- age itself is not a usable signal - honest players vouch within minutes of joining - so the two
-- controls this seeds key on anchors and received-vouch standing instead:
--   1) Newcomer caps (voucher-side, hard): while an account is not anchored AND has received-vouch
--      standing below `vouch_newcomer_graduate_standing`, its 24h vouch/request caps are the
--      stricter newcomer numbers below (applied only when stricter than the global cap).
--   2) SINGLE_PURPOSE_CLUSTER (target-side, reversible hold): the puppet-farm shape - thresholds
--      `skill_v2_cluster_*`. Shadow-run against live data: 0 of 377 targets trip it.
--
-- What this does: DML ONLY, no DDL - seeds the 7 new admin-tunable `system_settings` keys with
-- `on conflict (key) do nothing`, so re-running it (or an Admin edit already in place) is always
-- safe. Code defaults live in packages/config/src/settings.ts, so the app already behaves correctly
-- before this is applied; this just makes the keys visible/tunable in the Admin Control Center.
-- =============================================================================

insert into system_settings (key, value, description) values
  ('vouch_newcomer_per_24h', '5'::jsonb, 'Newcomer vouch cap per 24h, stricter than the player cap when it applies. 0 = no newcomer cap (§2AJ)'),
  ('vouch_newcomer_requests_per_24h', '5'::jsonb, 'Newcomer vouch-request cap per 24h, stricter than the request cap when it applies. 0 = no newcomer cap (§2AJ)'),
  ('vouch_newcomer_graduate_standing', '1'::jsonb, 'Received-vouch standing at which a newcomer becomes established and the newcomer caps stop applying (§2AJ)'),
  ('vouch_cluster_guard_enabled', 'true'::jsonb, 'Kill switch for the automatic SINGLE_PURPOSE_CLUSTER hold (§2AJ)'),
  ('skill_v2_cluster_max_outgoing', '2'::jsonb, 'SINGLE_PURPOSE_CLUSTER: max active vouches given by a voucher for it to count as single-purpose (§2AJ)'),
  ('skill_v2_cluster_min', '4'::jsonb, 'SINGLE_PURPOSE_CLUSTER: minimum single-purpose vouches on a target before the cluster hold is considered (§2AJ)'),
  ('skill_v2_cluster_share', '0.5'::jsonb, 'SINGLE_PURPOSE_CLUSTER: minimum share of a target''s vouches that must be single-purpose to trigger a hold (§2AJ)')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Verify: all 7 newcomer/cluster settings keys are present. Expect newcomer_settings=7.
-- ---------------------------------------------------------------------------
select 'newcomer_settings' as check, count(*)::int as value
  from system_settings
 where key in (
     'vouch_newcomer_per_24h', 'vouch_newcomer_requests_per_24h',
     'vouch_newcomer_graduate_standing', 'vouch_cluster_guard_enabled',
     'skill_v2_cluster_max_outgoing', 'skill_v2_cluster_min', 'skill_v2_cluster_share'
   );
