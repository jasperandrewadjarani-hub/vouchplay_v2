-- =============================================================================
-- VouchPlay v2 — Migration 0011: Eligibility / Anti-Sandbagging settings (Phase 9)
-- Handover §25 (Tournament Eligibility Engine), §26.7.
--
-- The eligibility columns already exist (migration 0008 added registrations.eligibility_status +
-- eligibility_snapshot jsonb). Phase 9 fills them from the pure ELIG_V1 engine in @vouchplay/core.
-- This migration only SEEDS the admin-tunable thresholds the engine reads (never hardcoded, §30.7):
--   * eligibility_min_unique_vouchers  — minimum unique active vouchers for "enough evidence".
--   * eligibility_review_below_sts     — STS below this adds a low-confidence review reason.
--   * eligibility_enforce_hard_rules   — when true, a hard-rule failure blocks registration; the
--                                        default (false) keeps the engine decision-support only.
-- Idempotent (ON CONFLICT DO NOTHING). Apply via the Supabase SQL editor (same as 0001–0010).
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
