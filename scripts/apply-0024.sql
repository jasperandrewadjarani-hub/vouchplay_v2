-- =============================================================================
-- APPLY MIGRATION 0024 - "Saw them play" vouches + peer-nominated achievements
-- Paste this whole file into the Supabase SQL editor and Run.
--
-- Safe to run while the app is live: it only ADDS two enum values. Nothing is dropped, renamed or
-- re-typed, and no existing row changes meaning. Re-running it is a no-op.
--
-- The Supabase SQL editor only displays the LAST statement's result, so the verification at the
-- bottom is deliberately ONE query that returns both counts.
-- =============================================================================

alter type vouch_interaction add value if not exists 'observed';

alter type achievement_issuer_type add value if not exists 'peer';

-- ---------- Verification (paste the result back) ----------
select 'vouch_interaction_observed' as check,
       count(*) as n
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'vouch_interaction' and e.enumlabel = 'observed'
union all
select 'achievement_issuer_peer' as check,
       count(*) as n
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'achievement_issuer_type' and e.enumlabel = 'peer';
-- Expect vouch_interaction_observed=1 and achievement_issuer_peer=1.
