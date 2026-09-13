import { NextResponse } from 'next/server';
import { runReminders } from '@/lib/tournaments/reminders';
import { writeAudit } from '@/lib/moderation/audit';

export const maxDuration = 60;

const CRON_AUDIT_ACTION = 'cron.reminders';

/**
 * Nightly reminders cron (master_plan §2AQ A1, Decision A1). Same bearer `CRON_SECRET` auth and
 * audit pattern as `/api/cron/leaderboards` - one append-only `audit_logs` row per invocation (even a
 * failed one) so "did last night's reminders run?" is answerable from the app rather than the Vercel
 * dashboard.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json({ ok: false, code: 'CRON_NOT_CONFIGURED' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false }, { status: 401 });

  const ranAt = new Date().toISOString();
  try {
    const counts = await runReminders();
    await writeAudit({
      actorId: null,
      actorRole: 'system',
      action: CRON_AUDIT_ACTION,
      entityType: 'reminder_runs',
      entityId: null,
      after: { outcome: 'sent', ranAt, counts },
      reason: 'Scheduled reminder run',
    });
    return NextResponse.json({ ok: true, ranAt, counts });
  } catch {
    await writeAudit({
      actorId: null,
      actorRole: 'system',
      action: CRON_AUDIT_ACTION,
      entityType: 'reminder_runs',
      entityId: null,
      after: { outcome: 'failed', ranAt },
      reason: 'Scheduled reminder run',
    });
    return NextResponse.json({ ok: false, code: 'REMINDERS_FAILED' }, { status: 500 });
  }
}
