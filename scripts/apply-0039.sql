-- =============================================================================
-- VouchPlay v2 - apply 0039: Payment receipt notification sent-at stamp (master_plan §2AL)
--
-- Paste-and-run copy of supabase/migrations/0039_payment_notification_sent_at.sql for the Supabase
-- SQL editor, with a verification SELECT appended.
--
-- Idempotency for the §2AL receipt-notification email: `notification_sent_at` stamps the instant the
-- "Registration payment notification" email was last sent for this payment's registration. Null means
-- never emailed, which is exactly the set the organizer backfill button (`sendAllPaymentReceipts`)
-- targets - so the historical Hermosa receipts (uploaded before this feature existed) are picked up
-- once, and a later tap of the same button never double-emails them. `submitPayment` clears this back
-- to null on every (re)submission, so a fresh or resubmitted receipt is eligible to notify again.
--
-- No RLS change needed: the column is written only through the service-role notifier
-- (`notifyPaymentReceiptUploaded`) and the existing organizer-only payment submission path, the same
-- authorized write paths `payments` already uses. The app reads this column defensively (fail-open),
-- so nothing breaks if the app deploys before this is applied - the backfill/pending-count simply
-- degrade to "nothing pending" until the column exists.
-- =============================================================================

alter table public.payments
  add column if not exists notification_sent_at timestamptz;

comment on column public.payments.notification_sent_at is
  'When the §2AL "Registration payment notification" email was last sent for this payment. Null = '
  'never emailed, so the receipt backfill (sendAllPaymentReceipts) picks it up; cleared to null on '
  'every (re)submission so a resubmitted receipt is eligible to notify again.';

-- ---------------------------------------------------------------------------
-- Verify: the column exists. Expect notification_sent_at_column=1.
-- ---------------------------------------------------------------------------
select 'notification_sent_at_column' as check, count(*)::int as value
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'payments'
   and column_name = 'notification_sent_at';
