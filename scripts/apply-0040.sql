-- =============================================================================
-- VouchPlay v2 - apply 0040: partner lock-in, open seats, consented partner changes
-- master_plan §2AM. Handover §18.4 (mixed composition), §20 (partner invitations), §21 (teams),
-- §23 (registration), §1D (nobody is displaced without their knowledge).
--
-- Paste-and-run copy of supabase/migrations/0040_partner_lock_and_open_seats.sql for the Supabase
-- SQL editor, with a verification SELECT appended.
--
-- Four problems, one migration:
--
-- 1. MIXED COMPOSITION WAS ENFORCED NOWHERE. `player_fits_division()` checks sex per player and only
--    for men/women divisions - its own comment says "'mixed' and 'genderless' accept anyone" - so a
--    mixed doubles division happily accepted two males or two females. §18.4 has required one male +
--    one female since handover v1.1. `team_partner_composition_ok()` is the single rule, and every RPC
--    that seats a player now calls it (§2AM decision 1). Singles, men, women and genderless divisions
--    are untouched, and the 17 live mixed teams are all valid already.
--
-- 2. A GENUINELY EMPTY SECOND SEAT DID NOT EXIST. The pay-first flow (§1U / migration 0025) required
--    naming a real partner up front, and the only vacant-seat state was "the named partner declined".
--    `create_solo_doubles_team()` creates a `forming` team with ONE confirmed member so a player can
--    enter and pay now and choose a partner later (§2AM decision 2), and `replace_pending_partner()`
--    is generalised to fill ANY vacant seat - never named, declined, expired or withdrawn - instead of
--    demanding a declined invitation first (§2AM decision 3). `cancel_partner_invitation()` closes the
--    matching bug on the other side: the old app-level cancel flipped the invitation row only and left
--    a zombie unconfirmed `team_members` row behind, so the seat read "not vacant" forever.
--
-- 3. PARTNER SWAPS WERE UNILATERAL. `change_partner` (0027/0031) swapped the other member "whether
--    confirmed or not". A confirmed partner is now removable ONLY through a consented release
--    (`partner_release_requests` + request/respond/cancel RPCs, §2AM decision 4); `change_partner` is
--    restricted to an UNCONFIRMED invitee and otherwise raises `partner_confirmed_needs_release`.
--    Withdrawing an unconfirmed invitee stays unilateral - they consented to nothing.
--
-- 4. THERE WAS NO PARTNER DEADLINE. `tournaments.partner_lock_at` (nullable) plus
--    `partner_lock_effective_at()` = coalesce(partner_lock_at, start_at - 7 days), computed live so an
--    organizer who moves the start date never carries a stale default (§2AM decision 5).
--
-- CRITICAL GATING NOTE (§2AM findings): partner actions are gated by `partner_changes_are_open()` -
-- tournament status in (registration_open, registration_closed) AND now < the effective lock - and
-- NEVER by registration close. Hermosa closes registration 2026-09-16 but starts 2026-10-16, so
-- gating partner selection on `status = 'registration_open'` (what 0025/0031 did) would have killed
-- every partner action on Sep 16 while 21 of 57 active entries still had an unconfirmed partner.
-- `player_registration_changes_are_open()` (0021) is deliberately left alone - it still gates cancel
-- and division moves, and is no longer used by any partner RPC.
--
-- NOTHING IS AUTO-CANCELLED at the lock, and a release NEVER touches the registration, the slot hold,
-- the waitlist position or the payment (§2AM decision 4): paid entries have money in them, and money
-- between two players is theirs and the organizer's to settle.
--
-- Apply via the Supabase SQL editor (same method as 0001-0034, 0036, 0038-0039).
-- =============================================================================

-- =============================================================================
-- 1. Organizer partner lock-in (§2AM decision 5)
-- =============================================================================
alter table public.tournaments
  add column if not exists partner_lock_at timestamptz;

comment on column public.tournaments.partner_lock_at is
  'Organizer partner lock-in (master_plan §2AM): the instant after which players may no longer invite, '
  'accept, release or swap partners. Null means the default - 7 days before start_at - which is '
  'computed live by partner_lock_effective_at(), so moving the start date never leaves a stale value. '
  'Declines always work, and the organizer''s own tools (confirm / reject / refund) are never gated.';

-- =============================================================================
-- 2. Plain helpers. Deliberately NOT `security definer`: they read only rows the caller may already
--    read, and they are called from inside the definer RPCs below (which execute as the function
--    owner, so EXECUTE is never an issue there).
--
--    They still carry the revoke/grant pair. Two reasons: defence in depth (nothing outside the
--    service role has a reason to call them directly), and `scripts/check-migration-grants.mjs`
--    matches `create function ... returns ... security definer` with an unbounded lazy gap, so a plain
--    function sitting ahead of a definer function in the same file is scanned as if it were one. The
--    revoke keeps that lint green and honest no matter what a later migration adds.
-- =============================================================================

-- ---------- Effective partner lock for a tournament ----------
create or replace function public.partner_lock_effective_at(p_tournament_id uuid)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select coalesce(t.partner_lock_at, t.start_at - interval '7 days')
    from tournaments t
   where t.id = p_tournament_id;
$$;

comment on function public.partner_lock_effective_at(uuid) is
  'Effective partner lock-in (master_plan §2AM): coalesce(partner_lock_at, start_at - 7 days). Null '
  'when the organizer set neither, and null for a tournament that does not exist.';

revoke all on function public.partner_lock_effective_at(uuid) from public, anon, authenticated;
grant execute on function public.partner_lock_effective_at(uuid) to service_role;

-- ---------- May players still change partners? ----------
-- Registration close is deliberately NOT a gate here (see the header note).
create or replace function public.partner_changes_are_open(p_tournament_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select t.status in ('registration_open', 'registration_closed')
         and (
           public.partner_lock_effective_at(t.id) is null
           or now() < public.partner_lock_effective_at(t.id)
         )
        from tournaments t
       where t.id = p_tournament_id
    ),
    false
  );
$$;

comment on function public.partner_changes_are_open(uuid) is
  'Player-side partner gate (master_plan §2AM): tournament status in (registration_open, '
  'registration_closed) AND now() is before the effective partner lock. Registration close never '
  'gates a partner action; false for a tournament that does not exist.';

revoke all on function public.partner_changes_are_open(uuid) from public, anon, authenticated;
grant execute on function public.partner_changes_are_open(uuid) to service_role;

-- ---------- Is this pair a legal team for this division? ----------
-- Only mixed DOUBLES constrains the pair: exactly one male and one female. Unknown sex can never
-- satisfy that, so a null sex fails closed. Every other division accepts any pair, and a team with
-- one member (p_player_b null) has nothing to compare.
create or replace function public.team_partner_composition_ok(
  p_division_id uuid,
  p_player_a uuid,
  p_player_b uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_player_a is null or p_player_b is null then true
    when not exists (
      select 1 from divisions d
       where d.id = p_division_id
         and d.format = 'doubles'
         and d.sex_classification = 'mixed'
    ) then true
    else (
      select count(*) filter (where p.sex = 'male') = 1
         and count(*) filter (where p.sex = 'female') = 1
        from profiles p
       where p.id in (p_player_a, p_player_b)
    )
  end;
$$;

comment on function public.team_partner_composition_ok(uuid, uuid, uuid) is
  'Mixed-doubles composition rule (master_plan §2AM, handover §18.4): a doubles division classified '
  '''mixed'' requires exactly one male and one female; an unknown sex fails closed. Every other '
  'division, and any team with only one member, returns true.';

revoke all on function public.team_partner_composition_ok(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.team_partner_composition_ok(uuid, uuid, uuid) to service_role;

-- =============================================================================
-- 3. partner_release_requests (§2AM decision 4) - removing a CONFIRMED partner needs their consent.
--    The row names who LEAVES and who must APPROVE (always the other confirmed member), so either
--    direction of the conversation - "please release my seat" and "I would like to leave" - is one
--    table. Writes are service-role only, through the RPCs below; players only ever read.
-- =============================================================================
do $$ begin
  create type partner_release_status as enum ('sent','accepted','declined','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists partner_release_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  tournament_id uuid not null references tournaments (id) on delete cascade,
  requested_by uuid not null references profiles (id),
  leaving_player uuid not null references profiles (id),
  approver uuid not null references profiles (id),
  status partner_release_status not null default 'sent',
  message text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_partner_release_requests_team
  on partner_release_requests (team_id, status);
-- One open request per team, enforced by the database as well as the RPC's row-locked check (§2AM).
create unique index if not exists uq_partner_release_requests_open
  on partner_release_requests (team_id) where status = 'sent';

-- No updated_at column on purpose: `resolved_at` is the only mutation this row ever sees, so there is
-- no set_updated_at trigger here.
alter table partner_release_requests enable row level security;

drop policy if exists partner_release_requests_read on partner_release_requests;
create policy partner_release_requests_read on partner_release_requests
  for select using (
    auth.uid() in (requested_by, leaving_player, approver)
    or public.is_tournament_organizer(auth.uid(), tournament_id)
    or public.is_staff(auth.uid())
  );
-- No insert/update/delete policies: every write goes through the SECURITY DEFINER RPCs below, called
-- by the service role from authored server actions.

-- =============================================================================
-- 4. New RPCs.
-- =============================================================================

-- ---------- create_solo_doubles_team: enter now, choose a partner later (§2AM decision 2) ----------
-- Creates a `forming` doubles team with ONE confirmed member. The caller then runs register_team and
-- pays exactly as it does today; the empty seat is filled later by replace_pending_partner.
create or replace function public.create_solo_doubles_team(
  p_tournament_id uuid,
  p_division_id uuid,
  p_actor uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_div divisions%rowtype;
  v_tourn_status tournament_status;
  v_team_id uuid;
begin
  -- Lock the division, exactly as the other entry points do, so concurrent entries serialize.
  select * into v_div from divisions where id = p_division_id for update;
  if not found then raise exception 'division_not_found'; end if;
  if v_div.tournament_id <> p_tournament_id then raise exception 'division_not_found'; end if;
  if v_div.format <> 'doubles' then raise exception 'not_doubles_division'; end if;
  if v_div.status <> 'open' then raise exception 'division_closed'; end if;

  -- This IS a registration, so it obeys registration status (unlike the partner actions below).
  select status into v_tourn_status from tournaments where id = p_tournament_id;
  if v_tourn_status <> 'registration_open' then raise exception 'registration_closed'; end if;

  if not public.player_fits_division(p_division_id, p_actor) then
    raise exception 'player_does_not_fit';
  end if;

  -- Already on a LIVE, still-registered team in this division (§20.3, §21.4, migration 0031).
  if public.player_on_active_team_in_division(p_division_id, p_actor, null) then
    raise exception 'partner_conflict';
  end if;

  insert into teams (tournament_id, division_id, status)
    values (p_tournament_id, p_division_id, 'forming')
    returning id into v_team_id;

  -- One confirmed member; seat 2 is deliberately left empty.
  insert into team_members (team_id, player_id, member_order, confirmed_at)
    values (v_team_id, p_actor, 1, now());

  return jsonb_build_object('team_id', v_team_id);
end $$;

revoke all on function public.create_solo_doubles_team(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_solo_doubles_team(uuid, uuid, uuid) to service_role;

-- ---------- cancel_partner_invitation: withdraw an invite AND free the seat (§2AM decision 4) ----------
-- The old app-level cancel updated the invitation row only and left the unconfirmed `team_members` row
-- behind, so the seat read "not vacant" and nobody could be named afterwards. This is atomic.
create or replace function public.cancel_partner_invitation(p_invitation_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv partner_invitations%rowtype;
begin
  select * into v_inv from partner_invitations where id = p_invitation_id for update;
  if not found then raise exception 'invitation_not_found'; end if;
  if v_inv.inviter_id <> p_actor then raise exception 'not_inviter'; end if;
  if v_inv.status <> 'sent' then raise exception 'not_pending'; end if;

  update partner_invitations set status = 'cancelled', updated_at = now() where id = p_invitation_id;

  if v_inv.team_id is not null then
    -- Only ever removes an UNCONFIRMED membership. A partner who already accepted is removed solely
    -- through the consented release flow below (§1D stays intact).
    delete from team_members
      where team_id = v_inv.team_id and player_id = v_inv.invitee_id and confirmed_at is null;

    update teams set status = 'forming', updated_at = now()
      where id = v_inv.team_id and status = 'formed';
  end if;

  -- invitee_id is returned so the caller ALWAYS tells the withdrawn player (§1D).
  return jsonb_build_object('team_id', v_inv.team_id, 'invitee_id', v_inv.invitee_id);
end $$;

revoke all on function public.cancel_partner_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_partner_invitation(uuid, uuid) to service_role;

-- ---------- request_partner_release: ask to break up a CONFIRMED pair (§2AM decision 4) ----------
-- Either player may start it. The approver is ALWAYS the other confirmed member:
--   * "I want to leave"            (p_actor = p_leaving_player) -> the partner approves;
--   * "please release your seat"   (p_actor <> p_leaving_player) -> the leaving player approves.
create or replace function public.request_partner_release(
  p_team_id uuid,
  p_actor uuid,
  p_leaving_player uuid,
  p_message text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_team teams%rowtype;
  v_confirmed_count int;
  v_approver uuid;
  v_request_id uuid;
begin
  select * into v_team from teams where id = p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if v_team.status not in ('forming', 'formed') then raise exception 'team_not_active'; end if;

  if not public.partner_changes_are_open(v_team.tournament_id) then
    raise exception 'partner_lock_passed';
  end if;

  if not exists (
    select 1 from team_members
    where team_id = p_team_id and player_id = p_actor and confirmed_at is not null
  ) then
    raise exception 'not_team_member';
  end if;

  if not exists (
    select 1 from team_members
    where team_id = p_team_id and player_id = p_leaving_player and confirmed_at is not null
  ) then
    raise exception 'not_team_member';
  end if;

  -- There must be a real pair to break up. An unconfirmed invitee is withdrawn, not released.
  select count(*) into v_confirmed_count
    from team_members where team_id = p_team_id and confirmed_at is not null;
  if v_confirmed_count <> 2 then raise exception 'no_partner_to_release'; end if;

  if p_actor = p_leaving_player then
    select player_id into v_approver
      from team_members
     where team_id = p_team_id and confirmed_at is not null and player_id <> p_leaving_player
     limit 1;
  else
    v_approver := p_leaving_player;
  end if;
  if v_approver is null then raise exception 'no_partner_to_release'; end if;

  -- One open request per team (the teams row is locked above, so this cannot race).
  if exists (
    select 1 from partner_release_requests where team_id = p_team_id and status = 'sent'
  ) then
    raise exception 'release_already_pending';
  end if;

  insert into partner_release_requests
    (team_id, tournament_id, requested_by, leaving_player, approver, message)
    values (p_team_id, v_team.tournament_id, p_actor, p_leaving_player, v_approver, p_message)
    returning id into v_request_id;

  return jsonb_build_object('request_id', v_request_id, 'approver_id', v_approver,
                            'leaving_player', p_leaving_player);
end $$;

revoke all on function public.request_partner_release(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.request_partner_release(uuid, uuid, uuid, text) to service_role;

-- ---------- respond_partner_release: the approver decides (§2AM decision 4) ----------
create or replace function public.respond_partner_release(
  p_request_id uuid,
  p_actor uuid,
  p_accept boolean
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_req partner_release_requests%rowtype;
begin
  select * into v_req from partner_release_requests where id = p_request_id for update;
  if not found then raise exception 'release_request_not_found'; end if;
  if v_req.status <> 'sent' then raise exception 'not_pending'; end if;
  if v_req.approver <> p_actor then raise exception 'not_approver'; end if;

  -- A null p_accept is treated as a decline: the only irreversible branch is the one that removes a
  -- player from a paid entry, so it never runs on an absent answer.
  if not coalesce(p_accept, false) then
    -- Declining is ALWAYS allowed, lock or no lock: nobody is forced to give up their seat.
    update partner_release_requests
       set status = 'declined', resolved_at = now()
     where id = p_request_id;

    return jsonb_build_object('status', 'declined', 'removed_player', null,
                              'team_id', v_req.team_id);
  end if;

  -- Accepting restructures the team, so it obeys the lock like every other partner action.
  if not public.partner_changes_are_open(v_req.tournament_id) then
    raise exception 'partner_lock_passed';
  end if;

  perform 1 from teams where id = v_req.team_id for update;

  delete from team_members
    where team_id = v_req.team_id and player_id = v_req.leaving_player;

  -- Any invitation still in flight for this team is meaningless once the seat is reshuffled.
  update partner_invitations
     set status = 'cancelled', updated_at = now()
   where team_id = v_req.team_id and status = 'sent';

  update teams set status = 'forming', updated_at = now()
   where id = v_req.team_id and status in ('forming', 'formed');

  update partner_release_requests
     set status = 'accepted', resolved_at = now()
   where id = p_request_id;

  -- The registration, the slot hold, the waitlist position and the payment are NEVER touched
  -- (§2AM decision 4): a paid entry keeps its slot, and money between the two players is theirs and
  -- the organizer's to settle. The seat simply becomes open again.
  return jsonb_build_object('status', 'accepted', 'removed_player', v_req.leaving_player,
                            'team_id', v_req.team_id);
end $$;

revoke all on function public.respond_partner_release(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.respond_partner_release(uuid, uuid, boolean) to service_role;

-- ---------- cancel_partner_release: the requester changes their mind ----------
create or replace function public.cancel_partner_release(p_request_id uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_req partner_release_requests%rowtype;
begin
  select * into v_req from partner_release_requests where id = p_request_id for update;
  if not found then raise exception 'release_request_not_found'; end if;
  if v_req.requested_by <> p_actor then raise exception 'not_requester'; end if;
  if v_req.status <> 'sent' then raise exception 'not_pending'; end if;

  update partner_release_requests
     set status = 'cancelled', resolved_at = now()
   where id = p_request_id;

  return jsonb_build_object('request_id', p_request_id, 'status', 'cancelled',
                            'team_id', v_req.team_id);
end $$;

revoke all on function public.cancel_partner_release(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_partner_release(uuid, uuid) to service_role;

-- =============================================================================
-- 5. Re-created RPCs. Same signatures, same return types (`create or replace` cannot change either),
--    bodies taken from their latest versions in 0031 / 0025 with the §2AM rules folded in.
-- =============================================================================

-- ---------- create_team_with_pending_partner (+ composition) ----------
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

  -- §2AM decision 1: a mixed doubles team is one male + one female, checked at every door.
  if not public.team_partner_composition_ok(p_division_id, p_inviter, p_invitee) then
    raise exception 'mixed_pair';
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

revoke all on function public.create_team_with_pending_partner(uuid, uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_team_with_pending_partner(uuid, uuid, uuid, uuid, text, timestamptz)
  to service_role;

-- ---------- accept_partner_invitation (+ lock, re-fit and composition on the team branch) ----------
create or replace function public.accept_partner_invitation(p_invitation_id uuid, p_actor uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_inv partner_invitations%rowtype;
  v_recip_id uuid;
  v_team_id uuid;
  v_team_division uuid;
  v_other_member uuid;
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
    -- §2AM decision 5: seating a player is a partner action, gated by the lock and NOT by
    -- registration close.
    if not public.partner_changes_are_open(v_inv.tournament_id) then
      raise exception 'partner_lock_passed';
    end if;

    -- Confirm into the existing team; the invitee's OWN team is excluded from the conflict check.
    if public.player_on_active_team_in_division(v_inv.division_id, v_inv.invitee_id, v_inv.team_id) then
      raise exception 'partner_conflict';
    end if;

    -- §2AM decision 3: fit and composition are re-checked AT ACCEPTANCE. A community skill level can
    -- move between the invite and the accept, and the team's other seat can have changed hands.
    select t.division_id into v_team_division from teams t where t.id = v_inv.team_id;
    if not public.player_fits_division(v_team_division, v_inv.invitee_id) then
      raise exception 'player_does_not_fit';
    end if;

    select tm.player_id into v_other_member
      from team_members tm
     where tm.team_id = v_inv.team_id
       and tm.player_id <> v_inv.invitee_id
       and tm.confirmed_at is not null
     limit 1;
    if not public.team_partner_composition_ok(v_team_division, v_inv.invitee_id, v_other_member) then
      raise exception 'mixed_pair';
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

  -- Original path: no team yet (invitations created before migration 0025).
  if not public.partner_changes_are_open(v_inv.tournament_id) then
    raise exception 'partner_lock_passed';
  end if;

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

revoke all on function public.accept_partner_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_partner_invitation(uuid, uuid) to service_role;

-- ---------- replace_pending_partner (ANY vacant seat, lock-gated, fit + composition) ----------
-- §2AM decision 3. The `no_declined_invitation` requirement is GONE: a seat that was never named (the
-- new solo entry), or freed by a withdrawn invite or an approved release, is just as open as one a
-- player declined. The seat only has to be genuinely vacant and not already under offer.
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

  -- ...and it must not already be under offer to somebody.
  if exists (
    select 1 from partner_invitations where team_id = p_team_id and status = 'sent'
  ) then
    raise exception 'invitation_pending';
  end if;

  -- §2AM: gated by the partner lock, NOT by registration close (Hermosa closes a month before it
  -- starts). A closed division still accepts a partner for an entry it already holds.
  if not public.partner_changes_are_open(v_team.tournament_id) then
    raise exception 'partner_lock_passed';
  end if;
  select status into v_div_status from divisions where id = v_team.division_id;
  if v_div_status not in ('open', 'closed') then raise exception 'division_closed'; end if;

  if public.player_on_active_team_in_division(v_team.division_id, p_new_invitee) then
    raise exception 'partner_conflict';
  end if;

  -- The invitee must fit this division on their own, and the pair must be legal for it.
  if not public.player_fits_division(v_team.division_id, p_new_invitee) then
    raise exception 'player_does_not_fit';
  end if;
  if not public.team_partner_composition_ok(v_team.division_id, p_actor, p_new_invitee) then
    raise exception 'mixed_pair';
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

revoke all on function public.replace_pending_partner(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.replace_pending_partner(uuid, uuid, uuid, text, timestamptz)
  to service_role;

-- ---------- change_partner (UNCONFIRMED invitee only, lock-gated, composition) ----------
-- §2AM decision 4. Swapping somebody who already ACCEPTED is no longer a unilateral act: it raises
-- `partner_confirmed_needs_release` and the app points the player at the release flow instead.
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
  v_old_confirmed_at timestamptz;
  v_invitation_id uuid;
  v_reg_id uuid;
begin
  select * into v_team from teams where id = p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if p_actor = p_new_invitee then raise exception 'self_partner'; end if;

  -- Partner actions follow the partner lock, never the generic self-service window (§2AM).
  if not public.partner_changes_are_open(v_team.tournament_id) then
    raise exception 'partner_lock_passed';
  end if;

  select status into v_div_status from divisions where id = v_team.division_id;
  -- A closed division still allows swapping an unanswered invitee (parity with replace_pending_partner,
  -- §2AM): this is not a new registration. Locked/cancelled/draft still refuse.
  if v_div_status not in ('open', 'closed') then raise exception 'division_closed'; end if;

  -- Only a CONFIRMED member may restructure their own team.
  if not exists (
    select 1 from team_members
    where team_id = p_team_id and player_id = p_actor and confirmed_at is not null
  ) then
    raise exception 'not_team_member';
  end if;

  select player_id, confirmed_at into v_old_partner, v_old_confirmed_at
    from team_members where team_id = p_team_id and player_id <> p_actor limit 1;
  if v_old_partner is null then raise exception 'no_partner_to_replace'; end if;
  if v_old_partner = p_new_invitee then raise exception 'same_partner'; end if;

  -- A partner who already accepted can only leave with their own consent (§2AM decision 4).
  if v_old_confirmed_at is not null then
    raise exception 'partner_confirmed_needs_release';
  end if;

  -- The replacement must fit THIS division, so a swap cannot route around its rules.
  if not public.player_fits_division(v_team.division_id, p_new_invitee) then
    raise exception 'partner_does_not_fit_division';
  end if;

  if not public.team_partner_composition_ok(v_team.division_id, p_actor, p_new_invitee) then
    raise exception 'mixed_pair';
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

revoke all on function public.change_partner(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.change_partner(uuid, uuid, uuid, text, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Verify. Expect partner_lock_at_column=1, partner_release_requests_table=1, partner_rpcs=9.
-- The 9 RPCs are the 5 added here (create_solo_doubles_team, cancel_partner_invitation,
-- request_partner_release, respond_partner_release, cancel_partner_release) plus the 4 re-created
-- here (create_team_with_pending_partner, replace_pending_partner, accept_partner_invitation,
-- change_partner). All 9 must be SECURITY DEFINER and locked down (scripts/check-migration-grants.mjs).
-- ---------------------------------------------------------------------------
select 'partner_lock_at_column' as check, count(*)::int as value
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'tournaments'
   and column_name = 'partner_lock_at'
union all
select 'partner_release_requests_table' as check, count(*)::int as value
  from information_schema.tables
 where table_schema = 'public'
   and table_name = 'partner_release_requests'
union all
select 'partner_rpcs' as check, count(*)::int as value
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and prosecdef
   and proname in (
     'create_solo_doubles_team',
     'cancel_partner_invitation',
     'request_partner_release',
     'respond_partner_release',
     'cancel_partner_release',
     'create_team_with_pending_partner',
     'replace_pending_partner',
     'accept_partner_invitation',
     'change_partner'
   );
