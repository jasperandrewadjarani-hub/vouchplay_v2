-- =============================================================================
-- VouchPlay v2 - Migration 0025: Pay first, confirm the partner after
-- master_plan §1U. Handover §20 (partner invitations), §21 (teams), §23 (registration).
--
-- Today `accept_partner_invitation` is what CREATES the teams row, so until a partner taps accept
-- there is no team to register and nothing to pay for. This migration lets the team exist at partner
-- SELECTION - inviter confirmed, invitee pending - so the payer can go straight to the QR and the
-- receipt in one sitting, and the partner confirms afterwards.
--
-- Nothing about capacity changes: `register_team` already counts `payment_submitted` as occupying a
-- slot, so an uploaded receipt reserves the slot exactly as it does now.
--
-- NO RLS CHANGES ARE NEEDED. `is_team_member()` tests membership, not confirmation, so a pending
-- invitee is already able to read the team, the registration and its events.
--
-- BACKWARD COMPATIBLE BY DESIGN: every invitation already sitting in somebody's inbox has a NULL
-- team_id and keeps taking the original path. This is safe to apply during an open registration
-- window.
--
-- Apply via the Supabase SQL editor (same method as 0001-0024).
-- =============================================================================

-- ---------- 1. Link an invitation to a team that already exists ----------
alter table partner_invitations
  add column if not exists team_id uuid references teams (id) on delete cascade;

create index if not exists idx_partner_invitations_team on partner_invitations (team_id);

-- =============================================================================
-- 2. create_team_with_pending_partner - the new entry point for doubles.
--    Creates the team, confirms the inviter, adds the invitee UNCONFIRMED, and sends the invitation,
--    all in one transaction. The caller can then call register_team immediately.
-- =============================================================================
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

  -- Lock the division so two players cannot both claim the same partner concurrently.
  select * into v_div from divisions where id = p_division_id for update;
  if not found then raise exception 'division_not_found'; end if;
  if v_div.tournament_id <> p_tournament_id then raise exception 'division_not_found'; end if;
  if v_div.status <> 'open' then raise exception 'division_closed'; end if;

  select status into v_tourn_status from tournaments where id = p_tournament_id;
  if v_tourn_status <> 'registration_open' then raise exception 'registration_closed'; end if;

  -- Either player already on a live team in this division (§20.3, §21.4). A pending membership
  -- counts: one person cannot be named as a partner by two different players at once.
  if exists (
    select 1 from team_members tm
    join teams t on t.id = tm.team_id
    where t.division_id = p_division_id
      and t.status in ('forming','formed','locked')
      and tm.player_id in (p_inviter, p_invitee)
  ) then
    raise exception 'partner_conflict';
  end if;

  insert into teams (tournament_id, division_id, status)
    values (p_tournament_id, p_division_id, 'forming')
    returning id into v_team_id;

  -- The inviter is confirmed the moment they act. The invitee is deliberately NOT.
  insert into team_members (team_id, player_id, member_order, confirmed_at) values
    (v_team_id, p_inviter, 1, now()),
    (v_team_id, p_invitee, 2, null);

  insert into partner_invitations
    (tournament_id, division_id, inviter_id, invitee_id, message, status, expires_at, team_id)
    values (p_tournament_id, p_division_id, p_inviter, p_invitee, p_message, 'sent', p_expires_at, v_team_id)
    returning id into v_invitation_id;

  return json_build_object('team_id', v_team_id, 'invitation_id', v_invitation_id);
end $$;

-- =============================================================================
-- 3. accept_partner_invitation - extended, not replaced.
--    team_id NULL  -> original behaviour, creates the team (invitations already in flight).
--    team_id SET   -> stamp confirmed_at on the existing membership and form the team.
-- =============================================================================
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
    -- The team already exists and may already carry a paid registration. Confirm into it.
    -- The conflict check EXCLUDES this team, because the invitee is already a pending member of it.
    if exists (
      select 1 from team_members tm
      join teams t on t.id = tm.team_id
      where t.division_id = v_inv.division_id
        and t.status in ('forming','formed','locked')
        and t.id <> v_inv.team_id
        and tm.player_id = v_inv.invitee_id
    ) then
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

  -- ---- Original path: no team yet (invitations created before this migration). ----
  if exists (
    select 1 from team_members tm
    join teams t on t.id = tm.team_id
    where t.division_id = v_inv.division_id
      and t.status in ('forming','formed','locked')
      and tm.player_id in (v_inv.inviter_id, v_inv.invitee_id)
  ) then
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

-- =============================================================================
-- 4. decline_partner_invitation - frees the named partner without touching the payment.
--    The entry is NOT cancelled and the slot is NOT released: the money is in and the organizer has
--    a receipt to rule on (master_plan §1U).
-- =============================================================================
create or replace function public.decline_partner_invitation(p_invitation_id uuid, p_actor uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_inv partner_invitations%rowtype;
  v_reg_id uuid;
begin
  select * into v_inv from partner_invitations where id = p_invitation_id for update;
  if not found then raise exception 'invitation_not_found'; end if;
  if v_inv.invitee_id <> p_actor then raise exception 'not_invitee'; end if;
  if v_inv.status <> 'sent' then raise exception 'not_pending'; end if;

  update partner_invitations set status = 'declined', updated_at = now() where id = p_invitation_id;

  if v_inv.team_id is not null then
    -- Only ever removes an UNCONFIRMED membership. A partner who already accepted is never
    -- removed by this path (§1D stays intact).
    delete from team_members
      where team_id = v_inv.team_id and player_id = v_inv.invitee_id and confirmed_at is null;

    update teams set status = 'forming' where id = v_inv.team_id and status = 'formed';

    select r.id into v_reg_id from registrations r
      where r.team_id = v_inv.team_id
        and r.status not in ('withdrawn','cancelled','rejected')
      limit 1;
    if v_reg_id is not null then
      insert into registration_events (registration_id, actor_id, event_type, metadata)
        values (v_reg_id, p_actor, 'partner_declined',
                json_build_object('team_id', v_inv.team_id, 'invitation_id', p_invitation_id)::jsonb);
    end if;
  end if;

  return json_build_object('team_id', v_inv.team_id, 'registration_id', v_reg_id);
end $$;

-- =============================================================================
-- 5. replace_pending_partner - name a new partner after the last one said no.
--    Permitted ONLY when the previous invitee declined or their invitation expired. A partner who
--    accepted, or who is still deciding, can never be swapped out here (§1D).
--    Slot, payment and waitlist position are untouched.
-- =============================================================================
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

  -- The actor must be a CONFIRMED member of this team.
  if not exists (
    select 1 from team_members
    where team_id = p_team_id and player_id = p_actor and confirmed_at is not null
  ) then
    raise exception 'not_team_member';
  end if;

  -- Nobody may be displaced: the seat must actually be empty.
  if exists (select 1 from team_members where team_id = p_team_id and player_id <> p_actor) then
    raise exception 'seat_not_vacant';
  end if;

  -- And it must be empty because the last invitee said no (or ran out of time).
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

  if exists (
    select 1 from team_members tm
    join teams t on t.id = tm.team_id
    where t.division_id = v_team.division_id
      and t.status in ('forming','formed','locked')
      and tm.player_id = p_new_invitee
  ) then
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
