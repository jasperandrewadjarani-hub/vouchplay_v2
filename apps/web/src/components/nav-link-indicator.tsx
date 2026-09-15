'use client';

import { createContext, useContext } from 'react';
import { useLinkStatus } from 'next/link';
import type { LucideIcon } from 'lucide-react';

/**
 * Escape hatch for a nav Link whose click handler diverts navigation through `router.push` instead
 * of letting `<Link>` handle it natively (the Players tab's "restore remembered list URL" - see
 * `PlayersNavLink` in `players/list-return.tsx`). `useLinkStatus` only reports pending for a
 * navigation Link's OWN default handler actually runs, so a diverted push wraps itself in
 * `useTransition` and provides its own `isPending` here; `NavLinkIndicator` ORs the two together.
 * Every other nav Link never sets this provider, so the context default (false) is a no-op for them.
 */
export const NavLinkPendingOverride = createContext(false);

/**
 * Visual state for one primary-nav item (bottom nav + sidebar), rendered as a child of its `<Link>`
 * so `useLinkStatus` can report the tap as pending the instant it registers - before the route
 * commits (Next.js 15.3+, master_plan §2BH decision H). This closes the ~0.5s gap where
 * `usePathname()`-only active styling only updates AFTER navigation finishes: the parent still owns
 * the post-commit `active` boolean, this component just ORs it with the pending tap.
 *
 * All colour-dependent classes live here, not on the `<Link>` itself, precisely so they can react to
 * `pending` - the Link only carries static layout classes (see bottom-nav.tsx / sidebar.tsx).
 */
export function NavLinkIndicator({
  active,
  label,
  Icon,
  variant,
}: {
  /** Post-navigation active state from `usePathname()` in the parent. */
  active: boolean;
  label: string;
  Icon: LucideIcon;
  variant: 'bottom' | 'sidebar';
}) {
  const { pending } = useLinkStatus();
  const overridePending = useContext(NavLinkPendingOverride);
  const isActive = active || pending || overridePending;
  const colour = isActive ? 'text-primary' : 'text-foreground-muted group-hover:text-foreground';

  if (variant === 'sidebar') {
    return (
      <>
        {isActive && <span className="bg-primary/10 absolute inset-0 rounded-xl" aria-hidden />}
        {isActive && (
          <span
            className="vp-gradient absolute top-1/2 left-0 h-6 w-1 -translate-y-1/2 rounded-r"
            aria-hidden
          />
        )}
        <Icon
          size={20}
          aria-hidden
          strokeWidth={isActive ? 2.4 : 1.8}
          className={`relative ${colour}`}
        />
        <span className={`relative ${colour}`}>{label}</span>
      </>
    );
  }

  return (
    <>
      {isActive && <span className="vp-gradient absolute top-0 h-0.5 w-8 rounded-b" aria-hidden />}
      <Icon size={22} aria-hidden strokeWidth={isActive ? 2.4 : 1.8} className={colour} />
      <span className={colour}>{label}</span>
    </>
  );
}
