'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  buildErrorTelemetry,
  isAuthStaleError,
  isChunkLoadError,
} from '@/lib/navigation/error-telemetry';

/**
 * Route-aware error boundary for the authenticated/public app (Phase 13.5). A long-idle tab that
 * wakes with a stale App Router payload or expired session must land on a recoverable, accessible
 * screen, not a generic crash. We offer a plain retry and, when the error looks auth-stale, a
 * sign-in/resume link that returns the user to the same route. Privacy-safe telemetry is sent once.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const authStale = isAuthStaleError(error);
  const chunkStale = isChunkLoadError(error);
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    const entry =
      typeof performance !== 'undefined'
        ? (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)
        : undefined;
    const deployVersion = process.env.NEXT_PUBLIC_DEPLOY_VERSION ?? 'dev';
    const body = buildErrorTelemetry({
      error,
      route: pathname || '/',
      visibility: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
      persistedRestore: entry?.type === 'back_forward',
      deployVersion,
      scope: 'app',
    });
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});

    // Auto-heal deployment skew (§2Q): a tab left open across a deploy fails to load an orphaned
    // chunk. reset() re-renders the same stale tree and fails again, so hard-reload once to pull the
    // current build. Guarded per deploy version (keepalive above still flushes telemetry first) so it
    // can never loop; if the reload does not resolve it, the manual retry button remains.
    if (chunkStale) {
      try {
        const key = `vp:skew-reload:${deployVersion}`;
        if (sessionStorage.getItem(key) !== '1') {
          sessionStorage.setItem(key, '1');
          window.location.reload();
        }
      } catch {
        /* sessionStorage blocked - fall through to the manual retry button */
      }
    }
  }, [error, pathname, chunkStale]);

  const signInHref = `/login?next=${encodeURIComponent(pathname || '/')}`;

  // For a stale-chunk error, reset() cannot recover (the chunk is gone); reload the document to fetch
  // the current build. For any other error, React's reset() is the right retry.
  const onRetry = () => {
    if (chunkStale) {
      window.location.reload();
      return;
    }
    reset();
  };

  return (
    <section className="mx-auto max-w-md py-16 text-center" role="alert">
      <div className="border-border bg-surface rounded-2xl border p-8">
        <h1 className="text-foreground text-lg font-semibold">
          {authStale ? 'Your session needs a refresh' : 'Something went wrong on this page'}
        </h1>
        <p className="text-foreground-muted mt-2 text-sm">
          {authStale
            ? 'You were away for a while and your sign-in expired. Sign in again to pick up where you left off.'
            : 'This can happen after a tab has been idle for a long time. Try again to reload the latest data.'}
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="border-border bg-surface text-foreground rounded-xl border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Try again
          </button>
          {authStale && (
            <a
              href={signInHref}
              className="bg-primary rounded-xl px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Sign in again
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
