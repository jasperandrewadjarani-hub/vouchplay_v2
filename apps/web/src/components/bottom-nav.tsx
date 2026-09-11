'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PRIMARY_NAV, isActivePath } from './nav-items';
import { PlayersNavLink } from './players/list-return';

/** Mobile bottom tab bar (handover §5.1). Hidden at desktop widths where the sidebar takes over. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="border-border bg-surface fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
        {PRIMARY_NAV.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          const className = `relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors ${
            active ? 'text-primary' : 'text-foreground-muted hover:text-foreground'
          }`;
          const content = (
            <>
              {active && (
                <span className="vp-gradient absolute top-0 h-0.5 w-8 rounded-b" aria-hidden />
              )}
              <Icon size={22} aria-hidden strokeWidth={active ? 2.4 : 1.8} />
              <span>{item.label}</span>
            </>
          );
          return (
            <li key={item.href} className="flex-1">
              {/* The Players tab restores the last remembered list URL (filters/sort/page) instead
                  of always bouncing to a bare /players (master_plan §2AG A1). Every other tab keeps
                  the plain Link. */}
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
  );
}
