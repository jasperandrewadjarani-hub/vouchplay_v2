import { BRAND } from '@vouchplay/config';

export interface BuildServiceWorkerOptions {
  /** Cache-busting version baked into the cache name - one deploy = one byte-different worker. */
  version: string;
  /** Baked into the worker so `pushsubscriptionchange` can re-subscribe without a network round trip. */
  vapidPublicKey: string;
  /** Admin kill switch (`pwa_service_worker_enabled`, master_plan §2AY decision B). */
  enabled: boolean;
}

/**
 * Returns the service worker's JavaScript source as a plain string (master_plan §2AY decision B).
 * Deliberately plain ES2019 with no imports - it is served as-is by `app/sw.js/route.ts`, not bundled,
 * so nothing here may depend on the app's module graph. `enabled: false` returns a self-unregistering
 * worker (the Admin kill switch's no-deploy rollback path).
 */
export function buildServiceWorker(opts: BuildServiceWorkerOptions): string {
  const { version, vapidPublicKey, enabled } = opts;

  if (!enabled) {
    return `// VouchPlay service worker - DISABLED (master_plan §2AY decision B, version ${version}).
// The "pwa_service_worker_enabled" Admin setting is off: this build removes every previously
// installed VouchPlay worker and cache and unregisters itself, so the next navigation is
// worker-free with no app deploy required.
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k.indexOf('vp-') === 0;
            })
            .map(function (k) {
              return caches.delete(k);
            }),
        );
      })
      .then(function () {
        return self.registration.unregister();
      })
      .catch(function () {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k.indexOf('vp-') === 0;
            })
            .map(function (k) {
              return caches.delete(k);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      })
      .catch(function () {}),
  );
});
`;
  }

  return `// VouchPlay service worker (master_plan §2AY decision B, version ${version}).
// Conservative strategy for a hot, personalised, skew-protected site: navigations are always
// NETWORK-ONLY (HTML is never cached) with /offline as the fallback; /_next/static/* is cache-first
// (content-hashed, immutable); icons/brand/manifest are stale-while-revalidate; everything else
// (/api/*, /_next/image, /_next/data, Supabase, non-GET, cross-origin) is left untouched.
var CACHE = 'vp-' + ${JSON.stringify(version)};
var PRECACHE = [
  '/offline',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/badge-96.png',
  '/manifest.webmanifest',
];
var VAPID_PUBLIC_KEY = ${JSON.stringify(vapidPublicKey)};
var FALLBACK_TITLE = ${JSON.stringify(BRAND.name)};

function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var rawData = atob(base64);
  var outputArray = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        var puts = PRECACHE.map(function (url) {
          return cache.add(url).catch(function () {});
        });
        return Promise.all(puts).then(function () {
          // Fetch the freshly-cached offline page back out so its content-hashed stylesheet(s) can
          // be cached too - without this the first offline hit would render unstyled.
          return cache.match('/offline');
        });
      })
      .then(function (offlineResponse) {
        if (!offlineResponse) return;
        return offlineResponse
          .clone()
          .text()
          .then(function (html) {
            var matches = html.match(/href="(\\/_next\\/static\\/css\\/[^"]+)"/g) || [];
            var hrefs = matches
              .map(function (m) {
                var mm = m.match(/href="([^"]+)"/);
                return mm ? mm[1] : null;
              })
              .filter(Boolean);
            return caches.open(CACHE).then(function (cache) {
              return Promise.all(
                hrefs.map(function (href) {
                  return cache.add(href).catch(function () {});
                }),
              );
            });
          })
          .catch(function () {});
      })
      .catch(function () {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k.indexOf('vp-') === 0 && k !== CACHE;
            })
            .map(function (k) {
              return caches.delete(k);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      })
      .catch(function () {}),
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match('/offline');
      }),
    );
    return;
  }

  if (url.pathname.indexOf('/_next/static/') === 0) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;
        return fetch(request).then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(CACHE).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        });
      }),
    );
    return;
  }

  if (
    url.pathname.indexOf('/icons/') === 0 ||
    url.pathname.indexOf('/brand/') === 0 ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        var fetchPromise = fetch(request)
          .then(function (response) {
            if (response && response.ok) {
              var copy = response.clone();
              caches.open(CACHE).then(function (cache) {
                cache.put(request, copy);
              });
            }
            return response;
          })
          .catch(function () {
            return cached;
          });
        return cached || fetchPromise;
      }),
    );
    return;
  }

  // /api/*, /_next/image, /_next/data, Supabase, and anything else cross-origin or unmatched: never
  // call respondWith - let the browser handle the request normally.
});

self.addEventListener('push', function (event) {
  var payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }
  var title = (payload && payload.title) || FALLBACK_TITLE;
  var options = {
    body: payload && payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: payload && payload.tag,
    data: { url: (payload && payload.url) || '/me/notifications' },
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var data = event.notification.data || {};
  var targetUrl = new URL(data.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url && new URL(client.url).origin === self.location.origin) {
          if ('navigate' in client) {
            return client
              .navigate(targetUrl)
              .then(function (navigated) {
                return navigated ? navigated.focus() : client.focus();
              })
              .catch(function () {
                return client.focus();
              });
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener('pushsubscriptionchange', function (event) {
  event.waitUntil(
    Promise.resolve()
      .then(function () {
        return self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      })
      .then(function (subscription) {
        var json = subscription.toJSON();
        return fetch('/api/push/subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: json.keys,
            userAgent: self.navigator ? self.navigator.userAgent : '',
          }),
        });
      })
      .catch(function () {}),
  );
});
`;
}
