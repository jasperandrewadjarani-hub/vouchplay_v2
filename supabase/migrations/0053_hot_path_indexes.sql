-- =============================================================================
-- VouchPlay v2 - Migration 0053: indexes for hot full-table scans (notes.md 2026-09-15 outage)
--
-- After the 2026-09-15 outage (Nano compute out of memory -> Disk IO budget throttled), pg_stat_user_tables
-- showed repeated full scans of two tables the app filters on columns with no index:
--
-- 1. vouch_revisions - the vouch rate-limit check counts a voucher's recent edits
--    (`changed_by = ? and created_at >= ?`, lib/actions/vouch.ts). Only (vouch_id, created_at) was indexed.
-- 2. notifications - reminder / nudge history is looked up by the entity it is about
--    (`type = ? and entity_id in (...)`, plus `actor_id = ?` in registration-queries.ts, reminders.ts,
--    payment.ts, registration.ts). Only recipient_id was indexed.
--
-- Additive only: two indexes, no data change, no function, no policy. `if not exists` makes it safe to re-run.
-- Tables are small (~10k rows) so each index builds in well under a second.
--
-- Numbering: 0052 is the next-entry discount (written, not yet applied). Organizer Phase B -> 0054, PIN lock -> 0055.
-- Apply via the Supabase SQL editor (same method as 0001-0051).
-- =============================================================================

create index if not exists idx_vouch_revisions_changed_by
  on vouch_revisions (changed_by, created_at);

create index if not exists idx_notifications_entity_type
  on notifications (entity_id, type);

-- ---------- Verification (returns 2 rows) ----------
select tablename, indexname
  from pg_indexes
 where schemaname = 'public'
   and indexname in ('idx_vouch_revisions_changed_by', 'idx_notifications_entity_type')
 order by indexname;
