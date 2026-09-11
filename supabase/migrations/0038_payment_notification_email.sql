-- =============================================================================
-- VouchPlay v2 - Migration 0038: Payment receipt notification email (master_plan §2AK)
--
-- Lets an organizer designate one address that receives a "Registration payment notification"
-- email every time a team uploads a payment receipt for one of their tournaments - the person who
-- checks the bank account (e.g. Hermosa's kathrina.malinao@gmail.com), not a player. Null/blank
-- means the feature is off for that tournament; existing tournaments default to off.
--
-- No RLS change needed: the column is edited only through the existing organizer-only tournament
-- update action (service role), the same authorized write path `payment_qr_path` and
-- `payment_methods` already use.
-- Apply via the Supabase SQL editor (same method as 0001-0034, 0036).
-- =============================================================================

alter table public.tournaments
  add column if not exists payment_notification_email text;

comment on column public.tournaments.payment_notification_email is
  'Organizer-designated address that receives one "Registration payment notification" email per '
  'uploaded payment receipt for this tournament (master_plan §2AK). Null/blank = notifications off.';
