-- =============================================================================
-- VouchPlay v2 - Migration 0026: per-player fees + early bird promo
-- master_plan §1V. Handover §22 (divisions), §24 (payment model).
--
-- 1. `divisions.fee_amount` stops meaning "the team pays this" and starts meaning "each player pays
--    this". Today the app stores a TEAM total and divides by team_size for display, so a doubles
--    division holding 3000 is shown to players as 1500 per player and collects 3000. After this
--    migration the same division holds 1500, is still shown as 1500 per player, and still collects
--    1500 x 2 = 3000.
--
--    NOTHING A PLAYER SEES OR PAYS CHANGES. This is a relabel of what the stored number means, so
--    that the organizer types the same figure the player reads. The conversion is exact for every
--    row (fee_amount / team_size) and is guarded so it can never run twice.
--
-- 2. Early bird: one global date range per tournament, and a per-division early amount. Outside the
--    window, or with no early amount set, the normal per-player fee applies.
--
-- Apply via the Supabase SQL editor (same method as 0001-0025).
-- =============================================================================

-- ---------- 1. Early bird columns ----------
alter table tournaments
  add column if not exists early_bird_starts_at timestamptz,
  add column if not exists early_bird_ends_at   timestamptz;

alter table divisions
  add column if not exists early_bird_fee_amount numeric(10, 2)
    check (early_bird_fee_amount is null or early_bird_fee_amount >= 0);

comment on column divisions.fee_amount is
  'Entry fee PER PLAYER (migration 0026). A doubles team pays fee_amount x team_size.';
comment on column divisions.early_bird_fee_amount is
  'Optional discounted fee PER PLAYER while the tournament early-bird window is open.';

-- ---------- 2. One-time, guarded conversion of team totals to per-player ----------
-- The guard row makes this idempotent: re-running the script cannot halve the fees again.
do $$
begin
  if not exists (select 1 from system_settings where key = 'division_fee_is_per_player') then
    update divisions
       set fee_amount = round(fee_amount / greatest(team_size, 1), 2)
     where fee_amount > 0
       and team_size > 1;

    insert into system_settings (key, value)
      values ('division_fee_is_per_player', 'true'::jsonb)
      on conflict (key) do update set value = excluded.value;
  end if;
end $$;

-- ---------- 3. Effective per-player fee, in one place ----------
-- Used by the app so the price a player is quoted and the price the organizer configured can never
-- drift apart. Returns the early-bird amount only while the tournament window is genuinely open.
create or replace function public.division_effective_fee(p_division_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
           when d.early_bird_fee_amount is not null
            and t.early_bird_starts_at is not null
            and t.early_bird_ends_at is not null
            and now() >= t.early_bird_starts_at
            and now() <= t.early_bird_ends_at
           then d.early_bird_fee_amount
           else d.fee_amount
         end
    from divisions d
    join tournaments t on t.id = d.tournament_id
   where d.id = p_division_id;
$$;

revoke all on function public.division_effective_fee(uuid) from public, anon;
grant execute on function public.division_effective_fee(uuid) to authenticated, service_role;

-- =============================================================================
-- VERIFICATION - run as the LAST statement (the SQL editor shows only the final result).
-- Expected: early_bird_tournament_cols=2, early_bird_division_col=1, effective_fee_fn=1,
--           per_player_flag=1.
-- fee_3000_divisions should be 0 and fee_1500_divisions should be 11 after conversion
-- (they were 3000 per TEAM before, and are 1500 per PLAYER after - the same money).
-- =============================================================================
select 'early_bird_tournament_cols' as check, count(*)::int as value
  from information_schema.columns
 where table_schema = 'public' and table_name = 'tournaments'
   and column_name in ('early_bird_starts_at','early_bird_ends_at')
union all
select 'early_bird_division_col', count(*)::int
  from information_schema.columns
 where table_schema = 'public' and table_name = 'divisions'
   and column_name = 'early_bird_fee_amount'
union all
select 'effective_fee_fn', count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'division_effective_fee'
union all
select 'per_player_flag', count(*)::int
  from system_settings where key = 'division_fee_is_per_player'
union all
select 'fee_3000_divisions', count(*)::int from divisions where fee_amount = 3000
union all
select 'fee_1500_divisions', count(*)::int from divisions where fee_amount = 1500;
