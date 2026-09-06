import Link from 'next/link';
import Image from 'next/image';
import { Bell } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { Button } from './ui/button';
import { PlayerAvatar } from './players/player-avatar';
import { getOptionalUser, getMyProfile } from '@/lib/auth';
import { getUnreadCount } from '@/lib/notifications/queries';
import { avatarUrl } from '@/lib/storage';

/** App header (handover §5.2): logo upper-left, notification bell + profile / sign-in upper-right. */
export async function Header() {
  const user = await getOptionalUser();
  const profile = user ? await getMyProfile() : null;
  const unread = user ? await getUnreadCount(user.id) : 0;
  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    profile?.nickname ||
    'You';
  const initials =
    `${profile?.first_name?.[0] ?? ''}${profile?.last_name?.[0] ?? ''}`.toUpperCase() ||
    (profile?.nickname?.[0] ?? 'Y').toUpperCase();

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
            <>
              <Link
                href="/me/notifications"
                aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
                className="border-border bg-surface text-foreground hover:border-primary relative rounded-full border p-2 transition-colors"
              >
                <Bell size={18} aria-hidden />
                {unread > 0 && (
                  <span className="bg-danger absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>
              <Link
                href="/me"
                aria-label="Your account"
                title={displayName}
                className="hover:ring-primary/40 rounded-full ring-2 ring-transparent transition-shadow"
              >
                <PlayerAvatar
                  url={avatarUrl(profile?.avatar_path)}
                  initials={initials}
                  name={displayName}
                  size="sm"
                />
              </Link>
            </>
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
