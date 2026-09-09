-- =============================================================================
-- VouchPlay v2 - Migration 0031: a partner conflict must ignore dead teams
-- master_plan §2J. Handover §20 (partner invitations), §21 (teams).
--
-- BUG: "One of you is already on a team in this division" blocked two players who had no active
-- entry there at all. The `partner_conflict` guard counted any team in status forming/formed/locked,
-- regardless of whether its registration was still alive. A team OUTLIVES its entry - withdrawing or
-- rejecting a registration left the team row `formed` - so a cancelled test from days earlier kept
-- both players "on a team" forever. Proven in production: Jasper and Christine were both still on a
-- `formed` team in Mixed Doubles Low Intermediate whose only registration was `withdrawn`.
--
-- FIX: a team only counts as OCCUPIED when it has an active (non-closed) registration. A team whose
-- registrations are all withdrawn/cancelled/rejected - or which never registered at all (an
-- abandoned or failed attempt) - no longer blocks a fresh entry. This also lets a player retry after
-- a failed "Enter and pay" instead of being stuck on the orphan team it left behind.
--
-- The closed-status set matches every other guard in the schema: ('withdrawn','cancelled','rejected').
--
-- Apply via the Supabase SQL editor (same method as 0001-0030).
-- =============================================================================

-- ---------- Is the player on a LIVE, still-registered team in this division? ----------
create or replace function public.player_on_active_team_in_division(
  p_division_id uuid,
  p_player uuid,
  p_exclude_team uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from team_members tm
    join teams t on t.id = tm.team_id
    where t.division_id = p_division_id
      and t.status in ('forming', 'formed', 'locked')
      and tm.player_id = p_player
      and (p_exclude_team is null or t.id <> p_exclude_team)
      -- The team must still hold a live entry; a team whose registrations are all closed, or which
      -- has none, is not an occupied slot.
      and exists (
        select 1 from registrations r
        where r.team_id = t.id
          and r.status not in ('withdrawn', 'cancelled', 'rejected')
      )
  );
$$;

revoke all on function public.player_on_active_team_in_division(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.player_on_active_team_in_division(uuid, uuid, uuid) to service_role;

-- =============================================================================
-- Re-create the four RPCs whose partner-conflict guard had this bug. Bodies are unchanged except
-- the guard, which now calls the helper. (create or replace keeps each function's existing grants.)
-- =============================================================================

-- ---------- create_team_with_pending_partner (the reported path) ----------
create or replace function public.create_team_with_pending_partner(
  p_tournament_id uuid,
  p_division_id uuid,
  p_inviter uuid,
  p_invitee uuid,
  p_message text default null,
  p_expires_at timestamptz default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_div divisions%rowtype;
  v_tourn_status tournament_status;
  v_team_id uuid;
  v_invitation_id uuid;
begin
  if p_inviter = p_invitee then raise exception 'self_partner'; end if;

  select * into v_div from divisions where id = p_division_id for update;
  if not found then raise exception 'division_not_found'; end if;
  if v_div.tournament_id <> p_tournament_id then raise exception 'division_not_found'; end if;
  if v_div.status <> 'open' then raise exception 'division_closed'; end if;

  select status into v_tourn_status from tournaments where id = p_tournament_id;
  if v_tourn_status <> 'registration_open' then raise exception 'registration_closed'; end if;

  -- Either player already on a LIVE, registered team in this division (§20.3, §21.4). A dead team
  -- (all registrations closed, or none) no longer counts - that was the §2J bug.
  if public.player_on_active_team_in_division(p_division_id, p_inviter)
     or public.player_on_active_team_in_division(p_division_id, p_invitee) then
    raise exception 'partner_conflict';
  end if;

  insert into teams (tournament_id, division_id, status)
    values (p_tournament_id, p_division_id, 'forming')
    returning id into v_team_id;

  insert into team_members (team_id, player_id, member_order, confirmed_at) values
    (v_team_id, p_inviter, 1, now()),
    (v_team_id, p_invitee, 2, null);

  insert into partner_invitations
    (tournament_id, division_id, inviter_id, invitee_id, message, status, expires_at, team_id)
    values (p_tournament_id, p_division_id, p_inviter, p_invitee, p_message, 'sent', p_expires_at, v_team_id)
    returning id into v_invitation_id;

  return json_build_object('team_id', v_team_id, 'invitation_id', v_invitation_id);
end $$;

-- ---------- accept_partner_invitation (both guards) ----------
create or replace function public.accept_partner_invitation(p_invitation_id uuid, p_actor uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_inv partner_invitations%rowtype;
  v_recip_id uuid;
  v_team_id uuid;
begin
  select * into v_inv from partner_invitations where id = p_invitation_id for update;
  if not found then raise exception 'invitation_not_found'; end if;
  if v_inv.invitee_id <> p_actor then raise exception 'not_invitee'; end if;
  if v_inv.status <> 'sent' then raise exception 'not_pending'; end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    update partner_invitations set status = 'expired' where id = p_invitation_id;
    raise exception 'invitation_expired';
  end if;

  if v_inv.team_id is not null then
    -- Confirm into the existing team; the invitee's OWN team is excluded from the conflict check.
    if public.player_on_active_team_in_division(v_inv.division_id, v_inv.invitee_id, v_inv.team_id) then
      raise exception 'partner_conflict';
    end if;

    update team_members set confirmed_at = now()
      where team_id = v_inv.team_id and player_id = v_inv.invitee_id and confirmed_at is null;
    if not found then raise exception 'membership_not_pending'; end if;

    update teams set status = 'formed' where id = v_inv.team_id and status = 'forming';
    update partner_invitations set status = 'accepted', updated_at = now() where id = p_invitation_id;

    insert into registration_events (registration_id, actor_id, event_type, metadata)
      select r.id, p_actor, 'partner_confirmed',
             json_build_object('team_id', v_inv.team_id, 'invitation_id', p_invitation_id)::jsonb
        from registrations r
       where r.team_id = v_inv.team_id
         and r.status not in ('withdrawn','cancelled','rejected');

    return json_build_object('team_id', v_inv.team_id, 'merged', false, 'joined_existing', true);
  end if;

  -- Original path: no team yet.
  if public.player_on_active_team_in_division(v_inv.division_id, v_inv.inviter_id)
     or public.player_on_active_team_in_division(v_inv.division_id, v_inv.invitee_id) then
    raise exception 'partner_conflict';
  end if;

  select id into v_recip_id from partner_invitations
    where tournament_id = v_inv.tournament_id and division_id = v_inv.division_id
      and inviter_id = v_inv.invitee_id and invitee_id = v_inv.inviter_id and status = 'sent'
    for update;

  insert into teams (tournament_id, division_id, status)
    values (v_inv.tournament_id, v_inv.division_id, 'formed')
    returning id into v_team_id;
  insert into team_members (team_id, player_id, member_order, confirmed_at) values
    (v_team_id, v_inv.inviter_id, 1, now()),
    (v_team_id, v_inv.invitee_id, 2, now());

  update partner_invitations set status = 'accepted', updated_at = now() where id = p_invitation_id;
  if v_recip_id is not null then
    update partner_invitations set status = 'merged', updated_at = now() where id = v_recip_id;
  end if;

  return json_build_object('team_id', v_team_id, 'merged', (v_recip_id is not null), 'joined_existing', false);
end $$;

-- ---------- replace_pending_partner ----------
create or replace function public.replace_pending_partner(
  p_team_id uuid,
  p_actor uuid,
  p_new_invitee uuid,
  p_message text default null,
  p_expires_at timestamptz default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_team teams%rowtype;
  v_tourn_status tournament_status;
  v_div_status division_status;
  v_invitation_id uuid;
  v_reg_id uuid;
begin
  select * into v_team from teams where id = p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if p_actor = p_new_invitee then raise exception 'self_partner'; end if;

  if not exists (
    select 1 from team_members
    where team_id = p_team_id and player_id = p_actor and confirmed_at is not null
  ) then
    raise exception 'not_team_member';
  end if;

  if exists (select 1 from team_members where team_id = p_team_id and player_id <> p_actor) then
    raise exception 'seat_not_vacant';
  end if;

  if not exists (
    select 1 from partner_invitations
    where team_id = p_team_id and status in ('declined','expired')
  ) then
    raise exception 'no_declined_invitation';
  end if;

  select status into v_tourn_status from tournaments where id = v_team.tournament_id;
  if v_tourn_status <> 'registration_open' then raise exception 'registration_closed'; end if;
  select status into v_div_status from divisions where id = v_team.division_id;
  if v_div_status <> 'open' then raise exception 'division_closed'; end if;

  if public.player_on_active_team_in_division(v_team.division_id, p_new_invitee) then
    raise exception 'partner_conflict';
  end if;

  insert into team_members (team_id, player_id, member_order, confirmed_at)
    values (p_team_id, p_new_invitee, 2, null);

  insert into partner_invitations
    (tournament_id, division_id, inviter_id, invitee_id, message, status, expires_at, team_id)
    values (v_team.tournament_id, v_team.division_id, p_actor, p_new_invitee, p_message, 'sent',
            p_expires_at, p_team_id)
    returning id into v_invitation_id;

  select r.id into v_reg_id from registrations r
    where r.team_id = p_team_id and r.status not in ('withdrawn','cancelled','rejected')
    limit 1;
  if v_reg_id is not null then
    insert into registration_events (registration_id, actor_id, event_type, metadata)
      values (v_reg_id, p_actor, 'partner_replaced',
              json_build_object('team_id', p_team_id, 'new_invitee', p_new_invitee,
                                'invitation_id', v_invitation_id)::jsonb);
  end if;

  return json_build_object('team_id', p_team_id, 'invitation_id', v_invitation_id,
                           'registration_id', v_reg_id);
end $$;

-- ---------- change_partner ----------
create or replace function public.change_partner(
  p_team_id uuid,
  p_actor uuid,
  p_new_invitee uuid,
  p_message text default null,
  p_expires_at timestamptz default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_team teams%rowtype;
  v_div_status division_status;
  v_old_partner uuid;
  v_invitation_id uuid;
  v_reg_id uuid;
begin
  select * into v_team from teams where id = p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if p_actor = p_new_invitee then raise exception 'self_partner'; end if;

  if not public.player_registration_changes_are_open(v_team.tournament_id) then
    raise exception 'player_changes_locked';
  end if;

  select status into v_div_status from divisions where id = v_team.division_id;
  if v_div_status <> 'open' then raise exception 'division_closed'; end if;

  if not exists (
    select 1 from team_members
    where team_id = p_team_id and player_id = p_actor and confirmed_at is not null
  ) then
    raise exception 'not_team_member';
  end if;

  select player_id into v_old_partner
    from team_members where team_id = p_team_id and player_id <> p_actor limit 1;
  if v_old_partner is null then raise exception 'no_partner_to_replace'; end if;
  if v_old_partner = p_new_invitee then raise exception 'same_partner'; end if;

  if not public.player_fits_division(v_team.division_id, p_new_invitee) then
    raise exception 'partner_does_not_fit_division';
  end if;

  if public.player_on_active_team_in_division(v_team.division_id, p_new_invitee, p_team_id) then
    raise exception 'partner_conflict';
  end if;

  delete from team_members where team_id = p_team_id and player_id = v_old_partner;

  update partner_invitations
     set status = 'cancelled', updated_at = now()
   where team_id = p_team_id and invitee_id = v_old_partner and status = 'sent';

  insert into team_members (team_id, player_id, member_order, confirmed_at)
    values (p_team_id, p_new_invitee, 2, null);

  update teams set status = 'forming', updated_at = now()
   where id = p_team_id and status = 'formed';

  insert into partner_invitations
    (tournament_id, division_id, inviter_id, invitee_id, message, status, expires_at, team_id)
    values (v_team.tournament_id, v_team.division_id, p_actor, p_new_invitee, p_message, 'sent',
            p_expires_at, p_team_id)
    returning id into v_invitation_id;

  select r.id into v_reg_id from registrations r
   where r.team_id = p_team_id and r.status not in ('withdrawn','cancelled','rejected')
   limit 1;
  if v_reg_id is not null then
    insert into registration_events (registration_id, actor_id, event_type, metadata)
      values (v_reg_id, p_actor, 'partner_changed',
              json_build_object('team_id', p_team_id, 'removed_player', v_old_partner,
                                'new_invitee', p_new_invitee,
                                'invitation_id', v_invitation_id)::jsonb);
  end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot)
  values (p_actor, 'player', 'player_changed_partner', 'team', p_team_id,
          jsonb_build_object('partner', v_old_partner),
          jsonb_build_object('partner', p_new_invitee, 'invitation_id', v_invitation_id));

  return json_build_object('team_id', p_team_id, 'invitation_id', v_invitation_id,
                           'registration_id', v_reg_id, 'removed_player', v_old_partner);
end $$;

-- =============================================================================
-- VERIFICATION - run as the LAST statement (the SQL editor shows only the final result).
-- Expected: helper_fn=1, create_fn=1, accept_fn=1, replace_fn=1, change_fn=1.
-- jasper_christine_would_block_before is the count of the DEAD teams that used to block them in the
-- Mixed Doubles Low Intermediate division; after this migration those teams no longer count, so a
-- fresh entry is allowed. It is informational.
-- =============================================================================
select 'helper_fn' as check, count(*)::int as value
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='player_on_active_team_in_division'
union all
select 'create_fn', count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='create_team_with_pending_partner'
union all
select 'accept_fn', count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='accept_partner_invitation'
union all
select 'replace_fn', count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='replace_pending_partner'
union all
select 'change_fn', count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='change_partner'
union all
select 'dead_teams_no_longer_blocking', count(distinct t.id)::int
  from teams t join team_members tm on tm.team_id=t.id
 where t.status in ('forming','formed','locked')
   and not exists (select 1 from registrations r where r.team_id=t.id
                   and r.status not in ('withdrawn','cancelled','rejected'));
