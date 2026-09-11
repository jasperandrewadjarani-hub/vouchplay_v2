-- =============================================================================
-- VouchPlay v2 - Phase A seed 0035: `new_account_badge_days` (Directory & organizer UX, §2AG A3, D5)
--
-- Why: the player directory's "New" badge / "New this week" filter (master_plan §2AG, decision D5)
-- needs an admin-tunable window in days, so Jasper can move the boundary from Admin without a
-- deploy. Recommended default is 7 days (matches `skill_v2_trust_maturity_days`'s "joined this
-- week" framing) - 24h expires before most visitors ever see the badge.
--
-- What this does: DML ONLY, no DDL - `system_settings` already exists (migration 0001). Seeds the
-- one new key with `on conflict (key) do nothing`, so re-running this (or an Admin edit already in
-- place) is always safe. Code default lives in `packages/config/src/settings.ts`
-- (`new_account_badge_days: 7`) and the Admin Control Center field is
-- `packages/config/src/settings-catalog.ts` (group `directory`).
--
-- Apply via the Supabase SQL editor (same method as 0001-0034), or let the executing session run it
-- live with the service role (same approach as `scripts/seed-admin.mjs`).
-- =============================================================================

insert into system_settings (key, value, description) values
  ('new_account_badge_days', '7'::jsonb, 'Days since onboarding a player still shows the neutral "New" pill / matches "New this week" (0 disables it, master_plan §2AG D5)')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Verify: the key is seeded. Expect value=1.
-- ---------------------------------------------------------------------------
select 'new_account_badge_days_seeded' as check, count(*)::int as value
  from system_settings
 where key = 'new_account_badge_days';
