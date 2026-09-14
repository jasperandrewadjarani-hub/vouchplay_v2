import { buildServiceWorker } from '@/lib/pwa/sw-source';
import { loadSettingFlag } from '@/lib/settings';

/**
 * Serves the service worker at `/sw.js` from a route rather than a build plugin (master_plan §2AY
 * decision B). Two things a static `public/sw.js` file cannot give us: a per-deploy cache version (so
 * every deploy ships a byte-different worker and stale caches get dropped on `activate`) and the
 * `pwa_service_worker_enabled` Admin kill switch (instant rollback, no deploy). Next is pinned to
 * 15.5.25 (CLAUDE.md gotcha #1) specifically to avoid a webpack-injecting build plugin touching the
 * one fragile stage of the pipeline - the Vercel deploy - so this stays a plain runtime route.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const enabled = await loadSettingFlag('pwa_service_worker_enabled', true);
  const version = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
  const body = buildServiceWorker({
    version,
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
    enabled,
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
