-- =============================================================================
-- VouchPlay v2 - Migration 0032: legal acceptance record (Terms + Privacy)
-- master_plan §2R. Adds two columns to profiles so each player's acceptance of the app-wide Terms
-- of Service and Privacy Policy is recorded: the version accepted and when.
--
-- Why now: the app is live with 350+ real players and stores personal + sensitive data (payment
-- proofs, DOB, city, sex, vouches about people). A published Privacy Policy is expected under the
-- Philippine Data Privacy Act (RA 10173); Terms limit liability and set the rules of use.
--
-- Existing players have a null version and are gated on next visit until they accept; new players
-- are stamped at onboarding. Additive, no backfill, no RLS change - the existing profiles self-update
-- policy covers these columns. App reads are fail-open, so ordering vs the code deploy cannot lock
-- anyone out.
--
-- Apply via the Supabase SQL editor (same method as 0001-0031).
-- =============================================================================

alter table public.profiles
  add column if not exists terms_accepted_version text,
  add column if not exists terms_accepted_at timestamptz;

comment on column public.profiles.terms_accepted_version is
  'Version string of the Terms/Privacy the player last accepted (see @vouchplay/config LEGAL.version). Null = not yet accepted the current version.';
comment on column public.profiles.terms_accepted_at is
  'Timestamp of the player''s most recent Terms/Privacy acceptance.';

-- ---------------------------------------------------------------------------
-- Verify: both columns exist, and how many players still need to accept.
-- Expect version_col=1, at_col=1, and pending_players = your current player count (all null today).
-- ---------------------------------------------------------------------------
select 'version_col' as check, count(*)::int as value
  from information_schema.columns
 where table_schema='public' and table_name='profiles' and column_name='terms_accepted_version'
union all
select 'at_col', count(*)::int
  from information_schema.columns
 where table_schema='public' and table_name='profiles' and column_name='terms_accepted_at'
union all
select 'pending_players', count(*)::int
  from public.profiles
 where terms_accepted_version is null;
