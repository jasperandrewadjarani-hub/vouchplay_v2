-- =============================================================================
-- VouchPlay v2 - apply 0041: Minimal vouching power (master_plan §2AN decision 5, handover §10.5 v1.67)
--
-- Paste-and-run copy of supabase/migrations/0041_minimal_account_weight.sql for the Supabase SQL
-- editor, with a verification SELECT appended.
--
-- Why: a voucher with no profile photo, no approved identity verification, and no active vouch
-- received from anyone yet is a MINIMAL account - the cheapest-to-fake shape a throwaway account can
-- take. Their vouches now carry the §10.5 weight x `weight_minimal_account_multiplier` (a fifth
-- source-credibility factor, NOT a change to the four LOCKED base weight rows). The code default
-- (packages/config/src/settings.ts) is already 0.5, so the app already behaves correctly before this
-- is applied; this just makes the key visible/tunable in the Admin Control Center.
--
-- What this does: DML ONLY, no DDL - seeds the one new admin-tunable `system_settings` key with
-- `on conflict (key) do nothing`, so re-running it (or an Admin edit already in place) is always safe.
-- =============================================================================

insert into system_settings (key, value, description) values
  ('weight_minimal_account_multiplier', '0.5'::jsonb, 'Applied to a voucher with no profile photo, no approved ID and no vouch received yet. 1 turns it off (§2AN)')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Verify: the minimal-account multiplier setting is present. Expect minimal_weight_setting=1.
-- ---------------------------------------------------------------------------
select 'minimal_weight_setting' as check, count(*)::int as value
  from system_settings
 where key = 'weight_minimal_account_multiplier';
