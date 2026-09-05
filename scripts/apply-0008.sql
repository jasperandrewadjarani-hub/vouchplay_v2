-- =============================================================================
-- VouchPlay v2 — Migration 0008: Partner, Team & Registration (Phase 7)
-- Handover §20 (Partner Finder), §21 (Registration state machine), §22 (Club Representation),
-- §23 (Slot Reservation & Concurrency), §36.23–36.27, §36.25A, §36.29, §37.
--
-- LOCKED non-negotiable (§23.2, §35.3): slot reservation is TRANSACTIONAL — confirmed + valid active
-- holds must never exceed division capacity. The capacity decision lives in the SECURITY DEFINER
-- function `register_team`, which locks the division row (SELECT … FOR UPDATE) so concurrent
-- registrations serialize; frontend counts are never trusted. Reciprocal partner cross-invites
-- (§20.4) merge atomically in `accept_partner_invitation`. Waitlist promotion on slot release runs
-- in `release_slot`. Payments (§24) are Phase 8 — registrations here reach CONFIRMED via organizer
-- action (the payment-proof/verify layer is added in Phase 8).
-- Apply via the Supabase SQL editor (same method as 0001–0007).
-- =============================================================================

-- ---------- Enums ----------
do $$ begin
  create type partner_invitation_status as enum ('sent','accepted','declined','cancelled','expired','merged');
exception when duplicate_object then null; end $$;

do $$ begin
  create type team_status as enum ('forming','formed','locked','withdrawn','disbanded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type registration_status as enum
    ('team_formed','payment_pending','payment_submitted','under_review','confirmed','waitlisted',
     'rejected','withdrawn','cancelled','refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type registration_eligibility as enum ('eligible','review','skill_mismatch','ineligible_hard_rule');
exception when duplicate_object then null; end $$;

do $$ begin
  create type waitlist_status as enum ('waiting','promoted','expired','removed');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- partner_invitations (§36.23, §20.2)
-- =============================================================================
create table if not exists partner_invitations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  division_id uuid not null references divisions (id) on delete cascade,
  inviter_id uuid not null references profiles (id) on delete cascade,
  invitee_id uuid not null references profiles (id) on delete cascade,
  message text check (message is null or char_length(message) <= 500),
  status partner_invitation_status not null default 'sent',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (inviter_id <> invitee_id)
);
create unique index if not exists uq_partner_invitations_pending
  on partner_invitations (tournament_id, division_id, inviter_id, invitee_id) where status = 'sent';
create index if not exists idx_partner_invitations_invitee on partner_invitations (invitee_id, status);
create index if not exists idx_partner_invitations_inviter on partner_invitations (inviter_id, status);

drop trigger if exists trg_partner_invitations_updated_at on partner_invitations;
create trigger trg_partner_invitations_updated_at before update on partner_invitations
  for each row execute function set_updated_at();

-- =============================================================================
-- teams (§36.24) — division-specific.
-- =============================================================================
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  division_id uuid not null references divisions (id) on delete cascade,
  status team_status not null default 'forming',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_teams_division on teams (division_id, status);

drop trigger if exists trg_teams_updated_at on teams;
create trigger trg_teams_updated_at before update on teams
  for each row execute function set_updated_at();

-- =============================================================================
-- team_members (§36.25). A player cannot be on two active teams in the same division — enforced in
-- the RPCs (cross-table rule). UNIQUE(team_id, player_id) prevents dup within a team.
-- =============================================================================
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  player_id uuid not null references profiles (id) on delete cascade,
  member_order smallint not null default 1,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (team_id, player_id)
);
create index if not exists idx_team_members_player on team_members (player_id);
create index if not exists idx_team_members_team on team_members (team_id);

-- =============================================================================
-- tournament_player_club_representations (§36.25A) — source of truth for multi-club representation.
-- =============================================================================
create table if not exists tournament_player_club_representations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  player_id uuid not null references profiles (id) on delete cascade,
  club_id uuid not null references clubs (id) on delete cascade,
  display_order smallint not null check (display_order >= 1),
  membership_verified_at_selection boolean not null default false,
  organizer_override boolean not null default false,
  override_reason text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, player_id, club_id),
  unique (tournament_id, player_id, display_order)
);
create index if not exists idx_tpcr_tournament_player on tournament_player_club_representations (tournament_id, player_id);
create index if not exists idx_tpcr_tournament_club on tournament_player_club_representations (tournament_id, club_id);

drop trigger if exists trg_tpcr_updated_at on tournament_player_club_representations;
create trigger trg_tpcr_updated_at before update on tournament_player_club_representations
  for each row execute function set_updated_at();

-- =============================================================================
-- registrations (§36.26) — one per (team, division).
-- =============================================================================
create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  division_id uuid not null references divisions (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  status registration_status not null default 'team_formed',
  eligibility_status registration_eligibility not null default 'eligible',
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  slot_hold_expires_at timestamptz,
  review_grace_expires_at timestamptz,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  reviewed_by uuid references profiles (id),
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, division_id)
);
create index if not exists idx_registrations_division_status on registrations (division_id, status);
create index if not exists idx_registrations_tournament on registrations (tournament_id);

drop trigger if exists trg_registrations_updated_at on registrations;
create trigger trg_registrations_updated_at before update on registrations
  for each row execute function set_updated_at();

-- =============================================================================
-- registration_events (§36.27) — immutable state history.
-- =============================================================================
create table if not exists registration_events (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations (id) on delete cascade,
  actor_id uuid references profiles (id),
  event_type text not null,
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_registration_events_reg on registration_events (registration_id, created_at);

-- =============================================================================
-- waitlist_entries (§36.29)
-- =============================================================================
create table if not exists waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations (id) on delete cascade,
  division_id uuid not null references divisions (id) on delete cascade,
  position_rank numeric not null default 0,
  status waitlist_status not null default 'waiting',
  created_at timestamptz not null default now()
);
create index if not exists idx_waitlist_division on waitlist_entries (division_id, status, position_rank);

-- =============================================================================
-- Authorization helper.
-- =============================================================================
create or replace function public.is_team_member(check_user uuid, check_team uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members where team_id = check_team and player_id = check_user
  );
$$;

-- =============================================================================
-- TRANSACTIONAL RPCs (§23, §20.4). SECURITY DEFINER; called server-side via the service client after
-- app-level authz. Division row is locked to serialize concurrent registrations.
-- =============================================================================

-- Read the admin slot-hold minutes (§23.1) with a safe default.
create or replace function public.slot_hold_minutes()
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select (value::text)::int from system_settings where key = 'slot_hold_minutes'), 30);
$$;

-- register_team: atomic capacity check → slot hold (payment_pending) or waitlist (§23.2).
create or replace function public.register_team(p_team_id uuid, p_actor uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_team teams%rowtype;
  v_div divisions%rowtype;
  v_tourn_status tournament_status;
  v_active int;
  v_status registration_status;
  v_reg_id uuid;
  v_hold timestamptz;
begin
  select * into v_team from teams where id = p_team_id;
  if not found then raise exception 'team_not_found'; end if;
  if not exists (select 1 from team_members where team_id = p_team_id and player_id = p_actor) then
    raise exception 'not_team_member';
  end if;

  -- Serialize concurrent registrations for this division.
  select * into v_div from divisions where id = v_team.division_id for update;
  if not found then raise exception 'division_not_found'; end if;

  select status into v_tourn_status from tournaments where id = v_team.tournament_id;
  if v_tourn_status <> 'registration_open' then raise exception 'registration_closed'; end if;
  if v_div.status <> 'open' then raise exception 'division_closed'; end if;

  if exists (
    select 1 from registrations
    where team_id = p_team_id and division_id = v_team.division_id
      and status not in ('withdrawn','cancelled','rejected')
  ) then
    raise exception 'already_registered';
  end if;

  select count(*) into v_active from registrations r
    where r.division_id = v_team.division_id
      and (
        r.status in ('confirmed','payment_submitted','under_review')
        or (r.status = 'payment_pending' and r.slot_hold_expires_at > now())
      );

  if v_div.capacity_teams > 0 and v_active >= v_div.capacity_teams then
    v_status := 'waitlisted';
    insert into registrations (tournament_id, division_id, team_id, status)
      values (v_team.tournament_id, v_team.division_id, p_team_id, 'waitlisted')
      returning id into v_reg_id;
    insert into waitlist_entries (registration_id, division_id, position_rank, status)
      values (
        v_reg_id, v_team.division_id,
        coalesce((select max(position_rank) from waitlist_entries
                  where division_id = v_team.division_id and status = 'waiting'), 0) + 1,
        'waiting'
      );
  else
    v_status := 'payment_pending';
    v_hold := now() + make_interval(mins => public.slot_hold_minutes());
    insert into registrations (tournament_id, division_id, team_id, status, slot_hold_expires_at)
      values (v_team.tournament_id, v_team.division_id, p_team_id, 'payment_pending', v_hold)
      returning id into v_reg_id;
  end if;

  update teams set status = 'formed' where id = p_team_id and status = 'forming';
  insert into registration_events (registration_id, actor_id, event_type, to_status, metadata)
    values (v_reg_id, p_actor, 'registered', v_status::text,
            json_build_object('active', v_active, 'capacity', v_div.capacity_teams)::jsonb);

  return json_build_object('registration_id', v_reg_id, 'status', v_status);
end $$;

-- release_slot: withdraw/reject/cancel a registration and promote the next waitlisted team (§23.3).
create or replace function public.release_slot(p_registration_id uuid, p_actor uuid, p_new_status text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_reg registrations%rowtype;
  v_next_id uuid;
  v_held boolean;
begin
  if p_new_status not in ('withdrawn','rejected','cancelled') then
    raise exception 'invalid_release_status';
  end if;
  select * into v_reg from registrations where id = p_registration_id;
  if not found then raise exception 'registration_not_found'; end if;

  perform 1 from divisions where id = v_reg.division_id for update;

  v_held := v_reg.status in ('payment_pending','payment_submitted','under_review','confirmed');

  update registrations set status = p_new_status::registration_status, updated_at = now()
    where id = p_registration_id;
  update waitlist_entries set status = 'removed'
    where registration_id = p_registration_id and status = 'waiting';
  insert into registration_events (registration_id, actor_id, event_type, from_status, to_status)
    values (p_registration_id, p_actor, p_new_status, v_reg.status::text, p_new_status);

  if v_held then
    select r.id into v_next_id from registrations r
      join waitlist_entries w on w.registration_id = r.id
      where r.division_id = v_reg.division_id and r.status = 'waitlisted' and w.status = 'waiting'
      order by w.position_rank asc
      limit 1;
    if v_next_id is not null then
      update registrations
        set status = 'payment_pending',
            slot_hold_expires_at = now() + make_interval(mins => public.slot_hold_minutes()),
            updated_at = now()
        where id = v_next_id;
      update waitlist_entries set status = 'promoted' where registration_id = v_next_id;
      insert into registration_events (registration_id, actor_id, event_type, from_status, to_status)
        values (v_next_id, p_actor, 'promoted_from_waitlist', 'waitlisted', 'payment_pending');
    end if;
  end if;

  return json_build_object('released', p_registration_id, 'promoted', v_next_id);
end $$;

-- accept_partner_invitation: creates the team, merging a reciprocal cross-invite atomically (§20.4).
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

  -- Conflicting locked/active team for either player in this division (§20.3, §21.4).
  if exists (
    select 1 from team_members tm
    join teams t on t.id = tm.team_id
    where t.division_id = v_inv.division_id
      and t.status in ('forming','formed','locked')
      and tm.player_id in (v_inv.inviter_id, v_inv.invitee_id)
  ) then
    raise exception 'partner_conflict';
  end if;

  -- Reciprocal pending invite (invitee -> inviter) for the same tournament/division?
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

  return json_build_object('team_id', v_team_id, 'merged', (v_recip_id is not null));
end $$;

-- =============================================================================
-- Row Level Security (§37). Reads: parties / team members / tournament organizers / staff.
-- All writes go through the service role in authored actions + the RPCs above.
-- =============================================================================
alter table partner_invitations enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table tournament_player_club_representations enable row level security;
alter table registrations enable row level security;
alter table registration_events enable row level security;
alter table waitlist_entries enable row level security;

drop policy if exists partner_invitations_read on partner_invitations;
create policy partner_invitations_read on partner_invitations
  for select using (
    auth.uid() = inviter_id or auth.uid() = invitee_id
    or public.is_tournament_organizer(auth.uid(), tournament_id) or public.is_staff(auth.uid())
  );

drop policy if exists teams_read on teams;
create policy teams_read on teams
  for select using (
    public.is_team_member(auth.uid(), id)
    or public.is_tournament_organizer(auth.uid(), tournament_id) or public.is_staff(auth.uid())
  );

drop policy if exists team_members_read on team_members;
create policy team_members_read on team_members
  for select using (
    auth.uid() = player_id
    or public.is_team_member(auth.uid(), team_id)
    or public.is_staff(auth.uid())
    or exists (
      select 1 from teams t
      where t.id = team_id and public.is_tournament_organizer(auth.uid(), t.tournament_id)
    )
  );

drop policy if exists tpcr_read on tournament_player_club_representations;
create policy tpcr_read on tournament_player_club_representations
  for select using (
    auth.uid() = player_id
    or public.is_tournament_organizer(auth.uid(), tournament_id) or public.is_staff(auth.uid())
  );

drop policy if exists registrations_read on registrations;
create policy registrations_read on registrations
  for select using (
    public.is_team_member(auth.uid(), team_id)
    or public.is_tournament_organizer(auth.uid(), tournament_id) or public.is_staff(auth.uid())
  );

drop policy if exists registration_events_read on registration_events;
create policy registration_events_read on registration_events
  for select using (
    exists (
      select 1 from registrations r
      where r.id = registration_id
        and (public.is_team_member(auth.uid(), r.team_id)
             or public.is_tournament_organizer(auth.uid(), r.tournament_id)
             or public.is_staff(auth.uid()))
    )
  );

drop policy if exists waitlist_read on waitlist_entries;
create policy waitlist_read on waitlist_entries
  for select using (
    exists (
      select 1 from registrations r
      where r.id = registration_id
        and (public.is_team_member(auth.uid(), r.team_id)
             or public.is_tournament_organizer(auth.uid(), r.tournament_id)
             or public.is_staff(auth.uid()))
    )
  );

-- ---------- Verify ----------
select 'reg_tables' as check, count(*) as n from information_schema.tables
  where table_schema = 'public'
    and table_name in ('partner_invitations','teams','team_members',
                       'tournament_player_club_representations','registrations',
                       'registration_events','waitlist_entries')
union all
select 'reg_rpcs', count(*) from information_schema.routines
  where routine_schema = 'public'
    and routine_name in ('register_team','release_slot','accept_partner_invitation','is_team_member','slot_hold_minutes')
union all
select 'reg_rls_policies', count(*) from pg_policies
  where tablename in ('partner_invitations','teams','team_members',
                      'tournament_player_club_representations','registrations',
                      'registration_events','waitlist_entries');
-- Expect: reg_tables = 7, reg_rpcs = 5, reg_rls_policies = 7
