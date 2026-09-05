-- =============================================================================
-- VouchPlay v2 — Migration 0007: Tournament Setup (Phase 6)
-- Handover §17 (Tournament Core), §18 (Division Model), §19 (Discovery), §36.19–36.22, §36.30, §37.
--
-- Scope: Tournament SETUP only — organizer role gating, tournament CRUD + lifecycle, divisions,
-- co-organizers, interests, announcements, discovery. Registration/partner/teams/club-representation
-- (Phase 7), payments (Phase 8), eligibility (Phase 9) are NOT built here.
--
-- Locked (§17.1): only approved organizer/admin/super_admin may create tournaments (enforced in the
-- server action via user_roles + RLS insert check). Lifecycle (§17.2) is a server-enforced state
-- machine. Divisions are attribute-assembled (§18) — no hardcoded division names. Writes happen via
-- the service role in authored actions; RLS below governs reads.
-- Apply via the Supabase SQL editor (same method as 0001–0006).
-- =============================================================================

-- ---------- Enums ----------
do $$ begin
  create type tournament_status as enum
    ('draft','published','registration_open','registration_closed','locked','live','completed','archived','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tournament_visibility as enum ('public','unlisted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type division_skill_policy as enum ('band','open','custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type division_format as enum ('singles','doubles');
exception when duplicate_object then null; end $$;

do $$ begin
  create type division_sex_classification as enum ('men','women','mixed','genderless');
exception when duplicate_object then null; end $$;

do $$ begin
  create type division_status as enum ('draft','open','closed','locked','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tournament_organizer_status as enum ('invited','active','declined','removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type announcement_audience as enum ('all','confirmed','waitlisted','pending','division');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- tournaments (§36.19). owner_organizer_id is the canonical owner; co-organizers live in
-- tournament_organizers. All operational limits mirror system_settings defaults (§30.7).
-- =============================================================================
create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text unique not null,
  cover_path text,
  description text,
  venue_name text,
  address_text text,
  city text,
  timezone text not null default 'Asia/Manila',
  start_at timestamptz,
  end_at timestamptz,
  registration_open_at timestamptz,
  registration_close_at timestamptz,
  club_lock_at timestamptz,
  registration_lock_at timestamptz,
  status tournament_status not null default 'draft',
  visibility tournament_visibility not null default 'public',
  owner_organizer_id uuid not null references profiles (id) on delete cascade,
  terms_text text,
  contact text,
  payment_instructions text,
  social_links jsonb not null default '{}'::jsonb,
  max_divisions_per_player int not null default 3,
  max_clubs_per_player int not null default 3,
  club_representation_required boolean not null default false,
  verified_clubs_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tournaments_status on tournaments (status);
create index if not exists idx_tournaments_city on tournaments (lower(city));
create index if not exists idx_tournaments_start on tournaments (start_at);
create index if not exists idx_tournaments_owner on tournaments (owner_organizer_id);
create index if not exists idx_tournaments_name_trgm on tournaments using gin (name gin_trgm_ops);

drop trigger if exists trg_tournaments_updated_at on tournaments;
create trigger trg_tournaments_updated_at before update on tournaments
  for each row execute function set_updated_at();

-- =============================================================================
-- tournament_organizers (§36.20) — co-organizers with granular permissions (jsonb).
-- =============================================================================
create table if not exists tournament_organizers (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  source_club_id uuid references clubs (id) on delete set null,
  permissions jsonb not null default '{}'::jsonb,
  status tournament_organizer_status not null default 'active',
  created_at timestamptz not null default now()
);
create unique index if not exists uq_tournament_organizers_active
  on tournament_organizers (tournament_id, user_id) where status in ('invited','active');
create index if not exists idx_tournament_organizers_user on tournament_organizers (user_id, status);

-- =============================================================================
-- divisions (§36.21, §18) — attribute-assembled. team_size 1 (singles) / 2 (doubles) in V1.
-- =============================================================================
create table if not exists divisions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  name_override text,
  skill_policy division_skill_policy not null default 'open',
  minimum_skill smallint check (minimum_skill is null or minimum_skill between 0 and 6),
  maximum_skill smallint check (maximum_skill is null or maximum_skill between 0 and 6),
  format division_format not null default 'doubles',
  sex_classification division_sex_classification not null default 'mixed',
  minimum_age int check (minimum_age is null or minimum_age between 0 and 120),
  maximum_age int check (maximum_age is null or maximum_age between 0 and 120),
  team_size int not null default 2 check (team_size between 1 and 6),
  capacity_teams int not null default 0 check (capacity_teams >= 0),
  fee_amount numeric(10, 2) not null default 0,
  currency char(3) not null default 'PHP',
  skill_verified_required boolean not null default false,
  minimum_sts numeric(2, 1),
  organizer_approval_required boolean not null default false,
  max_entries_per_player int,
  registration_open_at timestamptz,
  registration_close_at timestamptz,
  status division_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_divisions_tournament on divisions (tournament_id);

drop trigger if exists trg_divisions_updated_at on divisions;
create trigger trg_divisions_updated_at before update on divisions
  for each row execute function set_updated_at();

-- =============================================================================
-- tournament_interests (§36.22) — a player marks interest in a tournament (or a specific division).
-- =============================================================================
create table if not exists tournament_interests (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  player_id uuid not null references profiles (id) on delete cascade,
  division_id uuid references divisions (id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Prevent duplicate interest at each level (NULLs are distinct in Postgres, so two partial indexes).
create unique index if not exists uq_tournament_interests_division
  on tournament_interests (tournament_id, player_id, division_id) where division_id is not null;
create unique index if not exists uq_tournament_interests_tournament
  on tournament_interests (tournament_id, player_id) where division_id is null;
create index if not exists idx_tournament_interests_tournament on tournament_interests (tournament_id);

-- =============================================================================
-- tournament_announcements (§36.30) — organizer posts shown on the tournament page.
-- =============================================================================
create table if not exists tournament_announcements (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  division_id uuid references divisions (id) on delete cascade,
  audience announcement_audience not null default 'all',
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 4000),
  created_by uuid references profiles (id),
  published_at timestamptz not null default now()
);
create index if not exists idx_tournament_announcements_tournament
  on tournament_announcements (tournament_id, published_at desc);

-- =============================================================================
-- Authorization helper (§17.1, §17.4). SECURITY DEFINER so RLS can call it without recursion.
-- =============================================================================
create or replace function public.is_tournament_organizer(check_user uuid, check_tournament uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tournaments t
    where t.id = check_tournament and t.owner_organizer_id = check_user
  ) or exists (
    select 1 from tournament_organizers o
    where o.tournament_id = check_tournament and o.user_id = check_user and o.status = 'active'
  );
$$;

-- =============================================================================
-- Row Level Security (§37). Public reads non-draft tournaments; organizers/staff see drafts.
-- Writes happen via the service role in authored actions.
-- =============================================================================
alter table tournaments enable row level security;
alter table tournament_organizers enable row level security;
alter table divisions enable row level security;
alter table tournament_interests enable row level security;
alter table tournament_announcements enable row level security;

-- tournaments: non-draft are readable (unlisted still reachable by direct link; discovery filters
-- visibility in-query). Draft only for organizers/staff. Owner may insert as themselves.
drop policy if exists tournaments_read on tournaments;
create policy tournaments_read on tournaments
  for select using (
    status <> 'draft'
    or public.is_tournament_organizer(auth.uid(), id)
    or public.is_staff(auth.uid())
  );
drop policy if exists tournaments_insert_own on tournaments;
create policy tournaments_insert_own on tournaments
  for insert with check (auth.uid() = owner_organizer_id);

-- divisions: readable when the parent tournament is readable.
drop policy if exists divisions_read on divisions;
create policy divisions_read on divisions
  for select using (
    exists (
      select 1 from tournaments t
      where t.id = tournament_id
        and (t.status <> 'draft' or public.is_tournament_organizer(auth.uid(), t.id) or public.is_staff(auth.uid()))
    )
  );

-- tournament_organizers: active rows are public (shown on the page); own + staff otherwise.
drop policy if exists tournament_organizers_read on tournament_organizers;
create policy tournament_organizers_read on tournament_organizers
  for select using (
    status = 'active' or auth.uid() = user_id or public.is_staff(auth.uid())
  );

-- tournament_interests: player reads own; the tournament's organizers + staff read all.
drop policy if exists tournament_interests_read on tournament_interests;
create policy tournament_interests_read on tournament_interests
  for select using (
    auth.uid() = player_id
    or public.is_tournament_organizer(auth.uid(), tournament_id)
    or public.is_staff(auth.uid())
  );
drop policy if exists tournament_interests_insert_own on tournament_interests;
create policy tournament_interests_insert_own on tournament_interests
  for insert with check (auth.uid() = player_id);
drop policy if exists tournament_interests_delete_own on tournament_interests;
create policy tournament_interests_delete_own on tournament_interests
  for delete using (auth.uid() = player_id);

-- tournament_announcements: readable when the parent tournament is readable.
drop policy if exists tournament_announcements_read on tournament_announcements;
create policy tournament_announcements_read on tournament_announcements
  for select using (
    exists (
      select 1 from tournaments t
      where t.id = tournament_id
        and (t.status <> 'draft' or public.is_tournament_organizer(auth.uid(), t.id) or public.is_staff(auth.uid()))
    )
  );
