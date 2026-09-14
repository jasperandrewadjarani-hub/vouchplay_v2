'use server';

import { getOptionalUser } from '@/lib/auth';
import { serverEnv } from '@/lib/env';
import {
  deletePushSubscription,
  upsertPushSubscription,
} from '@/lib/notifications/push-subscriptions';
import { pushChannelReady, sendPushForRows } from '@/lib/notifications/push';
import type { PushSubscriptionInput } from '@/lib/pwa/subscription-schema';
import { loadSettingFlag } from '@/lib/settings';

/**
 * Web Push device actions (master_plan §2AY D/E). The device subscription IS the opt-in, so these
 * four are the whole user-facing surface: save this device, forget this device, prove it works, and
 * report whether the channel is even available (so the UI can say "not switched on yet" instead of
 * showing a dead switch). Every write is authored here after `getOptionalUser()` verifies the caller;
 * the service client never sees an unverified request.
 *
 * NOTE: a 'use server' module may only export async functions - the shared upsert/cap logic lives in
 * `lib/notifications/push-subscriptions.ts` (also used by the `pushsubscriptionchange` route).
 */
export async function savePushSubscription(
  input: PushSubscriptionInput,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  return upsertPushSubscription(user.id, input);
}

export async function removePushSubscription(
  endpoint: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  return deletePushSubscription(user.id, endpoint);
}

/**
 * Send the caller a push on their own devices - the confirmation the non-technical user needs to
 * learn what "on" means (§2AY E), and the Admin end-to-end check (§2AY G) without a second account.
 */
export async function sendTestPush(): Promise<{ ok?: boolean; error?: string; sent?: number }> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (!(await pushChannelReady())) return { error: 'Push is not switched on yet.' };

  const summary = await sendPushForRows([
    {
      recipient_id: user.id,
      title: 'Notifications are on',
      body: "You'll get vouches, partner matches and tournament updates here.",
      link: '/me/notifications',
      type: 'push.test',
    },
  ]);
  if (summary.attempted === 0) return { error: 'No device is turned on yet.' };
  return { ok: true, sent: summary.delivered };
}

/**
 * Whether push is configured (both VAPID keys in the server env) and enabled (the Admin kill switch),
 * reported separately so the UI can tell "we haven't set this up yet" apart from "an admin turned it
 * off". Sending requires both - that is exactly `pushChannelReady()`.
 */
export async function getPushChannelStatus(): Promise<{ configured: boolean; enabled: boolean }> {
  const configured =
    (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').length > 0 &&
    serverEnv.vapidPrivateKey.length > 0;
  return { configured, enabled: await loadSettingFlag('push_notifications_enabled', true) };
}
