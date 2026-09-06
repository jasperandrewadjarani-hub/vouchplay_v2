-- =============================================================================
-- APPLY: Migration 0013 — Achievements, Skill Tags & History (Phase 12, §9.4/§9.5/§49/§50).
-- Paste this whole block into the Supabase SQL editor (project itrosesiywpbaxtmucbb) and run it.
-- Idempotent. Expect the final rows: ach_tables = 5, skill_tags_seeded = 10, ach_rls_policies = 5.
-- =============================================================================
-- ---------- Enums ----------
do $$ begin
  create type achievement_type as enum ('official','community_claim');
exception when duplicate_object then null; end $$;

do $$ begin
  create type achievement_issuer_type as enum ('system','organizer','admin','self');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- skill_tags (§36.11) - the catalog of community-endorsable traits.
-- =============================================================================
create table if not exists skill_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into skill_tags (name, slug) values
  ('Fast Hands', 'fast-hands'),
  ('Strong Defense', 'strong-defense'),
  ('Court IQ', 'court-iq'),
  ('Dinking', 'dinking'),
  ('Serve', 'serve'),
  ('Returns', 'returns'),
  ('Drives', 'drives'),
  ('Resets', 'resets'),
  ('Speed-ups', 'speed-ups'),
  ('Communication', 'communication')
on conflict (slug) do nothing;

-- =============================================================================
-- player_skill_tag_votes (§36.12) - one endorsement per (player, tag, voter). Attributed.
-- =============================================================================
create table if not exists player_skill_tag_votes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references profiles (id) on delete cascade,
  tag_id uuid not null references skill_tags (id) on delete cascade,
  voter_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (player_id, tag_id, voter_id),
  check (player_id <> voter_id)
);
create index if not exists idx_skill_tag_votes_player on player_skill_tag_votes (player_id, tag_id);

-- =============================================================================
-- achievements (§36.13)
-- =============================================================================
create table if not exists achievements (
  id uuid primary key default gen_random_uuid(),
  type achievement_type not null,
  title text not null,
  description text,
  issuer_type achievement_issuer_type not null,
  issuer_id uuid references profiles (id) on delete set null,
  tournament_id uuid references tournaments (id) on delete set null,
  division_id uuid references divisions (id) on delete set null,
  issued_at timestamptz not null default now(),
  verification_status text not null default 'verified',
  created_at timestamptz not null default now()
);
create index if not exists idx_achievements_tournament on achievements (tournament_id);

-- =============================================================================
-- player_achievements (§36.14) - links a player to an achievement (+ optional placement).
-- =============================================================================
create table if not exists player_achievements (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references profiles (id) on delete cascade,
  achievement_id uuid not null references achievements (id) on delete cascade,
  placement text,
  created_at timestamptz not null default now(),
  unique (player_id, achievement_id)
);
create index if not exists idx_player_achievements_player on player_achievements (player_id);

-- =============================================================================
-- achievement_endorsements (§36.15) - peer thumbs-up on community claims. Attributed.
-- =============================================================================
create table if not exists achievement_endorsements (
  id uuid primary key default gen_random_uuid(),
  achievement_id uuid not null references achievements (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (achievement_id, user_id)
);
create index if not exists idx_achievement_endorsements_ach on achievement_endorsements (achievement_id);

-- =============================================================================
-- RLS (§37). Public aggregate/attributed data is readable (these are positive, community-facing
-- endorsements, like attributed comments - NOT the anonymous vouch data). All writes go through the
-- service role in authored server actions after app-level authz.
-- =============================================================================
alter table skill_tags enable row level security;
alter table player_skill_tag_votes enable row level security;
alter table achievements enable row level security;
alter table player_achievements enable row level security;
alter table achievement_endorsements enable row level security;

drop policy if exists skill_tags_read on skill_tags;
create policy skill_tags_read on skill_tags for select using (active);

drop policy if exists skill_tag_votes_read on player_skill_tag_votes;
create policy skill_tag_votes_read on player_skill_tag_votes for select using (true);

drop policy if exists achievements_read on achievements;
create policy achievements_read on achievements for select using (true);

drop policy if exists player_achievements_read on player_achievements;
create policy player_achievements_read on player_achievements for select using (true);

drop policy if exists achievement_endorsements_read on achievement_endorsements;
create policy achievement_endorsements_read on achievement_endorsements for select using (true);

-- ---------- Verify ----------
select 'ach_tables' as check, count(*) as n from information_schema.tables
  where table_schema = 'public'
    and table_name in ('skill_tags','player_skill_tag_votes','achievements','player_achievements','achievement_endorsements')
union all
select 'skill_tags_seeded', count(*) from skill_tags
union all
select 'ach_rls_policies', count(*) from pg_policies
  where schemaname = 'public'
    and tablename in ('skill_tags','player_skill_tag_votes','achievements','player_achievements','achievement_endorsements');
-- Expect: ach_tables = 5, skill_tags_seeded = 10, ach_rls_policies = 5
