-- =============================================================================
-- VouchPlay v2 - Migration 0052: next-entry discount per division (master_plan §2BQ)
--
-- Organizers can set a cheaper price per player for a player's 2nd-or-later entry in the same
-- tournament (e.g. 1st entry PHP 1,500, every further entry PHP 1,000). No date window. The rule and
-- the per-seat arithmetic live in TypeScript (`packages/core/src/tournaments/fees.ts`); this migration
-- only stores the configured price and records why each receipt was priced the way it was.
--
-- 1. `divisions.next_entry_fee_amount` - optional price PER PLAYER for a next entry. Null = no
--    discount. The app refuses a value that is not lower than `fee_amount`.
-- 2. `tournament_slots.price_basis` / `payments.price_basis` - 'standard' | 'early_bird' |
--    'next_entry' for a seat; a team receipt stores one basis per seat in member order, comma-joined
--    (e.g. 'standard,next_entry'). Null on every existing row (priced before this feature existed).
--
-- Additive only. No existing column, policy or function changes; NO security definer functions.
-- Organizer Phase B moves to 0053 and PIN lock to 0054.
--
-- Apply via the Supabase SQL editor (same method as 0001-0051).
-- =============================================================================

alter table divisions
  add column if not exists next_entry_fee_amount numeric(10, 2)
    check (next_entry_fee_amount is null or next_entry_fee_amount >= 0);

comment on column divisions.next_entry_fee_amount is
  'Optional price PER PLAYER for a player''s 2nd-or-later live entry in a paid division of the same tournament (master_plan 2BQ). Null = no discount.';

alter table tournament_slots
  add column if not exists price_basis text;

comment on column tournament_slots.price_basis is
  'Why amount_due was charged: standard | early_bird | next_entry (master_plan 2BQ). Null for seats priced before 0052.';

alter table payments
  add column if not exists price_basis text;

comment on column payments.price_basis is
  'Per-seat price basis in member order, comma-joined, e.g. standard,next_entry (master_plan 2BQ). Null before 0052.';

-- ---------- Verification (returns 3 rows) ----------
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'divisions' and column_name = 'next_entry_fee_amount')
     or (table_name = 'tournament_slots' and column_name = 'price_basis')
     or (table_name = 'payments' and column_name = 'price_basis'))
 order by table_name;
