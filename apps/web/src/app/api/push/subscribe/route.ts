import { NextResponse } from 'next/server';
import { getOptionalUser } from '@/lib/auth';
import { upsertPushSubscription } from '@/lib/notifications/push-subscriptions';
import { pushSubscriptionInputSchema } from '@/lib/pwa/subscription-schema';

/**
 * Re-save a device's push subscription (master_plan §2AY D). This is the endpoint the service
 * worker's `pushsubscriptionchange` handler calls: the browser rotates an endpoint on its own
 * schedule, at a moment when no React tree is mounted, so a Server Action is not available and a
 * plain cookie-authenticated POST is.
 *
 * Same auth model as `savePushSubscription`: the session cookie identifies the caller, the shared
 * helper does the identical validation, upsert and per-user device cap. POST only - the route has no
 * readable representation.
 */
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = pushSubscriptionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid subscription.' }, { status: 400 });
  }

  const result = await upsertPushSubscription(user.id, parsed.data);
  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
