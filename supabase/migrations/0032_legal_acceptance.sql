-- 0032_legal_acceptance.sql
-- Records each player's acceptance of the app-wide Terms of Service and Privacy Policy
-- (master_plan §2R). Two nullable columns on profiles are the acceptance record: which version was
-- accepted and when. A null version means "has not accepted the current version" - existing players
-- (null) are gated on next visit until they accept; new players are stamped at onboarding.
--
-- Additive and safe on a live table: no backfill, no rewrite, no RLS change. The existing
-- self-update policy on profiles is row-level and already lets a player update their own row, which
-- covers these new columns (Supabase grants UPDATE at the table level). Reads of these columns are
-- fail-open in app code, so applying this before or after the code deploy cannot lock anyone out.

alter table public.profiles
  add column if not exists terms_accepted_version text,
  add column if not exists terms_accepted_at timestamptz;

comment on column public.profiles.terms_accepted_version is
  'Version string of the Terms/Privacy the player last accepted (see @vouchplay/config LEGAL.version). Null = not yet accepted the current version.';
comment on column public.profiles.terms_accepted_at is
  'Timestamp of the player''s most recent Terms/Privacy acceptance.';
