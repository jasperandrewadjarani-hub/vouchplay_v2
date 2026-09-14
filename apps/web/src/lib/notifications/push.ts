import 'server-only';
import { serverEnv } from '@/lib/env';
import { loadSettingFlag } from '@/lib/settings';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Web Push channel (master_plan §2AY D) - the second adapter beside email, READY BUT INERT until the
 * VAPID keys exist in the server env (exactly like `email.ts` without SMTP). It mirrors the rows
 * `notify()` / `notifyMany()` already decided to insert, so the per-category mutes and the
 * self-notification rule apply for free and there is no second preference to keep in sync; the device
 * subscription itself is the opt-in.
 *
 * Nothing here ever throws into a caller: a push failure must not break the domain action that
 * created the notification. A 404/410 from the push service means the endpoint is gone for good, so
 * that row is marked `disabled_at` instead of being retried forever.
 */
export interface PushRow {
  recipient_id: string;
  title: string;
  body: string | null;
  link: string | null;
  type: string;
}

export interface PushSendSummary {
  attempted: number;
  delivered: number;
  disabled: number;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** How many recipient ids go into one `in (...)` lookup. */
const ID_CHUNK = 100;
/** Hard ceiling on devices touched by a single fan-out (an organizer blast is bounded, not unbounded). */
const MAX_SUBSCRIPTIONS_PER_CALL = 1000;
/** Parallel sends in flight. Small enough to be polite to the push services, large enough to be quick. */
const CONCURRENCY = 10;
/** One day: a tournament or vouch update is worthless to wake a phone with a week later. */
const TTL_SECONDS = 86400;

function vapidPublicKey(): string {
  // Literal `process.env.NEXT_PUBLIC_*` access (see `lib/env.ts`): Next only inlines the literal form.
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
}

/**
 * True when push could actually send: both VAPID keys are present AND the Admin kill switch is on.
 * Used by the UI to show honest copy and by every send path as its first gate.
 */
export async function pushChannelReady(): Promise<boolean> {
  try {
    if (vapidPublicKey().length === 0 || serverEnv.vapidPrivateKey.length === 0) return false;
    return await loadSettingFlag('push_notifications_enabled', true);
  } catch {
    return false;
  }
}

/** Active devices for these recipients, chunked and globally bounded. Empty on any error. */
async function loadSubscriptions(recipientIds: string[]): Promise<SubscriptionRow[]> {
  const svc = createServiceClient();
  const rows: SubscriptionRow[] = [];
  for (let i = 0; i < recipientIds.length; i += ID_CHUNK) {
    const remaining = MAX_SUBSCRIPTIONS_PER_CALL - rows.length;
    if (remaining <= 0) break;
    const chunk = recipientIds.slice(i, i + ID_CHUNK);
    const { data } = await svc
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', chunk)
      .is('disabled_at', null)
      .limit(remaining);
    for (const row of (data ?? []) as SubscriptionRow[]) rows.push(row);
  }
  return rows.slice(0, MAX_SUBSCRIPTIONS_PER_CALL);
}

/** A dead endpoint (404 gone / 410 expired) is retired rather than retried on every later fan-out. */
async function disableSubscription(id: string): Promise<void> {
  try {
    const svc = createServiceClient();
    await svc
      .from('push_subscriptions')
      .update({ disabled_at: new Date().toISOString() })
      .eq('id', id);
  } catch {
    // best-effort
  }
}

function statusCodeOf(error: unknown): number | null {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const code = (error as { statusCode?: unknown }).statusCode;
    if (typeof code === 'number') return code;
  }
  return null;
}

/**
 * Send one push per (row x active device). Never throws - on any failure the summary simply reports
 * what did happen. `last_seen_at` is deliberately NOT written here: it records the device telling us
 * it is alive (subscribe / `pushsubscriptionchange`), not us talking at it.
 */
export async function sendPushForRows(rows: PushRow[]): Promise<PushSendSummary> {
  const empty: PushSendSummary = { attempted: 0, delivered: 0, disabled: 0 };
  try {
    if (rows.length === 0) return empty;
    if (!(await pushChannelReady())) return empty;

    const recipientIds = Array.from(new Set(rows.map((r) => r.recipient_id).filter(Boolean)));
    if (recipientIds.length === 0) return empty;

    const subscriptions = await loadSubscriptions(recipientIds);
    if (subscriptions.length === 0) return empty;

    const byUser = new Map<string, SubscriptionRow[]>();
    for (const sub of subscriptions) {
      const list = byUser.get(sub.user_id);
      if (list) list.push(sub);
      else byUser.set(sub.user_id, [sub]);
    }

    // One job per (notification row x that recipient's devices).
    const jobs: { sub: SubscriptionRow; payload: string }[] = [];
    for (const row of rows) {
      for (const sub of byUser.get(row.recipient_id) ?? []) {
        jobs.push({
          sub,
          payload: JSON.stringify({
            title: row.title,
            body: row.body ?? undefined,
            url: row.link ?? undefined,
            type: row.type,
          }),
        });
      }
    }
    if (jobs.length === 0) return empty;

    // Dynamic import so web-push is only loaded when the channel is actually configured. `web-push`
    // publishes named CommonJS exports (no default), so this is a namespace import, not `.default`.
    const webpush = await import('web-push');
    webpush.setVapidDetails(serverEnv.vapidSubject, vapidPublicKey(), serverEnv.vapidPrivateKey);

    const summary: PushSendSummary = { attempted: jobs.length, delivered: 0, disabled: 0 };
    const disabledIds = new Set<string>();
    let cursor = 0;

    // Simple bounded pool: CONCURRENCY workers pulling from one shared cursor.
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        const job = jobs[index];
        if (!job) return; // index past the end - this worker is done
        try {
          await webpush.sendNotification(
            {
              endpoint: job.sub.endpoint,
              keys: { p256dh: job.sub.p256dh, auth: job.sub.auth },
            },
            job.payload,
            { TTL: TTL_SECONDS, urgency: 'normal' },
          );
          summary.delivered += 1;
        } catch (error) {
          const status = statusCodeOf(error);
          if ((status === 404 || status === 410) && !disabledIds.has(job.sub.id)) {
            disabledIds.add(job.sub.id);
            summary.disabled += 1;
            await disableSubscription(job.sub.id);
          }
          // Every other failure is swallowed: transient push-service errors are not the caller's problem.
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => worker()));
    return summary;
  } catch {
    return empty;
  }
}

/** How many devices are currently subscribed (Admin Operations card, §2AY G). 0 on any error. */
export async function countActivePushSubscriptions(): Promise<number> {
  try {
    const svc = createServiceClient();
    const { count } = await svc
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .is('disabled_at', null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Fan out AFTER the response is sent (§2AY D): an organizer blast to 200 players must not slow the
 * organizer's click. `after()` is a Next 15.5 export; outside a request scope (a script, a test) it
 * throws, and we simply await the send instead. Never throws.
 */
export async function schedulePush(rows: PushRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const { after } = await import('next/server');
    // Return the promise (do not fire-and-forget): that is what keeps the serverless invocation
    // alive until the fan-out finishes.
    after(() => sendPushForRows(rows));
  } catch {
    try {
      await sendPushForRows(rows);
    } catch {
      // best-effort
    }
  }
}
