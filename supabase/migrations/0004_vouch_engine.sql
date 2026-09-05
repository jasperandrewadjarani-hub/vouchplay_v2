-- =============================================================================
-- VouchPlay v2 — Migration 0004: Vouch Engine (Phase 3)
-- Handover §10–§12, §36.5–36.10, §36.34–36.35, §37.
--
-- Privacy model (LOCKED): anonymous voucher identity is NEVER exposed publicly. The raw `vouches`
-- table is therefore NOT publicly readable — a voucher reads only their own rows; staff read all.
-- Public skill data is served from the safe aggregate `player_skill_profiles` (counts/CSL/STS/
-- distribution — no voucher identity) and from `vouch_comments` (always attributed). Recompute runs
-- server-side (service role) and writes player_skill_profiles; the STS_V1 algorithm lives in
-- @vouchplay/core (unit-tested), not in SQL.
-- Apply via the Supabase SQL editor (same method as 0001–0003).
-- =============================================================================

-- ---------- Enums ----------
do $$ begin create type vouch_interaction as enum ('with', 'against'); exception when duplicate_object then null; end $$;
do $$ begin create type vouch_visibility as enum ('anonymous', 'public'); exception when duplicate_object then null; end $$;
do $$ begin create type vouch_status as enum ('active', 'withdrawn', 'invalidated'); exception when duplicate_object then null; end $$;
do $$ begin create type vouch_change_type as enum ('created', 'updated', 'withdrawn', 'invalidated', 'reinstated'); exception when duplicate_object then null; end $$;
do $$ begin create type vouch_comment_status as enum ('active', 'hidden', 'removed'); exception when duplicate_object then null; end $$;
do $$ begin create type vouch_request_status as enum ('pending', 'fulfilled', 'dismissed', 'cancelled', 'expired'); exception when duplicate_object then null; end $$;
do $$ begin create type skill_verification_type as enum ('none', 'community', 'admin_override'); exception when duplicate_object then null; end $$;
do $$ begin create type fraud_subject_type as enum ('user', 'vouch', 'cluster', 'coach'); exception when duplicate_object then null; end $$;
do $$ begin create type fraud_status as enum ('open', 'reviewing', 'cleared', 'action_taken'); exception when duplicate_object then null; end $$;

-- =============================================================================
-- vouches (§36.5) — one ACTIVE vouch per (voucher, target). skill_level is a band ordinal 0..6.
-- effective_weight + weight_rule_version are copied on as an audit snapshot (§10.5).
-- =============================================================================
create table if not exists vouches (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references profiles (id) on delete cascade,
  target_id uuid not null references profiles (id) on delete cascade,
  skill_level smallint not null check (skill_level between 0 and 6),
  interaction_type vouch_interaction not null,
  visibility vouch_visibility not null default 'anonymous',
  used_coach_weight boolean not null default false,
  effective_weight numeric(4, 2) not null,
  weight_rule_version text not null,
  status vouch_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invalidated_by uuid references profiles (id),
  invalidation_reason text,
  check (voucher_id <> target_id)
);
create unique index if not exists uq_vouches_active_pair
  on vouches (voucher_id, target_id) where status = 'active';
create index if not exists idx_vouches_target_active on vouches (target_id) where status = 'active';
create index if not exists idx_vouches_voucher on vouches (voucher_id);

drop trigger if exists trg_vouches_updated_at on vouches;
create trigger trg_vouches_updated_at before update on vouches
  for each row execute function set_updated_at();

-- =============================================================================
-- vouch_revisions (§36.6) — immutable history. One row per create/update/withdraw/invalidate.
-- =============================================================================
create table if not exists vouch_revisions (
  id uuid primary key default gen_random_uuid(),
  vouch_id uuid not null references vouches (id) on delete cascade,
  previous_skill_level smallint,
  new_skill_level smallint,
  previous_visibility vouch_visibility,
  new_visibility vouch_visibility,
  previous_weight numeric(4, 2),
  new_weight numeric(4, 2),
  changed_by uuid references profiles (id),
  change_type vouch_change_type not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_vouch_revisions_vouch on vouch_revisions (vouch_id, created_at);

-- =============================================================================
-- vouch_comments (§36.7) — ALWAYS attributed to author (never anonymous, §10.1).
-- =============================================================================
create table if not exists vouch_comments (
  id uuid primary key default gen_random_uuid(),
  vouch_id uuid not null references vouches (id) on delete cascade,
  author_id uuid not null references profiles (id) on delete cascade,
  target_id uuid not null references profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  status vouch_comment_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_vouch_comments_target on vouch_comments (target_id, created_at desc);

drop trigger if exists trg_vouch_comments_updated_at on vouch_comments;
create trigger trg_vouch_comments_updated_at before update on vouch_comments
  for each row execute function set_updated_at();

-- =============================================================================
-- vouch_requests (§36.8, §12) — at most one PENDING request per (requester, recipient).
-- =============================================================================
create table if not exists vouch_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles (id) on delete cascade,
  recipient_id uuid not null references profiles (id) on delete cascade,
  message text check (message is null or char_length(message) <= 500),
  status vouch_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  check (requester_id <> recipient_id)
);
create unique index if not exists uq_vouch_requests_pending
  on vouch_requests (requester_id, recipient_id) where status = 'pending';
create index if not exists idx_vouch_requests_recipient on vouch_requests (recipient_id, status);

-- =============================================================================
-- player_skill_profiles (§36.9) — cached calc snapshot, recomputed on WRITE. PUBLIC-safe aggregate.
-- `distribution` (jsonb, band ordinal -> count) is stored here for cheap public reads (§10.6.6).
-- =============================================================================
create table if not exists player_skill_profiles (
  player_id uuid primary key references profiles (id) on delete cascade,
  community_skill_level smallint,
  weighted_mean numeric,
  sts numeric(2, 1) not null default 0.0,
  unique_voucher_count int not null default 0,
  effective_weight_sum numeric not null default 0,
  agreement_component numeric not null default 0,
  count_component numeric not null default 0,
  weight_component numeric not null default 0,
  distribution jsonb not null default '{}'::jsonb,
  skill_verified boolean not null default false,
  verification_type skill_verification_type not null default 'none',
  algorithm_version text not null,
  calculated_at timestamptz not null default now()
);

-- =============================================================================
-- blocks (§36.34) — blocked users cannot initiate interactions with each other (§10.2).
-- =============================================================================
create table if not exists blocks (
  blocker_id uuid not null references profiles (id) on delete cascade,
  blocked_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists idx_blocks_blocked on blocks (blocked_id);

-- =============================================================================
-- fraud_flags (§36.35) — internal risk flags; staff-only. Never auto-punish (§11.2).
-- =============================================================================
create table if not exists fraud_flags (
  id uuid primary key default gen_random_uuid(),
  subject_type fraud_subject_type not null,
  subject_id uuid not null,
  flag_type text not null,
  severity text,
  evidence jsonb not null default '{}'::jsonb,
  status fraud_status not null default 'open',
  reviewed_by uuid references profiles (id),
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_fraud_flags_subject on fraud_flags (subject_type, subject_id);
create index if not exists idx_fraud_flags_status on fraud_flags (status);

drop trigger if exists trg_fraud_flags_updated_at on fraud_flags;
create trigger trg_fraud_flags_updated_at before update on fraud_flags
  for each row execute function set_updated_at();

-- =============================================================================
-- Row Level Security (§37). Anonymous voucher identity NEVER exposed publicly.
-- =============================================================================
alter table vouches enable row level security;
alter table vouch_revisions enable row level security;
alter table vouch_comments enable row level security;
alter table vouch_requests enable row level security;
alter table player_skill_profiles enable row level security;
alter table blocks enable row level security;
alter table fraud_flags enable row level security;

-- vouches: voucher reads own; staff read all. NOT public, NOT the target (protects anonymity).
-- Voucher may create/update only their own vouch; invalidation is service-role/admin only.
drop policy if exists vouches_read_own_or_staff on vouches;
create policy vouches_read_own_or_staff on vouches
  for select using (auth.uid() = voucher_id or public.is_staff(auth.uid()));

drop policy if exists vouches_insert_own on vouches;
create policy vouches_insert_own on vouches
  for insert with check (auth.uid() = voucher_id);

drop policy if exists vouches_update_own on vouches;
create policy vouches_update_own on vouches
  for update using (auth.uid() = voucher_id) with check (auth.uid() = voucher_id);

-- vouch_revisions: readable by the vouch's voucher or staff (history of one's own vouch). Inserts
-- happen server-side (service role) alongside the vouch write.
drop policy if exists vouch_revisions_read_own_or_staff on vouch_revisions;
create policy vouch_revisions_read_own_or_staff on vouch_revisions
  for select using (
    public.is_staff(auth.uid())
    or exists (select 1 from vouches v where v.id = vouch_id and v.voucher_id = auth.uid())
  );

-- vouch_comments: public read of active comments (always attributed). Author writes own.
drop policy if exists vouch_comments_public_read on vouch_comments;
create policy vouch_comments_public_read on vouch_comments
  for select using (status = 'active' or auth.uid() = author_id or public.is_staff(auth.uid()));

drop policy if exists vouch_comments_insert_own on vouch_comments;
create policy vouch_comments_insert_own on vouch_comments
  for insert with check (auth.uid() = author_id);

-- vouch_requests: requester or recipient reads; requester creates; staff read all.
drop policy if exists vouch_requests_read_party_or_staff on vouch_requests;
create policy vouch_requests_read_party_or_staff on vouch_requests
  for select using (
    auth.uid() = requester_id or auth.uid() = recipient_id or public.is_staff(auth.uid())
  );

drop policy if exists vouch_requests_insert_own on vouch_requests;
create policy vouch_requests_insert_own on vouch_requests
  for insert with check (auth.uid() = requester_id);

drop policy if exists vouch_requests_update_party on vouch_requests;
create policy vouch_requests_update_party on vouch_requests
  for update using (auth.uid() = requester_id or auth.uid() = recipient_id);

-- player_skill_profiles: PUBLIC read (safe aggregate — no voucher identity). Writes service-role only.
drop policy if exists player_skill_profiles_public_read on player_skill_profiles;
create policy player_skill_profiles_public_read on player_skill_profiles
  for select using (true);

-- blocks: a user reads/creates/deletes only their own block rows.
drop policy if exists blocks_read_own on blocks;
create policy blocks_read_own on blocks for select using (auth.uid() = blocker_id);
drop policy if exists blocks_insert_own on blocks;
create policy blocks_insert_own on blocks for insert with check (auth.uid() = blocker_id);
drop policy if exists blocks_delete_own on blocks;
create policy blocks_delete_own on blocks for delete using (auth.uid() = blocker_id);

-- fraud_flags: staff only (read). Writes service-role only.
drop policy if exists fraud_flags_staff_read on fraud_flags;
create policy fraud_flags_staff_read on fraud_flags
  for select using (public.is_staff(auth.uid()));
