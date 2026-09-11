-- =============================================================================
-- VouchPlay v2 - apply 0038: Payment receipt notification email (master_plan §2AK)
--
-- Paste-and-run copy of supabase/migrations/0038_payment_notification_email.sql for the Supabase SQL
-- editor, with a verification SELECT appended.
--
-- Lets an organizer designate one address that receives a "Registration payment notification" email
-- every time a team uploads a payment receipt for one of their tournaments - the person who checks
-- the bank account (e.g. Hermosa's kathrina.malinao@gmail.com), not a player. Null/blank means the
-- feature is off for that tournament; existing tournaments default to off.
--
-- No RLS change needed: the column is edited only through the existing organizer-only tournament
-- update action (service role), the same authorized write path `payment_qr_path` and
-- `payment_methods` already use. The app reads this column defensively (fail-open), so nothing breaks
-- if the app deploys before this is applied - the notifier simply no-ops until the column exists.
-- =============================================================================

alter table public.tournaments
  add column if not exists payment_notification_email text;

comment on column public.tournaments.payment_notification_email is
  'Organizer-designated address that receives one "Registration payment notification" email per '
  'uploaded payment receipt for this tournament (master_plan §2AK). Null/blank = notifications off.';

-- ---------------------------------------------------------------------------
-- Verify: the column exists. Expect payment_notification_email_column=1.
-- ---------------------------------------------------------------------------
select 'payment_notification_email_column' as check, count(*)::int as value
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'tournaments'
   and column_name = 'payment_notification_email';
