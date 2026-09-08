-- =============================================================================
-- VouchPlay v2 - Migration 0021: player registration-first management
-- Bounded card aggregates plus secure player cancellation and division moves. No partner is ever
-- replaced unilaterally. All state changes are service-role-only and append to immutable audit data.
-- Requires migration 0019 for tournament_demand_interests.
-- =============================================================================

insert into system_settings (key, value, description) values
  ('player_registration_self_service_enabled', 'true'::jsonb,
   'Allow player cancellation and eligible division changes before the configured lock'),
  ('player_registration_change_lock_hours_before_start', '24'::jsonb,
   'Hours before tournament start when player self-service registration changes close')
on conflict (key) do nothing;

create or replace function public.player_registration_changes_are_open(p_tournament_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tournament tournaments%rowtype;
  v_enabled boolean;
  v_lock_hours integer;
begin
  select * into v_tournament from tournaments where id = p_tournament_id;
  if not found or v_tournament.status <> 'registration_open' then return false; end if;
  if v_tournament.registration_close_at is not null and v_tournament.registration_close_at <= now() then
    return false;
  end if;
  select coalesce((value #>> '{}')::boolean, true) into v_enabled
    from system_settings where key = 'player_registration_self_service_enabled';
  if coalesce(v_enabled, true) is false then return false; end if;
  select coalesce((value #>> '{}')::integer, 24) into v_lock_hours
    from system_settings where key = 'player_registration_change_lock_hours_before_start';
  if v_tournament.start_at is not null
     and v_tournament.start_at <= now() + make_interval(hours => greatest(0, coalesce(v_lock_hours, 24))) then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.player_cancel_registration(
  p_registration_id uuid,
  p_actor uuid
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration registrations%rowtype;
  v_result json;
begin
  select * into v_registration from registrations where id = p_registration_id for update;
  if not found then raise exception 'registration_not_found'; end if;
  if not public.player_registration_changes_are_open(v_registration.tournament_id) then
    raise exception 'player_changes_locked';
  end if;
  if not exists (
    select 1 from team_members where team_id = v_registration.team_id and player_id = p_actor
  ) then
    raise exception 'not_team_member';
  end if;
  if v_registration.status not in ('payment_pending', 'waitlisted') then
    raise exception 'player_cancellation_not_allowed';
  end if;
  if exists (select 1 from payments where registration_id = v_registration.id) then
    raise exception 'payment_already_started';
  end if;

  v_result := public.release_slot(p_registration_id, p_actor, 'withdrawn');
  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot)
  values (
    p_actor, 'player', 'player_registration_cancelled', 'registration', p_registration_id,
    jsonb_build_object('status', v_registration.status), jsonb_build_object('status', 'withdrawn')
  );
  return v_result;
end;
$$;

create or replace function public.move_player_registration(
  p_registration_id uuid,
  p_target_division_id uuid,
  p_actor uuid
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration registrations%rowtype;
  v_team teams%rowtype;
  v_source divisions%rowtype;
  v_target divisions%rowtype;
  v_member_count integer;
  v_active_count integer;
begin
  select * into v_registration from registrations where id = p_registration_id for update;
  if not found then raise exception 'registration_not_found'; end if;
  if p_target_division_id = v_registration.division_id then raise exception 'same_division'; end if;
  if not public.player_registration_changes_are_open(v_registration.tournament_id) then
    raise exception 'player_changes_locked';
  end if;
  if not exists (
    select 1 from team_members where team_id = v_registration.team_id and player_id = p_actor
  ) then
    raise exception 'not_team_member';
  end if;
  if v_registration.status <> 'payment_pending' then
    raise exception 'player_division_change_not_allowed';
  end if;
  if exists (select 1 from payments where registration_id = v_registration.id) then
    raise exception 'payment_already_started';
  end if;

  -- Lock both divisions in a stable order before counting target capacity.
  perform 1 from divisions
    where id in (v_registration.division_id, p_target_division_id)
    order by id for update;
  select * into v_source from divisions where id = v_registration.division_id;
  select * into v_target from divisions where id = p_target_division_id;
  if not found or v_target.tournament_id <> v_registration.tournament_id then
    raise exception 'target_division_not_found';
  end if;
  if v_target.status <> 'open' then raise exception 'target_division_closed'; end if;
  if v_target.format <> v_source.format or v_target.team_size <> v_source.team_size then
    raise exception 'target_division_team_mismatch';
  end if;
  select count(*) into v_member_count from team_members where team_id = v_registration.team_id;
  if v_member_count <> v_target.team_size then raise exception 'target_division_team_mismatch'; end if;
  if exists (
    select 1 from registrations
    where team_id = v_registration.team_id and division_id = p_target_division_id
      and status not in ('withdrawn', 'cancelled', 'rejected')
  ) then raise exception 'already_registered'; end if;

  select count(*) into v_active_count from registrations r
    where r.division_id = p_target_division_id
      and (
        r.status in ('confirmed', 'payment_submitted', 'under_review')
        or (r.status = 'payment_pending' and r.slot_hold_expires_at > now())
      );
  if v_target.capacity_teams > 0 and v_active_count >= v_target.capacity_teams then
    raise exception 'target_division_full';
  end if;

  select * into v_team from teams where id = v_registration.team_id for update;
  update teams set division_id = p_target_division_id, updated_at = now() where id = v_team.id;
  update registrations set division_id = p_target_division_id, updated_at = now()
    where id = v_registration.id;
  insert into registration_events (registration_id, actor_id, event_type, from_status, to_status, metadata)
  values (
    v_registration.id, p_actor, 'division_changed', v_registration.status::text,
    v_registration.status::text,
    jsonb_build_object('fromDivisionId', v_source.id, 'toDivisionId', v_target.id)
  );
  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot)
  values (
    p_actor, 'player', 'player_registration_division_changed', 'registration', v_registration.id,
    jsonb_build_object('division_id', v_source.id, 'status', v_registration.status),
    jsonb_build_object('division_id', v_target.id, 'status', v_registration.status)
  );
  return json_build_object('registration_id', v_registration.id, 'division_id', v_target.id);
end;
$$;

create or replace function public.leave_team_after_cancel(
  p_team_id uuid,
  p_actor uuid
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams%rowtype;
  v_remaining_count integer;
  v_remaining_player_ids uuid[];
begin
  select * into v_team from teams where id = p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if not public.player_registration_changes_are_open(v_team.tournament_id) then
    raise exception 'player_changes_locked';
  end if;
  if not exists (select 1 from team_members where team_id = p_team_id and player_id = p_actor) then
    raise exception 'not_team_member';
  end if;
  if exists (
    select 1 from registrations
    where team_id = p_team_id and status not in ('withdrawn', 'cancelled', 'rejected')
  ) then raise exception 'team_has_active_registration'; end if;

  select array_agg(player_id) into v_remaining_player_ids
    from team_members where team_id = p_team_id and player_id <> p_actor;
  delete from team_members where team_id = p_team_id and player_id = p_actor;
  select count(*) into v_remaining_count from team_members where team_id = p_team_id;
  update teams set status = case when v_remaining_count = 0 then 'disbanded' else 'forming' end,
    updated_at = now() where id = p_team_id;
  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot)
  values (
    p_actor, 'player', 'player_left_team_after_cancellation', 'team', p_team_id,
    jsonb_build_object('member_count', v_remaining_count + 1),
    jsonb_build_object('member_count', v_remaining_count, 'status', case when v_remaining_count = 0 then 'disbanded' else 'forming' end)
  );
  return json_build_object('remaining_player_ids', coalesce(v_remaining_player_ids, '{}'::uuid[]));
end;
$$;

create or replace function public.get_tournament_card_engagement(
  p_tournament_ids uuid[],
  p_viewer_id uuid default null
) returns table (
  tournament_id uuid,
  interested_count integer,
  joining_count integer,
  viewer_interested boolean,
  viewer_joining boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with requested as (
    select distinct id as tournament_id from unnest(coalesce(p_tournament_ids, '{}'::uuid[])) as id
  ), demand as (
    select tournament_id, count(*)::integer as interested_count
    from tournament_demand_interests
    where tournament_id in (select tournament_id from requested)
    group by tournament_id
  ), joining as (
    select tournament_id, count(*)::integer as joining_count
    from registrations
    where tournament_id in (select tournament_id from requested)
      and status in ('payment_pending', 'payment_submitted', 'under_review', 'confirmed')
    group by tournament_id
  ), viewer_demand as (
    select tournament_id, true as viewer_interested
    from tournament_demand_interests
    where player_id = p_viewer_id and tournament_id in (select tournament_id from requested)
  ), viewer_joining as (
    select distinct r.tournament_id, true as viewer_joining
    from registrations r
    join team_members tm on tm.team_id = r.team_id and tm.player_id = p_viewer_id
    where r.tournament_id in (select tournament_id from requested)
      and r.status in ('payment_pending', 'payment_submitted', 'under_review', 'confirmed')
  )
  select r.tournament_id, coalesce(d.interested_count, 0), coalesce(j.joining_count, 0),
    coalesce(vd.viewer_interested, false), coalesce(vj.viewer_joining, false)
  from requested r
  left join demand d on d.tournament_id = r.tournament_id
  left join joining j on j.tournament_id = r.tournament_id
  left join viewer_demand vd on vd.tournament_id = r.tournament_id
  left join viewer_joining vj on vj.tournament_id = r.tournament_id;
$$;

revoke all on function public.player_registration_changes_are_open(uuid) from public, anon, authenticated;
revoke all on function public.player_cancel_registration(uuid, uuid) from public, anon, authenticated;
revoke all on function public.move_player_registration(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.leave_team_after_cancel(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_tournament_card_engagement(uuid[], uuid) from public, anon, authenticated;
revoke all on function public.register_team(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_slot(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.accept_partner_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.player_registration_changes_are_open(uuid) to service_role;
grant execute on function public.player_cancel_registration(uuid, uuid) to service_role;
grant execute on function public.move_player_registration(uuid, uuid, uuid) to service_role;
grant execute on function public.leave_team_after_cancel(uuid, uuid) to service_role;
grant execute on function public.get_tournament_card_engagement(uuid[], uuid) to service_role;
grant execute on function public.register_team(uuid, uuid) to service_role;
grant execute on function public.release_slot(uuid, uuid, text) to service_role;
grant execute on function public.accept_partner_invitation(uuid, uuid) to service_role;

select 'registration_change_settings' as check, count(*) as n
from system_settings
where key in ('player_registration_self_service_enabled', 'player_registration_change_lock_hours_before_start');

select 'registration_change_functions' as check, count(*) as n
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('player_registration_changes_are_open', 'player_cancel_registration', 'move_player_registration', 'leave_team_after_cancel');

select 'card_engagement_function' as check, count(*) as n
from pg_proc
where pronamespace = 'public'::regnamespace and proname = 'get_tournament_card_engagement';
-- Expect registration_change_settings=2, registration_change_functions=4,
-- and card_engagement_function=1.
