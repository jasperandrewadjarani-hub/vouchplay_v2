-- =============================================================================
-- VouchPlay v2 - Migration 0048: per-tournament partner-matchmaking switch
-- master_plan §2AV addendum 3. Handover §20.1, §17.3 (tournament fields).
--
-- The global Admin kill switch `partner_matchmaking_enabled` (0047) stays; this adds an ORGANIZER
-- switch per tournament so an organizer can turn the swipe deck off for their own event (it is then
-- greyed out / unavailable for that tournament, the global default staying on for everyone else).
-- Effective enabled = the Admin setting AND this column. Defaults to true (on), so nothing changes
-- for existing tournaments until an organizer turns it off.
--
-- SAFE TO APPLY DURING THE OPEN REGISTRATION WINDOW: one nullable-with-default boolean column.
-- Apply via the Supabase SQL editor (same method as 0001-0047).
-- =============================================================================

alter table tournaments
  add column if not exists partner_matchmaking_enabled boolean not null default true;

-- ---------- Verification ----------
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'tournaments'
   and column_name = 'partner_matchmaking_enabled';
