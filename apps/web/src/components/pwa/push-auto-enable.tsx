'use client';

import { useEffect, useRef } from 'react';
import { usePwa } from '@/components/pwa/pwa-provider';
import { usePushSubscription } from './use-push-subscription';

const AUTO_KEY = 'vp:push:auto-enabled';

/**
 * Turn notifications on by default the moment the app is installed (master_plan §2AZ addendum). Mounted
 * once in `AppShell`; renders nothing. When a signed-in viewer is running the installed standalone app,
 * push is supported + Admin-enabled, and permission has never been asked, it requests permission and
 * subscribes automatically - so the default for an installed user is "on", not "find the toggle".
 *
 * The browser's permission dialog is unavoidable and cannot be pre-answered: the best we can do is ask
 * immediately. On Android Chrome the request runs without a gesture; where a gesture is required (an
 * installed iOS PWA) we fall back to the viewer's next tap. It is attempted at most once per device
 * (`localStorage` AUTO_KEY, set only once a real allow/deny decision is recorded), and never re-asks
 * after a decision. Declining is respected - the ME-page toggle remains the way back on.
 */
export function PushAutoEnable({
  adminEnabled,
  authed,
}: {
  adminEnabled: boolean;
  authed: boolean;
}) {
  const pwa = usePwa();
  const { state, enable } = usePushSubscription({ adminEnabled });
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!authed) return;
    if (!pwa.ready || !pwa.standalone || !pwa.pushSupported) return;
    if (pwa.permission !== 'default') return; // never re-ask after a grant/deny
    if (state !== 'off') return;
    if (attemptedRef.current) return;
    try {
      if (localStorage.getItem(AUTO_KEY) === '1') return;
    } catch {
      // storage blocked - fall through and attempt once for this mount
    }
    attemptedRef.current = true;

    const markDone = () => {
      try {
        localStorage.setItem(AUTO_KEY, '1');
      } catch {
        // best-effort only
      }
    };
    const readPermission = (): NotificationPermission | 'unsupported' => {
      try {
        return Notification.permission;
      } catch {
        return 'unsupported';
      }
    };

    let removeGesture = () => {};
    void (async () => {
      const ok = await enable();
      // If the prompt resolved (granted -> ok, or denied), we are done. Only a still-'default'
      // permission means the request needed a user gesture (installed iOS PWA) - retry on next tap.
      if (ok || readPermission() !== 'default') {
        markDone();
        return;
      }
      const onGesture = () => {
        void enable().finally(markDone);
      };
      window.addEventListener('pointerdown', onGesture, { once: true });
      removeGesture = () => window.removeEventListener('pointerdown', onGesture);
    })();

    return () => removeGesture();
    // enable is stable enough for this one-shot attempt; the guard flags prevent re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, pwa.ready, pwa.standalone, pwa.pushSupported, pwa.permission, state]);

  return null;
}
