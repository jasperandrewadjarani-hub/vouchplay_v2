import 'server-only';
import { loadSettingNumber } from '@/lib/settings';
import { createServiceClient } from '@/lib/supabase/service';
import {
  pushSubscriptionInputSchema,
  type PushSubscriptionInput,
} from '@/lib/pwa/subscription-schema';

/**
 * Device-subscription writes for the Web Push channel (master_plan §2AY D). Shared by the server
 * action (`lib/actions/push.ts`, the UI path) and the `pushsubscriptionchange` route
 * (`app/api/push/subscribe`, the service-worker path) so the validation, the upsert and the
 * per-user device cap can never drift apart between the two entry points.
 *
 * `push_subscriptions` has RLS on with NO client policies, so every write here uses the service
 * client - and only ever AFTER the caller has been verified by the action/route (the
 * `notification_preferences` pattern). Subscribe/unsubscribe are deliberately NOT audited: they are
 * device facts, not moderation events (§2AY Deferred).
 */
export interface PushSubscriptionWriteResult {
  ok?: boolean;
  error?: string;
}

/**
 * Upsert this device onto its endpoint (the unique key), then drop the caller's oldest devices past
 * `push_max_devices_per_user`. Re-subscribing an endpoint that was retired by a 404/410 clears
 * `disabled_at`, so a browser that re-registers comes back to life.
 */
export async function upsertPushSubscription(
  userId: string,
  input: PushSubscriptionInput,
): Promise<PushSubscriptionWriteResult> {
  const parsed = pushSubscriptionInputSchema.safeParse(input);
  if (!parsed.success) return { error: 'Could not save this device.' };

  try {
    const svc = createServiceClient();
    const now = new Date().toISOString();
    const { error } = await svc.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: parsed.data.userAgent ?? null,
        last_seen_at: now,
        disabled_at: null,
      },
      { onConflict: 'endpoint' },
    );
    if (error) return { error: 'Could not save this device.' };

    await enforceDeviceCap(userId);
    return { ok: true };
  } catch {
    return { error: 'Could not save this device.' };
  }
}

/** Keep only the `push_max_devices_per_user` most recently seen active devices for this user. */
async function enforceDeviceCap(userId: string): Promise<void> {
  try {
    const cap = await loadSettingNumber('push_max_devices_per_user', 5);
    if (!Number.isFinite(cap) || cap <= 0) return;
    const svc = createServiceClient();
    const { data } = await svc
      .from('push_subscriptions')
      .select('id, last_seen_at')
      .eq('user_id', userId)
      .is('disabled_at', null)
      .order('last_seen_at', { ascending: false });
    const rows = (data ?? []) as { id: string; last_seen_at: string }[];
    const surplus = rows.slice(Math.floor(cap)).map((r) => r.id);
    if (surplus.length === 0) return;
    await svc.from('push_subscriptions').delete().in('id', surplus);
  } catch {
    // best-effort: a device over the cap is harmless compared to failing the subscribe
  }
}

/** Remove one of the caller's own devices (turning the switch off on that phone). */
export async function deletePushSubscription(
  userId: string,
  endpoint: string,
): Promise<PushSubscriptionWriteResult> {
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > 2048) {
    return { error: 'Could not remove this device.' };
  }
  try {
    const svc = createServiceClient();
    const { error } = await svc
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', userId);
    if (error) return { error: 'Could not remove this device.' };
    return { ok: true };
  } catch {
    return { error: 'Could not remove this device.' };
  }
}
