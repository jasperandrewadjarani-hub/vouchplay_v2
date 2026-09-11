'use client';

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';

/**
 * Pagination-and-filters persistence across a vouch-and-return trip (master_plan §2AG A1): open a
 * player from page 3 of a filtered directory, vouch for them, come back - and land on page 3 with
 * the same filters, not a bare `/players`. The list URL already carries every filter/sort/page value
 * (that is the whole point of §2B's URL-first design), so the only missing piece is remembering
 * WHICH list URL to return to. `sessionStorage` is the right lifetime for that: per-tab, cleared
 * when the tab closes, never sent to the server.
 */
const LAST_PLAYERS_URL_KEY = 'vp:last-players-url';

function readStoredListUrl(): string | null {
  try {
    return sessionStorage.getItem(LAST_PLAYERS_URL_KEY);
  } catch {
    // A locked-down browser context (private mode with storage blocked, etc.) - degrade to the
    // plain `/players` fallback everywhere below rather than throwing.
    return null;
  }
}

/**
 * Invisible effect mounted on the players list page: records the current, exact list URL (path +
 * every filter/sort/page param) every time it renders, so a later "Back to players" or Players-tab
 * tap can return to precisely this view.
 */
export function RememberListUrl() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    try {
      const qs = searchParams.toString();
      sessionStorage.setItem(LAST_PLAYERS_URL_KEY, qs ? `${pathname}?${qs}` : pathname);
    } catch {
      // Losing "return to page" is a minor inconvenience, never a reason to break the page.
    }
  }, [pathname, searchParams]);

  return null;
}

/**
 * "← Back to players" on the profile page: returns to the exact remembered list URL, falling back to
 * the bare directory when nothing was recorded (e.g. arrived via a shared profile link directly).
 * Reads `sessionStorage` after mount only, so the server-rendered/first-paint href is always the
 * safe `/players` fallback and there is nothing for hydration to mismatch on.
 */
export function BackToPlayersLink({ className }: { className?: string }) {
  const [href, setHref] = useState('/players');

  useEffect(() => {
    const stored = readStoredListUrl();
    if (stored) setHref(stored);
  }, []);

  return (
    <Link href={href} className={className}>
      ← Back to players
    </Link>
  );
}

/**
 * Wraps the primary-nav Players tab/link so tapping it restores the remembered list URL instead of
 * always bouncing to a bare `/players` (master_plan §2AG A1). A normal modified click (new tab,
 * middle-click, etc.) is left alone - only a plain left click is intercepted.
 */
export function PlayersNavLink({
  href,
  className,
  'aria-current': ariaCurrent,
  children,
}: {
  href: string;
  className?: string;
  'aria-current'?: 'page';
  children: ReactNode;
}) {
  const router = useRouter();

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const stored = readStoredListUrl();
    if (stored && stored !== href) {
      e.preventDefault();
      // scroll:false (master_plan §2AN decision 1): this restores the viewer's own remembered list
      // position - jumping to the top would undo the "return to where you were" point of §2AG A1.
      router.push(stored, { scroll: false });
    }
  }

  return (
    <Link href={href} className={className} aria-current={ariaCurrent} onClick={onClick}>
      {children}
    </Link>
  );
}
