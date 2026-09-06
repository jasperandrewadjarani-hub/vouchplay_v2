-- =============================================================================
-- VouchPlay v2 — Migration 0010: Vouch tweaks (post-Phase-8 UX batch)
--   1. Add a 'both' option to vouch_interaction (played with AND against).
--   2. Shorten the vouch update cooldown from 30 days to 1 day (admin setting §10.4 — this is a
--      configurable value, not a hardcoded rule, so lowering the default is within spec).
-- Apply via the Supabase SQL editor (same method as 0001–0009).
-- =============================================================================

alter type vouch_interaction add value if not exists 'both';

update system_settings set value = '1'::jsonb where key = 'vouch_update_cooldown_days';

-- ---------- Verify ----------
select 'both_enum' as check, count(*) as n from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  where t.typname = 'vouch_interaction' and e.enumlabel = 'both'
union all
select 'cooldown_days', (value::text)::int from system_settings where key = 'vouch_update_cooldown_days';
-- Expect: both_enum = 1, cooldown_days = 1
