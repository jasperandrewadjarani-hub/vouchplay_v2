-- =============================================================================
-- VouchPlay v2 - Migration 0047: partner matchmaking + contribution cap bump
-- master_plan §2AV (matchmaking), §2AW (private ratings - jsonb only, no DDL), §2AX (leaderboard cap).
-- Handover §20.1 (partner finder), §7.4 (ratings privacy), v1.74.
--
-- 1. `partner_searches`  - one row per (tournament, player): "I'm looking for a partner here", the
--    divisions wanted and a one-line note. One deck per tournament (§2AV A).
-- 2. `partner_swipes`    - (swiper, target, direction). NO client read policy at all: swipes are
--    personal data read only by the server; a left swipe is never revealed, a right swipe only
--    through a match (§2AV F).
-- 3. `partner_matches`   - a mutual right swipe, stored as an ordered pair so the unique index absorbs
--    the race. Readable by the two players.
-- 4. Settings, group `partners`: kill switch, the seven agreed weights, limits.
-- 5. `contribution_builder_max_fact_rows` 5,000 -> 100,000 when still at the 0017 seed (§2AX).
--
-- Private ratings (§2AW) live in `profiles.profile_visibility` (jsonb) - no schema change.
-- SAFE TO APPLY DURING THE OPEN REGISTRATION WINDOW: new tables and settings only.
-- Apply via the Supabase SQL editor (same method as 0001-0034, 0036, 0038-0046).
-- =============================================================================

-- ---------- 1. partner_searches ----------
create table if not exists partner_searches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  player_id uuid not null references profiles(id) on delete cascade,
  division_ids uuid[] not null default '{}',
  note text,
  status text not null default 'open',
  closed_reason text,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_searches_status_check check (status in ('open', 'closed')),
  constraint partner_searches_note_length check (note is null or char_length(note) <= 120),
  constraint partner_searches_unique unique (tournament_id, player_id)
);

create index if not exists idx_partner_searches_open
  on partner_searches (tournament_id, status, last_active_at desc);

alter table partner_searches enable row level security;

drop policy if exists partner_searches_read_own on partner_searches;
create policy partner_searches_read_own on partner_searches
  for select using (auth.uid() = player_id or public.is_staff(auth.uid()));
-- No insert/update/delete policies: every write goes through the service role in authored actions.

-- ---------- 2. partner_swipes ----------
create table if not exists partner_swipes (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  swiper_id uuid not null references profiles(id) on delete cascade,
  target_id uuid not null references profiles(id) on delete cascade,
  direction text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_swipes_direction_check check (direction in ('right', 'left')),
  constraint partner_swipes_not_self check (swiper_id <> target_id),
  constraint partner_swipes_unique unique (tournament_id, swiper_id, target_id)
);

create index if not exists idx_partner_swipes_target
  on partner_swipes (tournament_id, target_id, direction);
create index if not exists idx_partner_swipes_swiper_day
  on partner_swipes (swiper_id, created_at desc);

-- RLS on, and deliberately NO policy for anon / authenticated: only the service role reads swipes.
alter table partner_swipes enable row level security;

-- ---------- 3. partner_matches ----------
create table if not exists partner_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  player_a uuid not null references profiles(id) on delete cascade,
  player_b uuid not null references profiles(id) on delete cascade,
  division_ids uuid[] not null default '{}',
  status text not null default 'open',
  closed_reason text,
  door jsonb not null default '{}',
  matched_at timestamptz not null default now(),
  reminded_at timestamptz,
  lock_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_matches_status_check check (status in ('open', 'entered', 'closed')),
  constraint partner_matches_ordered check (player_a < player_b),
  constraint partner_matches_unique unique (tournament_id, player_a, player_b)
);

create index if not exists idx_partner_matches_player_a on partner_matches (player_a, status);
create index if not exists idx_partner_matches_player_b on partner_matches (player_b, status);

alter table partner_matches enable row level security;

drop policy if exists partner_matches_read_pair on partner_matches;
create policy partner_matches_read_pair on partner_matches
  for select using (
    auth.uid() = player_a
    or auth.uid() = player_b
    or public.is_staff(auth.uid())
  );

-- ---------- 4. Settings (group `partners`) ----------
insert into system_settings (key, value, description) values
  ('partner_matchmaking_enabled', 'true'::jsonb, 'Partner matchmaking: Find a partner entry points and the swipe deck (master_plan §2AV I)'),
  ('partner_weight_slot', '5'::jsonb, 'Deck score: candidate holds a PAID open seat in a common division (unpaid entry = half) (§2AV D)'),
  ('partner_weight_division_overlap', '3'::jsonb, 'Deck score: per common division; doubled when the division is Recommended for the viewer (§2AV D)'),
  ('partner_weight_skill_proximity', '3'::jsonb, 'Deck score: same band full, one band apart half, two or more 0 (§2AV D)'),
  ('partner_weight_reciprocity', '3'::jsonb, 'Deck score: the candidate already swiped right on the viewer - sorts only, never shown (§2AV D)'),
  ('partner_weight_city', '1'::jsonb, 'Deck score: same city full, same region half (§2AV D)'),
  ('partner_weight_trust', '1'::jsonb, 'Deck score: identity verified 0.4 + coach-vouched 0.3 + STS at/above review threshold 0.3 (§2AV D)'),
  ('partner_weight_freshness', '1'::jsonb, 'Deck score: search active in the last 24h full, decaying to 0 at 7 days (§2AV D)'),
  ('partner_swipe_daily_limit', '200'::jsonb, 'Swipes per player per Manila day (§2AV F)'),
  ('partner_left_swipe_hide_days', '14'::jsonb, 'A "Not now" hides the card for this many days (§2AV F)'),
  ('partner_match_reminder_hours', '48'::jsonb, 'Remind an open match (not yet entered) after this many hours (§2AV G)'),
  ('partner_swipe_purge_days', '30'::jsonb, 'Purge a closed search''s swipes after this many days (§2AV G)')
on conflict (key) do nothing;

-- ---------- 5. Contribution builder cap (§2AX) ----------
update system_settings
   set value = '100000'::jsonb
 where key = 'contribution_builder_max_fact_rows'
   and (value::text)::numeric <= 5000;

-- ---------- Verification ----------
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('partner_searches', 'partner_swipes', 'partner_matches')
 order by table_name;

select key, value from system_settings
 where key like 'partner_%' or key = 'contribution_builder_max_fact_rows'
 order by key;
