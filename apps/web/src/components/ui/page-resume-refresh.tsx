'use client';

import { useCallback, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { shouldRefreshOnResume } from '@/lib/navigation/resume-refresh';

/**
 * Mobile browsers commonly suspend an unused PWA tab and later restore an old App Router payload.
 * Refresh only when returning from a meaningful suspension/BFCache restore; do not poll while hidden.
 */
export function PageResumeRefresh() {
  const router = useRouter();
  const hiddenAt = useRef<number | null>(null);
  const lastRefreshAt = useRef<number | null>(null);
  const [pending, startTransition] = useTransition();

  const refreshIfNeeded = useCallback(
    (persistedRestore: boolean) => {
      const now = Date.now();
      if (
        !shouldRefreshOnResume({
          now,
          hiddenAt: hiddenAt.current,
          lastRefreshAt: lastRefreshAt.current,
          persistedRestore,
        })
      )
        return;
      lastRefreshAt.current = now;
      hiddenAt.current = null;
      startTransition(() => router.refresh());
    },
    [router, startTransition],
  );

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      if (document.visibilityState === 'visible') refreshIfNeeded(false);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refreshIfNeeded(true);
    };

    if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [refreshIfNeeded]);

  return pending ? (
    <span className="sr-only" role="status" aria-live="polite">
      Refreshing the latest VouchPlay information…
    </span>
  ) : null;
}
