-- =============================================================================
-- VouchPlay v2 - Migration 0039: Payment receipt notification sent-at stamp (master_plan §2AL)
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
-- authorized write paths `payments` already uses.
-- Apply via the Supabase SQL editor (same method as 0001-0034, 0036, 0038).
-- =============================================================================

alter table public.payments
  add column if not exists notification_sent_at timestamptz;

comment on column public.payments.notification_sent_at is
  'When the §2AL "Registration payment notification" email was last sent for this payment. Null = '
  'never emailed, so the receipt backfill (sendAllPaymentReceipts) picks it up; cleared to null on '
  'every (re)submission so a resubmitted receipt is eligible to notify again.';
