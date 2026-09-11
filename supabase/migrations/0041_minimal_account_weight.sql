-- 0041_minimal_account_weight.sql
-- Minimal vouching power (master_plan §2AN decision 5, handover §10.5 v1.67 amendment).
--
-- Why: a voucher with no profile photo, no approved identity verification, and no active vouch
-- received from anyone yet is a MINIMAL account - the cheapest-to-fake shape a throwaway account can
-- take. Their vouches now carry the §10.5 weight x `weight_minimal_account_multiplier` (a fifth
-- source-credibility factor, NOT a change to the four LOCKED base weight rows). The code default
-- (packages/config/src/settings.ts) is already 0.5, so the app already behaves correctly before this
-- migration is applied - this is DML-only, seeding the key so it is visible/tunable in the Admin
-- Control Center. Existing keys are left untouched (on conflict do nothing) so a prior Admin edit is
-- never overwritten by a redeploy.
--
-- No schema changes, no security-definer functions.
-- Apply via the Supabase SQL editor (same method as 0001-0040).

insert into system_settings (key, value, description) values
  ('weight_minimal_account_multiplier', '0.5'::jsonb, 'Applied to a voucher with no profile photo, no approved ID and no vouch received yet. 1 turns it off (§2AN)')
on conflict (key) do nothing;
