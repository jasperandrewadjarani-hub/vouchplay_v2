-- 0037_newcomer_vouching.sql
-- Newcomer vouching controls: new accounts spamming vouches (master_plan §2AJ).
--
-- Why: today the only voucher-side check is the rolling 24h cap, and it is currently 0 = unlimited
-- for both players and coaches (2026-09-07 launch decision). A one-minute-old account can vouch
-- without limit, at full weight. Live data (398 six-day-old accounts, 4,187 active vouches) shows
-- age itself is not a usable signal - honest players vouch within minutes of joining - so the two
-- controls below key on anchors and received-vouch standing instead:
--   1) Newcomer caps (voucher-side, hard): while an account is not anchored AND has received-vouch
--      standing below `vouch_newcomer_graduate_standing`, its 24h vouch/request caps are the
--      stricter newcomer numbers below (applied only when stricter than the global cap).
--   2) SINGLE_PURPOSE_CLUSTER (target-side, reversible hold): the puppet-farm shape - see
--      `packages/core/src/skill/v2/anomalies.ts` (`detectSinglePurposeCluster`) and its thresholds
--      (`skill_v2_cluster_*`). Shadow-run against live data: 0 of 377 targets trip it.
--
-- What this migration does: seeds the 7 new admin-tunable `system_settings` keys for the newcomer
-- caps, the graduation threshold, and the cluster-hold thresholds + kill switch. No schema changes,
-- no security-definer functions. Existing keys are left untouched (on conflict do nothing) so an
-- Admin's prior edits are never overwritten by a redeploy.
--
-- Apply via the Supabase SQL editor (same method as 0001-0036).

insert into system_settings (key, value, description) values
  ('vouch_newcomer_per_24h', '5'::jsonb, 'Newcomer vouch cap per 24h, stricter than the player cap when it applies. 0 = no newcomer cap (§2AJ)'),
  ('vouch_newcomer_requests_per_24h', '5'::jsonb, 'Newcomer vouch-request cap per 24h, stricter than the request cap when it applies. 0 = no newcomer cap (§2AJ)'),
  ('vouch_newcomer_graduate_standing', '1'::jsonb, 'Received-vouch standing at which a newcomer becomes established and the newcomer caps stop applying (§2AJ)'),
  ('vouch_cluster_guard_enabled', 'true'::jsonb, 'Kill switch for the automatic SINGLE_PURPOSE_CLUSTER hold (§2AJ)'),
  ('skill_v2_cluster_max_outgoing', '2'::jsonb, 'SINGLE_PURPOSE_CLUSTER: max active vouches given by a voucher for it to count as single-purpose (§2AJ)'),
  ('skill_v2_cluster_min', '4'::jsonb, 'SINGLE_PURPOSE_CLUSTER: minimum single-purpose vouches on a target before the cluster hold is considered (§2AJ)'),
  ('skill_v2_cluster_share', '0.5'::jsonb, 'SINGLE_PURPOSE_CLUSTER: minimum share of a target''s vouches that must be single-purpose to trigger a hold (§2AJ)')
on conflict (key) do nothing;
