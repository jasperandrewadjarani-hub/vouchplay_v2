import Link from 'next/link';
import Image from 'next/image';
import { Bell } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { Button } from './ui/button';
import { getOptionalUser } from '@/lib/auth';

/** App header (handover §5.2): logo upper-left, notification bell / sign-in upper-right. */
export async function Header() {
  const user = await getOptionalUser();

  return (
    <header className="border-border bg-surface/80 vp-hero sticky top-0 z-50 border-b backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2" aria-label="VouchPlay home">
          <Image
            src="/brand/vouchplay-logo-horizontal.png"
            alt="VouchPlay"
            width={148}
            height={32}
            priority
            className="h-8 w-auto"
          />
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <Link
              href="/me/notifications"
              aria-label="Notifications"
              className="border-border bg-surface text-foreground hover:border-primary relative rounded-full border p-2 transition-colors"
            >
              <Bell size={18} aria-hidden />
            </Link>
          ) : (
            <Link href="/login">
              <Button className="px-4 py-2">Sign in</Button>
            </Link>
          )}
        </div>
      </div>
      <div className="vp-gradient h-0.5 w-full opacity-80" aria-hidden />
    </header>
  );
}
