-- =============================================================================
-- VouchPlay v2 — Migration 0019: privacy-safe tournament demand interest
-- Planning interest is not registration, a reservation, eligibility, a tournament division, or PII.
-- =============================================================================

insert into system_settings (key, value, description) values
  ('tournament_demand_interest_enabled', 'true'::jsonb, 'Enable the planning-only tournament demand signal'),
  ('tournament_demand_anonymous_daily_limit', '12'::jsonb, 'Maximum new tournament demand signals per anonymous browser token in 24 hours'),
  ('tournament_demand_public_avatar_limit', '5'::jsonb, 'Maximum public signed-in avatars displayed for tournament demand')
on conflict (key) do nothing;

create table if not exists tournament_demand_interests (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  player_id uuid references profiles(id) on delete cascade,
  anonymous_key_hash text,
  division_key text not null check (division_key ~ '^[a-z0-9_]{3,64}$'),
  source text not null check (source in ('account', 'anonymous')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((player_id is not null and anonymous_key_hash is null and source = 'account') or
         (player_id is null and anonymous_key_hash is not null and source = 'anonymous'))
);
create unique index if not exists uq_tournament_demand_player
  on tournament_demand_interests(tournament_id, player_id) where player_id is not null;
create unique index if not exists uq_tournament_demand_anonymous
  on tournament_demand_interests(tournament_id, anonymous_key_hash) where anonymous_key_hash is not null;
create index if not exists idx_tournament_demand_tournament_updated
  on tournament_demand_interests(tournament_id, updated_at desc);
create index if not exists idx_tournament_demand_anon_created
  on tournament_demand_interests(anonymous_key_hash, created_at desc) where anonymous_key_hash is not null;
drop trigger if exists trg_tournament_demand_interests_updated_at on tournament_demand_interests;
create trigger trg_tournament_demand_interests_updated_at before update on tournament_demand_interests
  for each row execute function set_updated_at();

-- Preserve legacy authenticated interest records without mutating or deleting the historic source.
-- A legacy row has no truthful demand division, so it becomes an intentionally non-selectable
-- `legacy_unspecified` aggregate. DISTINCT prevents old multi-division rows inflating a person count.
insert into tournament_demand_interests (tournament_id, player_id, division_key, source, created_at, updated_at)
select distinct on (tournament_id, player_id)
  tournament_id, player_id, 'legacy_unspecified', 'account', created_at, created_at
from tournament_interests
order by tournament_id, player_id, created_at desc
on conflict do nothing;

alter table tournament_demand_interests enable row level security;
-- No direct table policies: public aggregate reads and writes are server-orchestrated only.

create or replace function public.submit_tournament_demand_interest(
  p_tournament_id uuid,
  p_player_id uuid,
  p_anonymous_key_hash text,
  p_division_key text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_division_key !~ '^[a-z0-9_]{3,64}$' then raise exception 'invalid demand division'; end if;
  if p_player_id is not null then
    insert into tournament_demand_interests (tournament_id, player_id, division_key, source)
    values (p_tournament_id, p_player_id, p_division_key, 'account')
    on conflict (tournament_id, player_id) where player_id is not null do update
      set division_key = excluded.division_key, updated_at = now();
  elsif p_anonymous_key_hash is not null and length(p_anonymous_key_hash) = 64 then
    insert into tournament_demand_interests (tournament_id, anonymous_key_hash, division_key, source)
    values (p_tournament_id, p_anonymous_key_hash, p_division_key, 'anonymous')
    on conflict (tournament_id, anonymous_key_hash) where anonymous_key_hash is not null do update
      set division_key = excluded.division_key, updated_at = now();
  else
    raise exception 'exactly one valid interest identity is required';
  end if;
end;
$$;

create or replace function public.get_tournament_demand_summary(
  p_tournament_id uuid,
  p_avatar_limit integer default 5
) returns jsonb language sql stable security definer set search_path = public as $$
  with demand as (
    select player_id, division_key, updated_at
    from tournament_demand_interests where tournament_id = p_tournament_id
  ), public_avatars as (
    select p.id, coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.nickname, 'VouchPlay player') as name,
      p.slug, p.avatar_path
    from demand d join profiles p on p.id = d.player_id
    where p.deleted_at is null and p.account_status = 'active'
      and coalesce(p.profile_visibility->>'directory', 'public') = 'public'
    order by d.updated_at desc limit greatest(0, least(coalesce(p_avatar_limit, 5), 12))
  )
  select jsonb_build_object(
    'total', (select count(*) from demand),
    'divisions', coalesce((select jsonb_agg(jsonb_build_object('key', division_key, 'count', n) order by division_key)
      from (select division_key, count(*)::integer as n from demand group by division_key) counts), '[]'::jsonb),
    'avatars', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug, 'avatarPath', avatar_path)) from public_avatars), '[]'::jsonb)
  );
$$;
revoke all on function public.submit_tournament_demand_interest(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.get_tournament_demand_summary(uuid,integer) from public, anon, authenticated;
grant execute on function public.submit_tournament_demand_interest(uuid,uuid,text,text) to service_role;
grant execute on function public.get_tournament_demand_summary(uuid,integer) to service_role;

select 'demand_settings' as check, count(*) as n from system_settings where key like 'tournament_demand_%'
union all select 'demand_table', count(*) from information_schema.tables where table_schema='public' and table_name='tournament_demand_interests'
union all select 'demand_rpcs', count(*) from information_schema.routines where routine_schema='public' and routine_name in ('submit_tournament_demand_interest','get_tournament_demand_summary')
union all select 'demand_direct_policies', count(*) from pg_policies where schemaname='public' and tablename='tournament_demand_interests';
-- Expect demand_settings=3, demand_table=1, demand_rpcs=2, demand_direct_policies=0.
