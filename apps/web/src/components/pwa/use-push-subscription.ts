'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePwa } from '@/components/pwa/pwa-provider';
import { urlBase64ToUint8Array } from '@/lib/pwa/detect';
import { VAPID_PUBLIC_KEY } from '@/lib/pwa/public-key';
import { savePushSubscription, removePushSubscription, sendTestPush } from '@/lib/actions/push';
import { derivePushRowState, type PushRowState } from './push-state';

const SYNCED_KEY = 'vp:push:synced';

function toSubscriptionInput(sub: PushSubscription) {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  };
}

/**
 * Drives the "Notifications on this device" row (master_plan §2AY Decision E). Reads the browser's
 * live subscription + permission via `usePwa()`, derives the display state with the pure
 * `derivePushRowState`, and exposes enable/disable actions that talk to the server through
 * `lib/actions/push.ts`.
 */
export function usePushSubscription({ adminEnabled }: { adminEnabled: boolean }) {
  const pwa = usePwa();
  const [subscribed, setSubscribed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const configured = VAPID_PUBLIC_KEY.length > 0;

  // Discover the current subscription once the service worker registration is available, and
  // self-heal a stale row (e.g. the server lost it, or this is a device that subscribed before a
  // deploy) by re-saving it once per browser session - never more than once, so a real server error
  // does not turn into a retry loop.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!pwa.ready || !pwa.registration || !pwa.pushSupported) {
        if (!cancelled) setChecked(true);
        return;
      }
      try {
        const sub = await pwa.registration.pushManager.getSubscription();
        const isSubscribed = !!sub && pwa.permission === 'granted';
        if (cancelled) return;
        setSubscribed(isSubscribed);
        if (isSubscribed && sub) {
          let alreadySynced = true;
          try {
            alreadySynced = sessionStorage.getItem(SYNCED_KEY) === '1';
          } catch {
            alreadySynced = false;
          }
          if (!alreadySynced) {
            const input = toSubscriptionInput(sub);
            if (input) {
              // Mark synced BEFORE the request: two instances of this hook can mount in the same
              // tick (the ME card + its toggle row), and the flag is what stops the second one from
              // sending the same upsert. A failed save is deliberately not retried this session.
              try {
                sessionStorage.setItem(SYNCED_KEY, '1');
              } catch {
                // best-effort only
              }
              savePushSubscription(input).catch(() => {
                // Non-fatal: the row simply stays whatever it was; nothing visible to the user.
              });
            }
          }
        }
      } catch {
        if (!cancelled) setSubscribed(false);
      } finally {
        if (!cancelled) setChecked(true);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [pwa.ready, pwa.registration, pwa.pushSupported, pwa.permission]);

  const state: PushRowState = derivePushRowState({
    ready: pwa.ready && checked,
    pushSupported: pwa.pushSupported,
    configured,
    adminEnabled,
    ios: pwa.ios,
    standalone: pwa.standalone,
    permission: pwa.permission,
    subscribed,
  });

  const enable = useCallback(async (): Promise<boolean> => {
    setError(null);
    setBusy(true);
    try {
      // `Notification` is absent in some browsers (iOS Safari until installed, old WebViews). The
      // row is disabled there, but a click handler must never surface a rejection either way.
      let permission: NotificationPermission;
      try {
        permission = await Notification.requestPermission();
      } catch {
        setError('Could not turn on notifications.');
        return false;
      }
      pwa.refreshPermission();
      if (permission !== 'granted') return false;

      if (!pwa.registration) {
        setError('Could not turn on notifications.');
        return false;
      }
      let sub: PushSubscription | null = null;
      try {
        sub =
          (await pwa.registration.pushManager.getSubscription()) ??
          (await pwa.registration.pushManager.subscribe({
            userVisibleOnly: true,
            // `PushManager.subscribe` types `applicationServerKey` as `BufferSource` (fixed-length
            // `ArrayBuffer`-backed), while `urlBase64ToUint8Array` returns a plain `Uint8Array` whose
            // TS 5.7+ lib.dom typing is generic over `ArrayBufferLike` - functionally identical at
            // runtime, just not nominally assignable.
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
          }));
      } catch {
        setError('Could not turn on notifications.');
        return false;
      }

      const input = sub ? toSubscriptionInput(sub) : null;
      if (!input) {
        setError('Could not turn on notifications.');
        return false;
      }

      const res = await savePushSubscription(input);
      if (!res.ok) {
        setError('Could not turn on notifications.');
        try {
          await sub?.unsubscribe();
        } catch {
          // best-effort cleanup
        }
        return false;
      }

      setSubscribed(true);
      try {
        sessionStorage.setItem(SYNCED_KEY, '1');
      } catch {
        // best-effort only
      }
      // Fire-and-forget confirmation push (§2AY E) - the one moment a non-technical user learns
      // "on" actually means something.
      sendTestPush().catch(() => {
        // Non-fatal: the toggle already reflects "on" regardless of the confirmation push.
      });
      return true;
    } finally {
      setBusy(false);
    }
  }, [pwa]);

  const disable = useCallback(async (): Promise<boolean> => {
    setError(null);
    setBusy(true);
    try {
      const sub = await pwa.registration?.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      try {
        await sub?.unsubscribe();
      } catch {
        // Continue - we still want to clear the server-side row.
      }
      if (endpoint) {
        try {
          await removePushSubscription(endpoint);
        } catch {
          // Non-fatal: the browser is unsubscribed either way; the row may linger server-side.
        }
      }
      setSubscribed(false);
      return true;
    } finally {
      setBusy(false);
    }
  }, [pwa.registration]);

  return { state, pending: busy, error, enable, disable };
}
