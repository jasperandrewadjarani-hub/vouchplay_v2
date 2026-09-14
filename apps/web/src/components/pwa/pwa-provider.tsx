'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  isIosUserAgent,
  isInAppBrowserUserAgent,
  isStandaloneDisplay,
  pushSupported as detectPushSupported,
} from '@/lib/pwa/detect';

/** BeforeInstallPromptEvent isn't in the lib.dom typings yet - narrow shape of what we use. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaState {
  /** Post-mount detection finished. False during SSR / first paint to avoid a hydration mismatch. */
  ready: boolean;
  standalone: boolean;
  ios: boolean;
  inAppBrowser: boolean;
  pushSupported: boolean;
  /** A `beforeinstallprompt` event is captured and unused. */
  canInstall: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  /** The `/sw.js` registration once ready (null when the service worker is disabled/unsupported). */
  registration: ServiceWorkerRegistration | null;
  permission: NotificationPermission | 'unsupported';
  /** Re-read `Notification.permission` into state (e.g. after the user answers a permission prompt). */
  refreshPermission: () => void;
}

const INERT_STATE: PwaState = {
  ready: false,
  standalone: false,
  ios: false,
  inAppBrowser: false,
  pushSupported: false,
  canInstall: false,
  promptInstall: async () => 'unavailable',
  registration: null,
  permission: 'unsupported',
  refreshPermission: () => {},
};

const PwaContext = createContext<PwaState | null>(null);

function readPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try {
    return Notification.permission;
  } catch {
    return 'unsupported';
  }
}

/**
 * App-wide PWA context (master_plan §2AY decision D/E): install-prompt capture, display-mode/UA
 * detection, notification permission, and the `/sw.js` service-worker registration. Mounted once in
 * `AppShell` so the ME card, the push toggle and the install/CTA components all read the same state
 * instead of each re-registering the worker or re-attaching `beforeinstallprompt`.
 */
export function PwaProvider({
  children,
  serviceWorkerEnabled,
}: {
  children: ReactNode;
  serviceWorkerEnabled: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [inAppBrowser, setInAppBrowser] = useState(false);
  const [pushSupportedState, setPushSupportedState] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    'unsupported',
  );
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const refreshPermission = useCallback(() => {
    setPermission(readPermission());
  }, []);

  // Initial detection - runs once on mount, after hydration, so `ready` flips only on the client.
  useEffect(() => {
    try {
      const ua = navigator.userAgent ?? '';
      setIos(isIosUserAgent(ua));
      setInAppBrowser(isInAppBrowserUserAgent(ua));
      setStandalone(isStandaloneDisplay());
      setPushSupportedState(detectPushSupported());
      setPermission(readPermission());
    } catch {
      // Detection failing must never break the app shell - PwaState just stays at its defaults.
    } finally {
      setReady(true);
    }
  }, []);

  // Capture the native install prompt so a custom "Install" button can trigger it later, and track
  // installation so the row can disappear immediately without waiting on a display-mode re-check.
  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
    }
    function onAppInstalled() {
      setStandalone(true);
      setCanInstall(false);
      deferredPromptRef.current = null;
    }
    try {
      window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.addEventListener('appinstalled', onAppInstalled);
    } catch {
      // no-op: environment without these events (e.g. iOS Safari) just never sets canInstall.
    }
    return () => {
      try {
        window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
        window.removeEventListener('appinstalled', onAppInstalled);
      } catch {
        // no-op
      }
    };
  }, []);

  // Service worker lifecycle: register when enabled, or actively unregister + clear the way when the
  // Admin kill switch (`pwa_service_worker_enabled`) is off, so a rollback needs no deploy.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    if (!serviceWorkerEnabled) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          for (const reg of regs) {
            if (reg.active?.scriptURL?.endsWith('/sw.js') || reg.scope === `${location.origin}/`) {
              reg.unregister().catch(() => {});
            }
          }
        })
        .catch(() => {});
      return;
    }

    let cancelled = false;

    async function register() {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        const ready = await navigator.serviceWorker.ready;
        if (cancelled) return;
        setRegistration(ready ?? reg);
        ready?.update().catch(() => {});
      } catch {
        // Registration failing (unsupported browser, blocked storage, ...) must never break the app.
      }
    }

    if (document.readyState === 'complete') {
      register();
    } else {
      const onLoad = () => register();
      window.addEventListener('load', onLoad, { once: true });
      return () => {
        cancelled = true;
        window.removeEventListener('load', onLoad);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [serviceWorkerEnabled]);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const deferred = deferredPromptRef.current;
    if (!deferred) return 'unavailable';
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferredPromptRef.current = null;
      setCanInstall(false);
      return outcome;
    } catch {
      return 'unavailable';
    }
  }, []);

  const value: PwaState = {
    ready,
    standalone,
    ios,
    inAppBrowser,
    pushSupported: pushSupportedState,
    canInstall,
    promptInstall,
    registration,
    permission,
    refreshPermission,
  };

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

/** Returns the shared PWA state, or a safe inert default (never throws) when used outside the provider. */
export function usePwa(): PwaState {
  const ctx = useContext(PwaContext);
  return ctx ?? INERT_STATE;
}
