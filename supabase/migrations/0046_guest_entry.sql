-- =============================================================================
-- VouchPlay v2 - Migration 0046: register before an account ("guest entry")
-- master_plan §2AU. Handover §19.2 (frictionless join), §36.1 (profiles), §36.26 (registrations).
--
-- The account is created silently from the visitor's email at the first wizard step (an unverified
-- auth user; `handle_new_user` makes the profile row as for any signup), so every team, registration,
-- receipt and reserved slot a guest produces already belongs to a real profile. This migration only
-- adds the two facts that flow needs and the Admin kill switch:
--
-- 1. `profiles.guest_created_at` - set when a profile was created BY the guest wizard. Together with
--    `onboarded_at is null` it defines a guest: hidden from the directory, cannot vouch, reminded to
--    verify and finish onboarding. Cleared by nothing - onboarding completion sets `onboarded_at`, which
--    is what every gate reads; the stamp stays as history.
-- 2. `registrations.partner_note` - a guest's partner named as free text ("Maria Santos") to invite
--    after verification. Shown to the player and the organizer as "Partner: … (to be invited)".
-- 3. `guest_registration_enabled` - kill switch, seeded on.
--
-- SAFE TO APPLY DURING THE OPEN REGISTRATION WINDOW: two nullable columns, one setting.
-- Apply via the Supabase SQL editor (same method as 0001-0034, 0036, 0038-0045).
-- =============================================================================

alter table public.profiles
  add column if not exists guest_created_at timestamptz;
comment on column public.profiles.guest_created_at is
  'Set when the profile was created by the guest registration wizard (master_plan §2AU). A guest is '
  'this stamp plus onboarded_at null: hidden from the directory, cannot vouch, reminded to verify.';

alter table public.registrations
  add column if not exists partner_note text;
comment on column public.registrations.partner_note is
  'A guest''s partner named as free text at entry time, to be invited after they verify their email '
  '(master_plan §2AU D). Informational; never seats anyone.';

insert into system_settings (key, value, description) values
  ('guest_registration_enabled', 'true'::jsonb, 'Register before an account: the anonymous Register button opens the wizard and creates the account from the email at step one. Off sends visitors to signup first (§2AU G)')
on conflict (key) do nothing;
