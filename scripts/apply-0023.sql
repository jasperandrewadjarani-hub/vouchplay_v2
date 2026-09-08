-- =============================================================================
-- VouchPlay v2 - Migration 0023: Club offers (Phase 14A Recruitment / Sponsorship)
-- Handover §16. Verified, active clubs publish controlled recruitment/sponsorship offers; players
-- opt in and respond. Offers NEVER influence CSL, STS, Skill Verified, vouch weight, tournament
-- eligibility, contribution, or any leaderboard. No bidding (§16A) is created here.
--
-- Model: writes happen via the service role in audited server actions (mirrors clubs/vouches);
-- RLS below governs reads. Only open, non-expired offers from a visible club are public.
-- Apply via the Supabase SQL editor (same method as 0001-0022).
-- =============================================================================

-- ---------- Enums ----------
do $$ begin
  create type club_offer_type as enum ('recruitment', 'sponsorship');
exception when duplicate_object then null; end $$;

do $$ begin
  create type club_offer_status as enum ('draft', 'open', 'closed', 'expired', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type club_offer_response_status as enum ('submitted', 'accepted', 'declined', 'withdrawn');
exception when duplicate_object then null; end $$;

-- Player opt-in reuses the existing profiles.open_for_sponsorship flag (migration 0001): a reversible,
-- default-off "open to club opportunities" switch. No new opt-in column is added here.

-- =============================================================================
-- club_offers (§16.1)
-- =============================================================================
create table if not exists club_offers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  type club_offer_type not null default 'recruitment',
  title text not null check (char_length(title) between 2 and 120),
  description text check (char_length(description) <= 2000),
  city text check (char_length(city) <= 120),
  min_skill smallint check (min_skill between 0 and 6),
  max_skill smallint check (max_skill between 0 and 6),
  status club_offer_status not null default 'draft',
  published_at timestamptz,
  expires_at timestamptz,
  closed_reason text check (char_length(closed_reason) <= 300),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_offers_skill_order check (
    min_skill is null or max_skill is null or min_skill <= max_skill
  )
);
create index if not exists idx_club_offers_club on club_offers (club_id);
create index if not exists idx_club_offers_open on club_offers (status, expires_at)
  where status = 'open';
drop trigger if exists set_updated_at on club_offers;
create trigger set_updated_at before update on club_offers
  for each row execute function public.set_updated_at();

-- =============================================================================
-- club_offer_responses (§16.2)
-- =============================================================================
create table if not exists club_offer_responses (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references club_offers (id) on delete cascade,
  player_id uuid not null references profiles (id) on delete cascade,
  status club_offer_response_status not null default 'submitted',
  message text check (char_length(message) <= 500),
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_offer_responses_offer on club_offer_responses (offer_id);
create index if not exists idx_offer_responses_player on club_offer_responses (player_id);
-- One live response per (offer, player): a player cannot double-respond while active.
create unique index if not exists uq_offer_response_live
  on club_offer_responses (offer_id, player_id)
  where status in ('submitted', 'accepted');
drop trigger if exists set_updated_at on club_offer_responses;
create trigger set_updated_at before update on club_offer_responses
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Row Level Security (§37). Reads governed here; all writes via the service role in server actions.
-- =============================================================================
alter table club_offers enable row level security;
alter table club_offer_responses enable row level security;

-- club_offers: an open, non-expired offer from a visible club is public; managers see their club's
-- offers in any status; staff see all.
drop policy if exists club_offers_read on club_offers;
create policy club_offers_read on club_offers
  for select using (
    (
      status = 'open'
      and (expires_at is null or expires_at > now())
      and exists (
        select 1 from clubs c
        where c.id = club_offers.club_id
          and c.verification_status = 'verified'
          and c.activity_status = 'active'
          and c.deleted_at is null
      )
    )
    or public.is_club_manager(auth.uid(), club_offers.club_id)
    or public.is_staff(auth.uid())
  );

-- club_offer_responses: the responding player, the offer's club managers, and staff.
drop policy if exists club_offer_responses_read on club_offer_responses;
create policy club_offer_responses_read on club_offer_responses
  for select using (
    auth.uid() = player_id
    or public.is_staff(auth.uid())
    or exists (
      select 1 from club_offers o
      where o.id = club_offer_responses.offer_id
        and public.is_club_manager(auth.uid(), o.club_id)
    )
  );

-- ---------- Admin settings (§16 rate limits / expiry). 0 = unlimited where applicable. ----------
insert into system_settings (key, value, description) values
  ('recruitment_enabled', 'true'::jsonb, 'Master switch for the club offers recruitment/sponsorship surface'),
  ('club_offers_per_24h', '10'::jsonb, 'Max offers a club may publish per rolling 24h (0 = unlimited)'),
  ('offer_responses_per_24h', '20'::jsonb, 'Max offer responses a player may submit per rolling 24h (0 = unlimited)'),
  ('offer_default_expiry_days', '30'::jsonb, 'Default days until a published offer expires')
on conflict (key) do nothing;

-- ---------- Verification ----------
select 'club_offer_tables' as check, count(*) as n
from information_schema.tables
where table_schema = 'public' and table_name in ('club_offers', 'club_offer_responses');

select 'club_offer_rls_policies' as check, count(*) as n
from pg_policies
where schemaname = 'public' and tablename in ('club_offers', 'club_offer_responses');

select 'recruitment_settings' as check, count(*) as n
from system_settings
where key in ('recruitment_enabled', 'club_offers_per_24h', 'offer_responses_per_24h', 'offer_default_expiry_days');
-- Expect club_offer_tables=2, club_offer_rls_policies=2, recruitment_settings=4.
