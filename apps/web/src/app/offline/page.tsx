import type { Metadata } from 'next';

/**
 * Offline fallback (master_plan §2AY decision C). The service worker serves this page from cache when
 * a navigation's network fetch fails (`sw-source.ts`), so it deliberately lives OUTSIDE the `(app)`
 * route group: `AppShell` does Supabase reads for the header/nudge chain/legal gate, none of which can
 * run from a cached response with no network. This route uses only the root layout (brand shell,
 * theme, fonts) - no auth, no DB, static at build time.
 *
 * The "Try again" link is a plain anchor, not a client component: this page can be served with no JS
 * running (worst case, an old cached copy after a worker update), so re-navigating has to work purely
 * from a normal `<a>` re-hitting the network.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <div className="bg-background flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export page, no next/image needed */}
      <img src="/icons/icon-192.png" alt="VouchPlay" className="h-16 w-16 rounded-2xl" />
      <h1 className="text-foreground mt-6 text-xl font-semibold">You&rsquo;re offline</h1>
      <p className="text-foreground-muted mt-2 max-w-xs text-sm">
        Reconnect to see your vouches and tournaments.
      </p>
      <a
        href="/"
        className="vp-gradient vp-glow mt-6 rounded-2xl px-6 py-3 text-sm font-semibold text-white"
      >
        Try again
      </a>
    </div>
  );
}
