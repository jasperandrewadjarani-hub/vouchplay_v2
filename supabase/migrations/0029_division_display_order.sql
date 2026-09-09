-- =============================================================================
-- VouchPlay v2 - Migration 0029: organizer-controlled division order
-- master_plan §2C. Handover §22 (divisions).
--
-- Divisions were listed by `created_at`. That is not an order: the fifteen starter divisions are
-- written in ONE insert, so they share a timestamp to the microsecond and Postgres is free to
-- return them in any sequence. A brand new tournament showed Advanced above Beginner.
--
-- The canonical order (easiest band first; Men, Women, Mixed inside each band) is now computed in
-- code and needs no database change. THIS migration adds only the organizer's override.
--
-- `display_order` is deliberately NULLABLE and is NOT backfilled. Null means "use the canonical
-- order", so a division added next month still slots in where it belongs instead of landing at the
-- bottom of a hand-made list. A tournament only carries explicit positions once its organizer has
-- actually arranged one.
--
-- Apply via the Supabase SQL editor (same method as 0001-0028).
-- =============================================================================

alter table divisions
  add column if not exists display_order integer;

comment on column divisions.display_order is
  'Organizer''s explicit position within the tournament (migration 0029). NULL means use the '
  'canonical order: lowest skill band first, then Men, Women, Mixed.';

-- Ordering is always scoped to one tournament, so that is the index.
create index if not exists divisions_tournament_display_order_idx
  on divisions (tournament_id, display_order);
