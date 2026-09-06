-- =============================================================================
-- APPLY: Migration 0011 — Eligibility / Anti-Sandbagging settings (Phase 9, §25).
-- Paste this whole block into the Supabase SQL editor (project itrosesiywpbaxtmucbb) and run it.
-- It seeds three admin-tunable eligibility thresholds (idempotent) and returns a verify count.
-- Expect the final row: eligibility_settings = 3.
-- The eligibility columns (registrations.eligibility_status + eligibility_snapshot) already exist
-- from migration 0008 — no schema change is needed here.
-- =============================================================================

insert into system_settings (key, value, description) values
  ('eligibility_min_unique_vouchers', '2'::jsonb,
   'Eligibility: minimum unique active vouchers to count as enough skill evidence (§25.4).'),
  ('eligibility_review_below_sts', '3.0'::jsonb,
   'Eligibility: STS below this flags a low-confidence review (§25.4).'),
  ('eligibility_enforce_hard_rules', 'false'::jsonb,
   'Eligibility: when true a hard-rule failure blocks registration; default keeps it decision-support (§25.2).')
on conflict (key) do nothing;

-- ---------- Verify ----------
select 'eligibility_settings' as check, count(*) as n
  from system_settings
  where key in ('eligibility_min_unique_vouchers','eligibility_review_below_sts','eligibility_enforce_hard_rules');
-- Expect: eligibility_settings = 3
