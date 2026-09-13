'use server';

import { assertAdminActor } from '@/lib/moderation/staff';
import { writeAudit } from '@/lib/moderation/audit';
import { runReminders } from '@/lib/tournaments/reminders';

/**
 * Admin "Run reminders now" (master_plan §2AS G) - the manual counterpart to the nightly
 * `/api/cron/reminders` route, same `runReminders()` and the same append-only audit pattern (one
 * `admin.reminders.run` row per invocation, even a failed one), gated to Admin/super-admin with a
 * stepped-up (AAL2) session - the same `assertAdminActor` guard every other Admin write action uses.
 */
export async function runRemindersNow(): Promise<{
  ok: boolean;
  counts?: Record<string, number>;
  error?: string;
}> {
  const actor = await assertAdminActor();
  if (!actor)
    return { ok: false, error: 'Admin access with a stepped-up (two-factor) session is required.' };

  const ranAt = new Date().toISOString();
  try {
    const counts = await runReminders();
    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: 'admin.reminders.run',
      entityType: 'reminder_runs',
      entityId: null,
      after: { outcome: 'sent', ranAt, counts },
      reason: 'Manual admin reminder run',
    });
    return { ok: true, counts };
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : String(caught);
    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: 'admin.reminders.run',
      entityType: 'reminder_runs',
      entityId: null,
      after: { outcome: 'failed', ranAt },
      reason: detail.slice(0, 480),
    });
    return { ok: false, error: 'The reminder run failed. Please try again.' };
  }
}
