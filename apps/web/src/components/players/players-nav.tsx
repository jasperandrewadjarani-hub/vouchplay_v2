'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { PlayerListSkeleton } from './player-list-skeleton';
import { Pagination } from '@/components/ui/pagination';

/**
 * Instant filter feedback on the Players tab (master_plan §2BM Decision B).
 *
 * One client transition runs every filter change on this page (quick chips, badge filter
 * apply/clear, sort, view toggle, pagination, search filters): `navigate()` pushes the URL inside
 * `useTransition`, so React keeps the current list on screen (server components included) until the
 * new one is ready, then swaps everything at once - no route-level `loading.tsx` gap, no frozen tap.
 *
 * `pendingHref` always reflects the LATEST call - a second tap while one is in flight simply starts a
 * newer transition; React discards the stale one on its own, and the chip/control that reads
 * `pendingHref` just tracks whichever href is current.
 */

type PlayersNavValue = {
  navigate: (href: string) => void;
  /** True while a navigation started through `navigate()` is still in flight. */
  pending: boolean;
  /** The href of the in-flight navigation, or null when nothing is pending. Compare against a
   *  control's own href to know whether THAT control is the one waiting (not some other filter). */
  pendingHref: string | null;
};

const PlayersNavContext = createContext<PlayersNavValue | null>(null);

export function PlayersNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  function navigate(href: string) {
    setPendingHref(href);
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  }

  return (
    <PlayersNavContext.Provider
      value={{ navigate, pending: isPending, pendingHref: isPending ? pendingHref : null }}
    >
      {children}
    </PlayersNavContext.Provider>
  );
}

/** Null outside `PlayersNavProvider` - every consumer in this directory falls back to a plain
 *  `router.push` in that case, so nothing here breaks if it's ever rendered somewhere else. */
export function usePlayersNav(): PlayersNavValue | null {
  return useContext(PlayersNavContext);
}

/**
 * A real `<a href>` (never `next/link`, which would try to intercept and prefetch on its own terms)
 * that behaves like a normal link - middle-click, cmd/ctrl-click, and right-click "open in new tab"
 * all work untouched - but a plain left click runs `onNavigate` instead of a full navigation, so
 * filter taps go through the shared transition above.
 */
export function NavAnchor({
  href,
  onNavigate,
  className,
  children,
  ...rest
}: {
  href: string;
  onNavigate: () => void;
  className?: string;
  children: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children' | 'onClick'>) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate();
  }
  return (
    <a href={href} onClick={onClick} className={className} {...rest}>
      {children}
    </a>
  );
}

/**
 * Wraps the results Suspense boundary (master_plan §2BM B): while a filter navigation is pending it
 * renders the same-shaped skeleton IN PLACE OF the boundary, so the swap to loading state is instant
 * (no route-level `loading.tsx` gap waiting on a full server re-render). Once the transition commits,
 * React already has the new server tree ready (that's what the transition waited for), so `children`
 * (the Suspense boundary) appears immediately - Suspense's own fallback still covers a genuinely slow
 * first paint or direct navigation, this only covers the client-side filter-tap gap.
 */
export function PlayersListFrame({ children, compact }: { children: ReactNode; compact: boolean }) {
  const ctx = usePlayersNav();
  const pending = ctx?.pending ?? false;
  // One-shot fade (120ms, see globals.css `.vp-players-fade-in`) for the render right after a
  // transition resolves - never on first paint (`wasPendingRef` starts false), so there is no flash
  // on a normal page load, only a subtle settle-in when the skeleton hands back to the real list.
  const wasPendingRef = useRef(false);
  const justResolved = wasPendingRef.current && !pending;
  useEffect(() => {
    wasPendingRef.current = pending;
  });

  if (pending) {
    return <PlayerListSkeleton compact={compact} />;
  }

  return <div className={justResolved ? 'vp-players-fade-in' : undefined}>{children}</div>;
}

/**
 * `Pagination` (`@/components/ui/pagination`) stays a plain, provider-agnostic component shared with
 * `clubs/page.tsx` - it takes `navigate`/`pendingHref` as opt-in props rather than reading context
 * itself. This is the thin client wrapper that supplies them from `PlayersNavProvider` for the
 * players list specifically; it is used from inside the (server) `PlayersResults` component, which
 * cannot call `usePlayersNav()` on its own.
 */
/**
 * Players-page pagination wired to the nav provider (master_plan §2BM).
 *
 * Takes `pageHrefs` (page 1 → index 0) as PLAIN STRINGS, never a function: this is a Client Component
 * rendered from the server `PlayersResults`, and React Server Components cannot pass functions across
 * that boundary - an `hrefFor` function prop here crashed the signed-in Players tab in production
 * (incident 2026-09-15, master_plan §2BN). The function is rebuilt on this side of the boundary.
 */
export function PlayersPagination({
  page,
  pageCount,
  pageHrefs,
  label,
}: {
  page: number;
  pageCount: number;
  pageHrefs: string[];
  label?: string;
}) {
  const ctx = usePlayersNav();
  const hrefFor = (n: number) => pageHrefs[n - 1] ?? pageHrefs[0] ?? '/players';
  return (
    <Pagination
      page={page}
      pageCount={pageCount}
      hrefFor={hrefFor}
      label={label}
      navigate={ctx?.navigate}
      pendingHref={ctx?.pendingHref ?? null}
    />
  );
}
