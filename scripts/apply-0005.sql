-- =============================================================================
-- VouchPlay v2 — Migration 0005: Safety & Moderation (Phase 4)
-- Handover §14 (Skill Review vs Report vs Block), §11.3 (fraud-flag workflow), §30.6, §47
-- (moderation policy), §36.32 skill_reviews, §36.33 reports, §36.38 support_tickets, §37 (RLS).
--
-- Privacy / authz model (LOCKED):
--  - Reports are NEVER anonymous to Admin — reporter_id is always stored (§14.2). A reporter reads
--    only their own reports; staff read all; resolution/status writes happen via the service role in
--    audited server actions (no user UPDATE policy, mirroring vouch invalidation).
--  - Skill-review submitter identity is stored but NEVER publicly displayed (§14.1) — same RLS shape
--    (requester + staff only).
--  - Support tickets: owner + staff only.
--  - Moderation actions (dismiss/warn/invalidate/restrict/suspend/ban) each write an append-only
--    audit_logs row from the server action — audit_logs stays insert-only (migration 0001).
--  - Anonymous voucher identity is exposed ONLY through a staff-gated server path (see
--    lib/moderation/queries.getVouchAuthorForModeration); this migration adds no public exposure of it.
--
-- Apply via the Supabase SQL editor (same method as 0001–0004). Idempotent-ish (guards where practical).
-- =============================================================================

-- ---------- Enums ----------
do $$ begin
  create type report_target_type as enum ('player', 'comment', 'club', 'tournament');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_reason_code as enum
    ('harassment', 'impersonation', 'abusive_content', 'fake_account', 'spam', 'fraud',
     'inappropriate_behavior', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type skill_review_status as enum
    ('open', 'under_review', 'resolved_no_change', 'resolved_admin_note', 'resolved_vouch_action',
     'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type support_ticket_status as enum
    ('open', 'pending_user', 'pending_staff', 'resolved', 'closed');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- reports (§36.33, §14.2) — any public UGC is reportable. target_id references the reported entity
-- by type (player/comment/club/tournament). Comment + club/tournament FKs are not enforced here
-- (comments cascade with their vouch; clubs/tournaments arrive in later phases) — the app validates.
-- =============================================================================
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles (id) on delete cascade,
  target_type report_target_type not null,
  target_id uuid not null,
  reason_code report_reason_code not null,
  details text check (details is null or char_length(details) <= 2000),
  evidence jsonb not null default '{}'::jsonb,
  status report_status not null default 'open',
  assigned_to uuid references profiles (id),
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reports_status on reports (status, created_at desc);
create index if not exists idx_reports_target on reports (target_type, target_id);
create index if not exists idx_reports_reporter on reports (reporter_id);

drop trigger if exists trg_reports_updated_at on reports;
create trigger trg_reports_updated_at before update on reports
  for each row execute function set_updated_at();

-- =============================================================================
-- skill_reviews (§36.32, §14.1) — SEPARATE from reports. A player (or an organizer with tournament
-- context) flags that a target's displayed/community skill is materially inaccurate.
-- =============================================================================
create table if not exists skill_reviews (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles (id) on delete cascade,
  target_player_id uuid not null references profiles (id) on delete cascade,
  tournament_id uuid,                        -- nullable tournament context (FK arrives in Phase 6+)
  division_id uuid,                          -- nullable
  reason text not null check (char_length(reason) between 1 and 2000),
  evidence jsonb not null default '{}'::jsonb,
  status skill_review_status not null default 'open',
  reviewed_by uuid references profiles (id),
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> target_player_id)
);
create index if not exists idx_skill_reviews_status on skill_reviews (status, created_at desc);
create index if not exists idx_skill_reviews_target on skill_reviews (target_player_id);
create index if not exists idx_skill_reviews_requester on skill_reviews (requester_id);

drop trigger if exists trg_skill_reviews_updated_at on skill_reviews;
create trigger trg_skill_reviews_updated_at before update on skill_reviews
  for each row execute function set_updated_at();

-- =============================================================================
-- support_tickets (§36.38, §47 appeal/support path) — user-submitted appeals & support.
-- =============================================================================
create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete set null,
  category text not null,
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 4000),
  status support_ticket_status not null default 'open',
  assigned_to uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_support_tickets_status on support_tickets (status, created_at desc);
create index if not exists idx_support_tickets_user on support_tickets (user_id);

drop trigger if exists trg_support_tickets_updated_at on support_tickets;
create trigger trg_support_tickets_updated_at before update on support_tickets
  for each row execute function set_updated_at();

-- =============================================================================
-- Moderation-action columns on profiles (§47). account_status enum (0001) already carries
-- active/restricted/suspended/banned/deactivated; these add the reason/actor/expiry metadata and a
-- targeted vouching restriction that is independent of full account restriction.
-- =============================================================================
alter table profiles add column if not exists status_reason text;
alter table profiles add column if not exists status_updated_at timestamptz;
alter table profiles add column if not exists status_updated_by uuid references profiles (id);
alter table profiles add column if not exists suspended_until timestamptz;      -- temp suspension (§47)
alter table profiles add column if not exists vouching_restricted_until timestamptz; -- restrict vouching (§11.3/§47)

-- =============================================================================
-- New admin-configurable settings (§30.7) — abuse rate limits for the new user-facing submissions.
-- Values live in system_settings; domain logic reads them at runtime (never hardcoded).
-- =============================================================================
insert into system_settings (key, value, description) values
  ('reports_per_24h', '10'::jsonb, 'Max reports a user can file per rolling 24h'),
  ('skill_reviews_per_24h', '5'::jsonb, 'Max skill reviews a user can file per rolling 24h')
on conflict (key) do nothing;

-- =============================================================================
-- Row Level Security (§37). Submitter/reporter reads own; staff read all; user inserts own; all
-- status/resolution writes happen via the service role (no user UPDATE policy).
-- =============================================================================
alter table reports enable row level security;
alter table skill_reviews enable row level security;
alter table support_tickets enable row level security;

-- reports: reporter reads own; staff read all. Reporter creates own. No user update/delete.
drop policy if exists reports_read_own_or_staff on reports;
create policy reports_read_own_or_staff on reports
  for select using (auth.uid() = reporter_id or public.is_staff(auth.uid()));

drop policy if exists reports_insert_own on reports;
create policy reports_insert_own on reports
  for insert with check (auth.uid() = reporter_id);

-- skill_reviews: requester reads own; staff read all. Requester creates own. No user update/delete.
drop policy if exists skill_reviews_read_own_or_staff on skill_reviews;
create policy skill_reviews_read_own_or_staff on skill_reviews
  for select using (auth.uid() = requester_id or public.is_staff(auth.uid()));

drop policy if exists skill_reviews_insert_own on skill_reviews;
create policy skill_reviews_insert_own on skill_reviews
  for insert with check (auth.uid() = requester_id);

-- support_tickets: owner reads own; staff read all. Owner creates own. No user update/delete.
drop policy if exists support_tickets_read_own_or_staff on support_tickets;
create policy support_tickets_read_own_or_staff on support_tickets
  for select using (auth.uid() = user_id or public.is_staff(auth.uid()));

drop policy if exists support_tickets_insert_own on support_tickets;
create policy support_tickets_insert_own on support_tickets
  for insert with check (auth.uid() = user_id);

-- ---------- Verify ----------
select 'safety_tables' as check, count(*) as n from information_schema.tables
  where table_schema = 'public' and table_name in ('reports','skill_reviews','support_tickets')
union all
select 'profiles_mod_columns', count(*) from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name in ('status_reason','status_updated_at','status_updated_by',
                        'suspended_until','vouching_restricted_until')
union all
select 'safety_rls_policies', count(*) from pg_policies
  where tablename in ('reports','skill_reviews','support_tickets')
union all
select 'new_settings', count(*) from system_settings
  where key in ('reports_per_24h','skill_reviews_per_24h');
-- Expect: safety_tables = 3, profiles_mod_columns = 5, safety_rls_policies = 6, new_settings = 2
