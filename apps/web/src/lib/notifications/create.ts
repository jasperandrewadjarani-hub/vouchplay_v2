import 'server-only';
import { notificationDef, type NotificationParams } from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';
import { sendCriticalEmail } from './email';

/**
 * Notification creation (handover §27). In-app is the primary channel: one row per recipient via the
 * service client. Non-critical types the recipient has muted are skipped; critical types always
 * deliver and are routed to the (inert-until-configured) email channel. Never throws - a notification
 * failure must not break the domain action that triggered it. Self-notifications are skipped.
 */
export interface NotifyInput {
  recipientId: string;
  type: string;
  params?: NotificationParams;
  link?: string;
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  /** Optional copy overrides (else built from the @vouchplay/core catalog). */
  title?: string;
  body?: string;
}

interface Prepared {
  recipient_id: string;
  type: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_critical: boolean;
}

function prepare(
  input: NotifyInput,
): { row: Prepared; critical: boolean; category: string } | null {
  const def = notificationDef(input.type);
  if (!def) return null;
  const title = input.title ?? def.title(input.params ?? {});
  const body = input.body ?? def.body(input.params ?? {}) ?? null;
  return {
    row: {
      recipient_id: input.recipientId,
      type: input.type,
      category: def.category,
      title,
      body,
      link: input.link ?? null,
      actor_id: input.actorId ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      is_critical: def.critical,
    },
    critical: def.critical,
    category: def.category,
  };
}

async function mutedSet(
  svc: ReturnType<typeof createServiceClient>,
  userIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (userIds.length === 0) return map;
  const { data } = await svc
    .from('notification_preferences')
    .select('user_id, muted_categories')
    .in('user_id', userIds);
  for (const p of (data ?? []) as { user_id: string; muted_categories: string[] }[]) {
    map.set(p.user_id, p.muted_categories ?? []);
  }
  return map;
}

/** Create one notification. */
export async function notify(input: NotifyInput): Promise<void> {
  if (input.actorId && input.actorId === input.recipientId) return;
  try {
    const prepared = prepare(input);
    if (!prepared) return;
    const svc = createServiceClient();

    if (!prepared.critical) {
      const muted = await mutedSet(svc, [input.recipientId]);
      if ((muted.get(input.recipientId) ?? []).includes(prepared.category)) return;
    }

    await svc.from('notifications').insert(prepared.row);

    if (prepared.critical) {
      await sendCriticalEmail({
        recipientId: input.recipientId,
        subject: prepared.row.title,
        text: prepared.row.body
          ? `${prepared.row.title}\n\n${prepared.row.body}`
          : prepared.row.title,
        idempotencyKey: `${input.type}:${input.recipientId}:${input.entityId ?? ''}:${Date.now()}`,
      });
    }
  } catch {
    // best-effort
  }
}

/** Create the same notification for many recipients (fan-out), honoring per-recipient mutes. */
export async function notifyMany(
  recipientIds: string[],
  input: Omit<NotifyInput, 'recipientId'>,
): Promise<void> {
  const unique = Array.from(new Set(recipientIds.filter((id) => id && id !== input.actorId)));
  if (unique.length === 0) return;
  try {
    const svc = createServiceClient();
    const def = notificationDef(input.type);
    if (!def) return;
    const muted = def.critical ? new Map<string, string[]>() : await mutedSet(svc, unique);

    const rows: Prepared[] = [];
    for (const recipientId of unique) {
      if (!def.critical && (muted.get(recipientId) ?? []).includes(def.category)) continue;
      const prepared = prepare({ ...input, recipientId });
      if (prepared) rows.push(prepared.row);
    }
    if (rows.length > 0) await svc.from('notifications').insert(rows);
  } catch {
    // best-effort
  }
}
