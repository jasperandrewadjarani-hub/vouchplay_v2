-- =============================================================================
-- VouchPlay v2 - Migration 0051: Badges (master_plan §2BK)
-- Phase 1 + Phase 2 Players tab upgrade, built together. Badges renumbered into 0051 (organizer
-- Phase B moves to 0052, PIN lock to 0053 - neither was written yet).
--
-- WHAT THIS ADDS: `player_badges` (one row per held/expired badge; source 'auto' | 'grant'),
-- `profiles.pinned_badge_key`, `tournaments.commemorative_badge_label`, and
-- `player_badge_progress` (a tiny tracker so "Level Up" can detect a community-skill tier rise -
-- no such history exists today). Additive only - no existing table/column/policy is changed.
--
-- NO SECURITY DEFINER FUNCTIONS are added by this migration (repo non-negotiable: every definer
-- function needs a grant-lock migration; badges do not need one - every write goes through the
-- service role from an already-authorized server action, and the only reads RLS needs to allow are
-- plain row-ownership/staff checks reusing the existing `public.is_staff()` helper).
--
-- FAIL-OPEN BY DESIGN: every badge reader in the app catches on a missing table/column and returns
-- empty/null (master_plan §2BK C), so this migration and the code deploy can land in either order.
-- SAFE TO APPLY DURING THE OPEN REGISTRATION WINDOW: new tables/columns only, no locks on existing
-- hot tables beyond a fast `alter table ... add column if not exists`.
-- Apply via the Supabase SQL editor (same method as 0001-0050).
-- =============================================================================

-- =============================================================================
-- player_badges - one row per badge a player currently holds or has held (§2BK C).
-- A badge key is either a catalog key (packages/config/src/badges.ts BADGES) or an
-- `event:<tournamentId>` commemorative key. `source = 'auto'` rows are maintained by
-- computeAutoBadges(); `source = 'grant'` rows are admin-tagged and the nightly job never touches
-- them. Only one LIVE (revoked_at is null) row may exist per (player_id, badge_key) - the partial
-- unique index below enforces it - but the full history (revoked rows) is kept for the admin view.
-- =============================================================================
create table if not exists player_badges (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references profiles (id) on delete cascade,
  badge_key text not null check (badge_key ~ '^[a-z0-9_:-]{2,80}$'),
  source text not null check (source in ('auto', 'grant')),
  tally int not null default 1 check (tally >= 1),
  meta jsonb not null default '{}'::jsonb,
  awarded_at timestamptz not null default now(),
  expires_at timestamptz,
  granted_by uuid references profiles (id) on delete set null,
  grant_reason text,
  revoked_at timestamptz,
  revoked_by uuid references profiles (id) on delete set null,
  revoke_reason text,
  -- Set by an admin "Keep it off" untag (§2BK B): stops the nightly job re-awarding this key to this
  -- player until an admin explicitly lifts it (adminAllowAutoAgain). Only meaningful on a revoked row.
  auto_blocked boolean not null default false,
  hidden boolean not null default false,
  celebrated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one LIVE row per (player, badge key). Multiple revoked/historical rows for the same key
-- are expected (e.g. an expired Champion window, later re-earned).
create unique index if not exists uq_player_badges_live
  on player_badges (player_id, badge_key)
  where revoked_at is null;
-- Public/holder-count reads filter to "this key, still live" - never a full-table scan.
create index if not exists idx_player_badges_key_live
  on player_badges (badge_key)
  where revoked_at is null;
create index if not exists idx_player_badges_player
  on player_badges (player_id);

drop trigger if exists trg_player_badges_updated_at on player_badges;
create trigger trg_player_badges_updated_at before update on player_badges
  for each row execute function set_updated_at();

comment on table player_badges is
  'Badge case (master_plan §2BK). source=auto rows are machine-maintained by computeAutoBadges(); '
  'source=grant rows are admin-tagged and are never touched by the nightly job. auto_blocked (only '
  'meaningful on a revoked row) stops the job re-awarding that key until an admin lifts it.';

-- =============================================================================
-- profiles.pinned_badge_key - the one badge a player has chosen to feature (§2BK E). Nullable, no FK
-- (a badge key is catalog vocabulary, not a row id - see packages/config/src/badges.ts `badgeDef`).
-- =============================================================================
alter table public.profiles
  add column if not exists pinned_badge_key text;

-- =============================================================================
-- tournaments.commemorative_badge_label - set by an admin to mark a tournament's confirmed entrants
-- eligible for an `event:<tournamentId>` badge (§2BK B, D). Null = not commemorative; clearing it
-- retires those badges on the next compute run (§2BK "Loose ends").
-- =============================================================================
alter table public.tournaments
  add column if not exists commemorative_badge_label text;

-- =============================================================================
-- player_badge_progress - tiny tracker for the Level Up badge (§2BK A, D). No community-skill
-- history exists elsewhere, so this is the smallest state that lets computeAutoBadges() detect a
-- tier RISE (community_level_seen < the player's current level) without recomputing history.
-- =============================================================================
create table if not exists player_badge_progress (
  player_id uuid primary key references profiles (id) on delete cascade,
  community_level_seen smallint,
  community_level_seen_at timestamptz,
  level_up_at timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_player_badge_progress_updated_at on player_badge_progress;
create trigger trg_player_badge_progress_updated_at before update on player_badge_progress
  for each row execute function set_updated_at();

comment on table player_badge_progress is
  'Level Up tracker only (master_plan §2BK D). No client-facing rows; service-role only.';

-- =============================================================================
-- RLS (§37, repo non-negotiable: server-side authz + RLS on everything).
-- =============================================================================
alter table player_badges enable row level security;
alter table player_badge_progress enable row level security;

-- player_badges: public may see a LIVE, non-hidden, non-expired row (the badge case is a public
-- profile feature, §2BK E). The owner additionally sees their own hidden/expired/blocked rows
-- (needed for "Past" and the owner's Hide toggle); staff see every row (admin tooling).
drop policy if exists player_badges_public_read on player_badges;
create policy player_badges_public_read on player_badges
  for select using (
    (revoked_at is null and hidden = false and (expires_at is null or expires_at > now()))
    or player_id = auth.uid()
    or public.is_staff(auth.uid())
  );

-- No insert/update/delete policies: every write goes through the service role from an already
-- authorized server action (lib/actions/badges.ts, lib/badges/compute.ts) - never a client mutation.

-- player_badge_progress: RLS on, no policies at all (matches the push_subscriptions pattern in
-- 0049) - this table has no client-facing reason to exist; only the service role touches it.

-- ---------- Verification ----------
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
   and tablename in ('player_badges', 'player_badge_progress')
 order by tablename;

select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'player_badges'
 order by ordinal_position;

select policyname from pg_policies
 where schemaname = 'public'
   and tablename in ('player_badges', 'player_badge_progress')
 order by tablename, policyname;

select column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'profiles'
   and column_name = 'pinned_badge_key'
union all
select column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'tournaments'
   and column_name = 'commemorative_badge_label';
