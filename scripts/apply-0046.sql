-- =============================================================================
-- VouchPlay v2 - apply 0046: register before an account (guest entry)
-- Paste-and-run copy of supabase/migrations/0046_guest_entry.sql, with a verification SELECT appended.
-- Statements are byte-identical to the migration.
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

-- ---------- Verification ----------
select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and (table_name, column_name) in (('profiles','guest_created_at'), ('registrations','partner_note'))
 order by table_name;

select key, value from system_settings where key = 'guest_registration_enabled';
