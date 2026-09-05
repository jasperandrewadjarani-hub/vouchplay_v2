/**
 * Email transport abstraction (handover §24.5 pattern, §42, §34A.11, §34A.13).
 *
 * DEVIATION (2026-09-05, approved by Jasper): V1.1 locks transactional email to a dedicated
 * provider and forbids Gmail as primary transport. For the closed pilot we use Gmail SMTP via
 * `vouchplay@gmail.com`. This is deliberately behind the `EmailProvider` interface so switching to
 * Resend/Postmark/SendGrid later is a single-adapter change. Constraints to respect while on Gmail:
 *   - consumer Gmail ≈ 500 sends/day — adequate for the first ~100 pilot users, NOT for scale;
 *   - no delivery/bounce webhooks — keep volume low and prefer in-app notifications;
 *   - MUST switch to a dedicated provider before the public launch / any real send volume.
 *
 * Auth-flow emails (signup verification, password reset) are sent by Supabase Auth using the same
 * Gmail account configured as Supabase Custom SMTP — they do NOT flow through this interface.
 * This interface is for APP notification emails, which are queued via the outbox in Phase 11.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Idempotency key so retries never double-send (handover §34A.13). */
  idempotencyKey: string;
}

export interface EmailSendResult {
  providerMessageId: string | null;
  accepted: boolean;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** Identifier for the currently-selected transactional email transport (pilot = Gmail SMTP). */
export const CURRENT_EMAIL_TRANSPORT = 'gmail-smtp' as const;

/** Gmail SMTP connection shape (secrets injected at runtime; App Password, not account password). */
export interface GmailSmtpConfig {
  host: 'smtp.gmail.com';
  port: 465 | 587;
  user: string; // vouchplay@gmail.com
  appPassword: string; // 16-char Gmail App Password (requires 2FA on the account)
}

// Concrete GmailSmtpProvider (nodemailer) is implemented with the outbox worker in Phase 11.
