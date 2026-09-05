'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PRIMARY_NAV, isActivePath } from './nav-items';

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
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground'
                  }`}
                >
                  {active && (
                    <span className="vp-gradient absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r" aria-hidden />
                  )}
                  <Icon size={20} aria-hidden strokeWidth={active ? 2.4 : 1.8} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
