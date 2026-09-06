import 'server-only';
import type { EmailMessage } from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Email channel for critical notifications (handover §27.5) - READY BUT INERT. It sends only when the
 * app SMTP transport is configured (SMTP_USER + SMTP_PASS in the server env) AND the recipient has
 * opted into email. With no SMTP env (the current state) this is a no-op, so in-app notifications work
 * and the deploy has no external side effects. When Jasper adds the app-level Gmail App Password, email
 * for critical events switches on with no code change. Failure is always swallowed - a notification's
 * email must never break the action that created it.
 *
 * NOTE: this is a synchronous best-effort send for low-volume CRITICAL events only. A true async
 * outbox worker (handover §34A.13) is a later hardening; email volume here is intentionally tiny.
 */
function smtpConfig(): { user: string; pass: string; host: string; port: number } | null {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  return {
    user,
    pass,
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || '465'),
  };
}

/** True when the email channel could send (used to show accurate copy in the preferences UI). */
export function emailChannelEnabled(): boolean {
  return smtpConfig() !== null;
}

export async function sendCriticalEmail(args: {
  recipientId: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}): Promise<void> {
  const cfg = smtpConfig();
  if (!cfg) return; // inert until SMTP is configured

  try {
    const svc = createServiceClient();
    // Respect the recipient's email opt-in.
    const { data: pref } = await svc
      .from('notification_preferences')
      .select('email_enabled')
      .eq('user_id', args.recipientId)
      .maybeSingle();
    if (!(pref as { email_enabled: boolean } | null)?.email_enabled) return;

    const { data } = await svc.auth.admin.getUserById(args.recipientId);
    const to = data?.user?.email;
    if (!to) return;

    const message: EmailMessage = {
      to,
      subject: args.subject,
      html: `<p>${escapeHtml(args.text)}</p>`,
      text: args.text,
      idempotencyKey: args.idempotencyKey,
    };

    // Dynamic import so nodemailer is only loaded when the channel is actually enabled.
    const nodemailer = (await import('nodemailer')).default;
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    await transport.sendMail({
      from: cfg.user,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch {
    // best-effort: never throw into the caller's action
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
