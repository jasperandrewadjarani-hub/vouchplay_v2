import type { ReactNode } from 'react';
import { Header } from './header';
import { Sidebar } from './sidebar';
import { BottomNav } from './bottom-nav';

/**
 * App shell: sticky header, desktop sidebar, mobile bottom nav, centered max-width content
 * (handover §5.4). Bottom padding leaves room for the mobile tab bar.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Header />
      <div className="mx-auto flex w-full max-w-6xl">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 pt-4 pb-24 md:pb-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
