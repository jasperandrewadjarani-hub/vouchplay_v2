'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PRIMARY_NAV, isActivePath } from './nav-items';
import { PlayersNavLink } from './players/list-return';
import { NavLinkIndicator } from './nav-link-indicator';

/** Desktop/tablet left sidebar (handover §5.4). Same destinations as the mobile bottom nav. */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-border hidden w-56 shrink-0 border-r md:block">
      <nav aria-label="Primary" className="sticky top-16 p-3">
        <ul className="space-y-1">
          {PRIMARY_NAV.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            // Layout only - no colour/background here. NavLinkIndicator (a child of the Link) owns
            // every colour-dependent class (including the active pill background) so it can react to
            // useLinkStatus' pending state instantly instead of waiting for usePathname to update
            // post-commit (master_plan §2BH decision H). `group` drives the hover colour.
            const className =
              'group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-semibold transition-all hover:bg-surface-muted';
            const content = (
              <NavLinkIndicator active={active} label={item.label} Icon={Icon} variant="sidebar" />
            );
            return (
              <li key={item.href}>
                {/* The Players tab restores the last remembered list URL (filters/sort/page)
                    instead of always bouncing to a bare /players (master_plan §2AG A1). */}
                {item.href === '/players' ? (
                  <PlayersNavLink
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={className}
                  >
                    {content}
                  </PlayersNavLink>
                ) : (
                  <Link
                    href={item.href}
                    // Load fix #3 (notes 2026-09-15): no background prerender of every tab - each prefetch ran
                    // the whole AppShell and its database reads. Taps still get instant pending feedback.
                    prefetch={false}
                    aria-current={active ? 'page' : undefined}
                    className={className}
                  >
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
