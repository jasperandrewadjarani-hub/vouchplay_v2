'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PRIMARY_NAV, isActivePath } from './nav-items';

/** Mobile bottom tab bar (handover §5.1). Hidden at desktop widths where the sidebar takes over. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="border-border bg-surface/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
        {PRIMARY_NAV.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                  active ? 'text-primary' : 'text-foreground-muted hover:text-foreground'
                }`}
              >
                <Icon size={22} aria-hidden strokeWidth={active ? 2.4 : 1.8} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
