/**
 * Pure PWA / push detection helpers (master_plan §2AY). No DOM access at import time - every browser
 * read is behind a function call - so this module is safely importable from a Node test and from
 * `pwa-provider.tsx` alike.
 */

/** True for an iPhone/iPad/iPod user agent - iOS Safari cannot fire `beforeinstallprompt`. */
export function isIosUserAgent(ua: string): boolean {
  return /iPhone|iPad|iPod/i.test(ua);
}

/**
 * True inside a Facebook/Messenger/Instagram/Line/TikTok/WeChat in-app browser - none of these can
 * install a PWA or receive push (finding 7, §2AY): the UI has to say so instead of showing a dead
 * button.
 */
export function isInAppBrowserUserAgent(ua: string): boolean {
  return /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|TikTok|MicroMessenger/i.test(ua);
}

/** True once the app is running in its installed, standalone window (Android/desktop or iOS). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mq || iosStandalone;
}

/** True when the browser exposes everything a push subscription needs. */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Decode a URL-safe base64 VAPID public key into the raw bytes `PushManager.subscribe` needs. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64Safe);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
