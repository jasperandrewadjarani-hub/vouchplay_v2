-- =============================================================================
-- VouchPlay v2 — Migration 0006: Clubs (Phase 5)
-- Handover §15 (Clubs), §36.16 clubs, §36.17 club_memberships, §37 (RLS), §4.3 (club roles).
--
-- Scope: Clubs CORE only. Recruitment/Sponsorship (§16 club_offers) and Bidding (§16A player_bids)
-- are a later phase and are NOT created here.
--
-- Model (LOCKED §15.1): verification_status and activity_status are separate. Any active player can
-- create a club (§15.2), which immediately creates an owner membership; verification goes to Admin.
-- Privacy (§15.6) is PUBLIC (anyone joins) or APPROVAL_REQUIRED (owner/admin approves) — it gates
-- JOINING, not visibility; fully-hidden clubs are out of V1. Writes happen via the service role in
-- audited server actions (mirrors vouches/moderation); RLS below governs reads.
-- Apply via the Supabase SQL editor (same method as 0001–0005).
-- =============================================================================

-- ---------- Enums ----------
do $$ begin
  create type club_privacy as enum ('public', 'approval_required');
exception when duplicate_object then null; end $$;

do $$ begin
  create type club_verification_status as enum ('pending', 'verified', 'unverified', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type club_activity_status as enum ('active', 'inactive', 'suspended', 'deleted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type club_role as enum ('owner', 'admin', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type club_membership_status as enum
    ('requested', 'invited', 'active', 'rejected', 'declined', 'left', 'removed', 'expired');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- clubs (§36.16)
-- =============================================================================
create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text unique not null,
  description text check (description is null or char_length(description) <= 2000),
  city text,
  logo_path text,
  contact text,
  social_links jsonb not null default '{}'::jsonb,
  privacy club_privacy not null default 'public',
  verification_status club_verification_status not null default 'pending',
  activity_status club_activity_status not null default 'active',
  created_by uuid not null references profiles (id) on delete cascade,
  verification_reviewed_by uuid references profiles (id),
  verification_reviewed_at timestamptz,
  verification_reason text,
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_clubs_city on clubs (lower(city));
create index if not exists idx_clubs_activity on clubs (activity_status);
create index if not exists idx_clubs_verification on clubs (verification_status);
create index if not exists idx_clubs_created_by on clubs (created_by);
create index if not exists idx_clubs_name_trgm on clubs using gin (name gin_trgm_ops);

drop trigger if exists trg_clubs_updated_at on clubs;
create trigger trg_clubs_updated_at before update on clubs
  for each row execute function set_updated_at();

-- =============================================================================
-- club_memberships (§36.17). One non-terminal membership per (club, user); one active owner per club.
-- =============================================================================
create table if not exists club_memberships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role club_role not null default 'member',
  status club_membership_status not null default 'requested',
  invited_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  ended_at timestamptz
);
-- At most one live (requested/invited/active) membership per (club, user).
create unique index if not exists uq_club_memberships_live
  on club_memberships (club_id, user_id)
  where status in ('requested', 'invited', 'active');
-- Exactly one active owner per club.
create unique index if not exists uq_club_memberships_owner
  on club_memberships (club_id)
  where role = 'owner' and status = 'active';
create index if not exists idx_club_memberships_club on club_memberships (club_id, status);
create index if not exists idx_club_memberships_user on club_memberships (user_id, status);

-- =============================================================================
-- Authorization helpers (SECURITY DEFINER so RLS can call them without recursion). §4.3.
-- =============================================================================
create or replace function public.is_club_member(check_user uuid, check_club uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from club_memberships
    where club_id = check_club and user_id = check_user and status = 'active'
  );
$$;

create or replace function public.is_club_manager(check_user uuid, check_club uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from club_memberships
    where club_id = check_club and user_id = check_user
      and role in ('owner', 'admin') and status = 'active'
  );
$$;

create or replace function public.is_club_owner(check_user uuid, check_club uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from club_memberships
    where club_id = check_club and user_id = check_user and role = 'owner' and status = 'active'
  );
$$;

-- =============================================================================
-- Row Level Security (§37). Reads governed here; all writes via the service role in server actions.
-- =============================================================================
alter table clubs enable row level security;
alter table club_memberships enable row level security;

-- clubs: publicly readable unless deleted/suspended; managers + staff always see their club.
drop policy if exists clubs_public_read on clubs;
create policy clubs_public_read on clubs
  for select using (
    activity_status not in ('deleted', 'suspended')
    or public.is_staff(auth.uid())
    or public.is_club_manager(auth.uid(), id)
  );

-- Any active player may create a club as themselves (§15.2). Update/delete via service role only.
drop policy if exists clubs_insert_own on clubs;
create policy clubs_insert_own on clubs
  for insert with check (auth.uid() = created_by);

-- club_memberships: active memberships are public (member stack/list, §15.5); a user reads their own
-- (any status); club managers + staff read all rows for the club. Writes via service role only.
drop policy if exists club_memberships_read on club_memberships;
create policy club_memberships_read on club_memberships
  for select using (
    status = 'active'
    or auth.uid() = user_id
    or public.is_club_manager(auth.uid(), club_id)
    or public.is_staff(auth.uid())
  );
