import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ThemeToggle } from '@/components/theme-toggle';

/** Minimal, focused layout for auth + onboarding — no bottom nav or sidebar. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="vp-hero flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4">
        <Link href="/" className="flex flex-col leading-none" aria-label="VouchPlay home">
          <Image
            src="/brand/vouchplay-logo-horizontal.png"
            alt="VouchPlay"
            width={210}
            height={44}
            priority
            className="h-11 w-auto"
          />
          <span className="text-foreground-muted mt-1 pl-0.5 text-[10px] font-medium tracking-wide">
            By JT Consulting &amp; Analytics
          </span>
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-5 py-6 sm:items-center">
        <div className="border-border bg-surface vp-in w-full max-w-sm rounded-3xl border p-6 shadow-sm sm:p-7">
          {children}
        </div>
      </main>
    </div>
  );
}
