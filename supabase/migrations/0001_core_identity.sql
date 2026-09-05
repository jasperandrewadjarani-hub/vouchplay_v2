-- =============================================================================
-- VouchPlay v2 — Migration 0001: Core Identity, Roles, Settings, Audit
-- Handover §36.1–36.4, §36.39–36.40, §4 (roles), §13 (identity), §37 (RLS).
-- Phase 1 foundation. Idempotent-ish (guards where practical); intended to run once via
-- `supabase db push`. All timestamps UTC. UUID PKs. RLS enabled on user-facing tables.
-- =============================================================================

-- ---------- Extensions ----------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;     -- trigram search (players/clubs/tournaments)

-- ---------- Enums ----------
do $$ begin
  create type sex as enum ('male', 'female');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_status as enum ('active', 'restricted', 'suspended', 'banned', 'deactivated');
exception when duplicate_object then null; end $$;

-- Global roles (handover §4.1). PLAYER is implicit for every account and is NOT stored here.
do $$ begin
  create type global_role as enum ('coach', 'organizer', 'moderator', 'support', 'admin', 'super_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type role_status as enum ('active', 'revoked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_role as enum ('coach', 'organizer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_status as enum ('pending', 'reviewing', 'approved', 'rejected', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type identity_verification_status as enum
    ('pending', 'reviewing', 'approved', 'rejected', 'resubmit_required');
exception when duplicate_object then null; end $$;

-- ---------- Shared trigger helpers ----------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- profiles (handover §36.1) — one row per auth user. `id` == auth.users.id.
-- Note: self_rated_skill is a skill-band ordinal 0..6 (canonical order is LOCKED, §3.1).
-- Community Skill and STS are NOT stored here — they live in player_skill_profiles (Phase 3),
-- kept separate so identity/skill/trust never conflate (§3.3, §72).
-- =============================================================================
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  nickname text,
  slug text unique,
  city text,
  sex sex,
  date_of_birth date,
  avatar_path text,
  bio text,
  self_rated_skill smallint check (self_rated_skill between 0 and 6),
  facebook_url text,
  looking_for_partner boolean not null default false,
  open_for_sponsorship boolean not null default false,
  profile_visibility jsonb not null default '{}'::jsonb,
  account_status account_status not null default 'active',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_profiles_last_name on profiles (lower(last_name));
create index if not exists idx_profiles_first_name on profiles (lower(first_name));
create index if not exists idx_profiles_nickname on profiles (lower(nickname));
create index if not exists idx_profiles_city on profiles (lower(city));
create index if not exists idx_profiles_self_rated_skill on profiles (self_rated_skill);
create index if not exists idx_profiles_account_status on profiles (account_status);
-- Trigram indexes for typo-tolerant search (handover §39).
create index if not exists idx_profiles_nickname_trgm on profiles using gin (nickname gin_trgm_ops);
create index if not exists idx_profiles_lastname_trgm on profiles using gin (last_name gin_trgm_ops);

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

-- =============================================================================
-- user_roles (handover §36.2) — additive global-role grants. No account "types".
-- =============================================================================
create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  role global_role not null,
  status role_status not null default 'active',
  approved_by uuid references profiles (id),
  approved_at timestamptz,
  revoked_by uuid references profiles (id),
  revoked_at timestamptz,
  reason text,
  created_at timestamptz not null default now()
);

-- One active grant per (user, role).
create unique index if not exists uq_user_roles_active
  on user_roles (user_id, role) where status = 'active';
create index if not exists idx_user_roles_user on user_roles (user_id);

-- =============================================================================
-- role_applications (handover §36.3) — apply to be Coach/Organizer; Admin decides.
-- =============================================================================
create table if not exists role_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  role_requested application_role not null,
  answers jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  status application_status not null default 'pending',
  reviewed_by uuid references profiles (id),
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one open application per (user, role).
create unique index if not exists uq_role_applications_open
  on role_applications (user_id, role_requested)
  where status in ('pending', 'reviewing');
create index if not exists idx_role_applications_status on role_applications (status);

drop trigger if exists trg_role_applications_updated_at on role_applications;
create trigger trg_role_applications_updated_at before update on role_applications
  for each row execute function set_updated_at();

-- =============================================================================
-- identity_verifications (handover §36.4, §13) — private. Document files live in a private
-- bucket; only the storage PATH is stored here. Public profile shows STATUS ONLY, never details.
-- document_delete_after enforces retention (default 30 days after decision, §13.3).
-- =============================================================================
create table if not exists identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  document_type text,
  document_storage_path text,               -- PRIVATE bucket path; never expose publicly
  status identity_verification_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles (id),
  review_reason text,
  document_delete_after timestamptz,
  document_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_identity_verifications_user on identity_verifications (user_id);
create index if not exists idx_identity_verifications_status on identity_verifications (status);

drop trigger if exists trg_identity_verifications_updated_at on identity_verifications;
create trigger trg_identity_verifications_updated_at before update on identity_verifications
  for each row execute function set_updated_at();

-- =============================================================================
-- system_settings (handover §36.39, §30.7) — Admin-configurable operational values.
-- Domain logic reads these at runtime; nothing hardcodes business numbers.
-- =============================================================================
create table if not exists system_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_system_settings_updated_at on system_settings;
create trigger trg_system_settings_updated_at before update on system_settings
  for each row execute function set_updated_at();

-- =============================================================================
-- audit_logs (handover §36.40, §30.8) — APPEND-ONLY. No update/delete for any role.
-- =============================================================================
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles (id),
  actor_role text,
  action text not null,
  entity_type text,
  entity_id uuid,
  before_snapshot jsonb,
  after_snapshot jsonb,
  reason text,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_actor on audit_logs (actor_id);
create index if not exists idx_audit_logs_entity on audit_logs (entity_type, entity_id);
create index if not exists idx_audit_logs_created_at on audit_logs (created_at desc);

-- =============================================================================
-- Authorization helpers (handover §4.3, §35.4). SECURITY DEFINER so RLS policies can call them
-- without recursive policy evaluation. `search_path` pinned for safety.
-- =============================================================================
create or replace function public.has_global_role(check_user uuid, check_role global_role)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles
    where user_id = check_user and role = check_role and status = 'active'
  );
$$;

create or replace function public.is_admin(check_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles
    where user_id = check_user and role in ('admin', 'super_admin') and status = 'active'
  );
$$;

create or replace function public.is_staff(check_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles
    where user_id = check_user
      and role in ('moderator', 'support', 'admin', 'super_admin')
      and status = 'active'
  );
$$;

-- =============================================================================
-- New-user bootstrap: create an empty profile row when an auth user is created, so profile
-- completion (onboarding) has a row to update. Runs as definer on the auth trigger.
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Row Level Security (handover §37). Server/service-role key bypasses RLS for admin ops.
-- =============================================================================
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table role_applications enable row level security;
alter table identity_verifications enable row level security;
alter table system_settings enable row level security;
alter table audit_logs enable row level security;

-- profiles: public may read non-deleted, non-banned rows. Column-level privacy (age/sex/etc.)
-- is enforced by server DTOs, not RLS. Users update only their own row.
drop policy if exists profiles_public_read on profiles;
create policy profiles_public_read on profiles
  for select using (deleted_at is null and account_status <> 'banned');

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles
  for insert with check (auth.uid() = id);

-- user_roles: a user can read their own roles; staff can read all. Writes are service-role only.
drop policy if exists user_roles_read_own_or_staff on user_roles;
create policy user_roles_read_own_or_staff on user_roles
  for select using (auth.uid() = user_id or public.is_staff(auth.uid()));

-- role_applications: applicant reads/creates own; staff read all. Reviews via service role.
drop policy if exists role_applications_read_own_or_staff on role_applications;
create policy role_applications_read_own_or_staff on role_applications
  for select using (auth.uid() = user_id or public.is_staff(auth.uid()));

drop policy if exists role_applications_insert_own on role_applications;
create policy role_applications_insert_own on role_applications
  for insert with check (auth.uid() = user_id);

-- identity_verifications: strictly private. Owner reads own status; staff read all. Never public.
drop policy if exists identity_verifications_read_own_or_staff on identity_verifications;
create policy identity_verifications_read_own_or_staff on identity_verifications
  for select using (auth.uid() = user_id or public.is_staff(auth.uid()));

drop policy if exists identity_verifications_insert_own on identity_verifications;
create policy identity_verifications_insert_own on identity_verifications
  for insert with check (auth.uid() = user_id);

-- system_settings: readable by anyone (weights/limits/flags are not secret); writes service-role only.
drop policy if exists system_settings_public_read on system_settings;
create policy system_settings_public_read on system_settings
  for select using (true);

-- audit_logs: readable only by staff; inserts/updates/deletes via service role only (append-only).
drop policy if exists audit_logs_staff_read on audit_logs;
create policy audit_logs_staff_read on audit_logs
  for select using (public.is_staff(auth.uid()));
