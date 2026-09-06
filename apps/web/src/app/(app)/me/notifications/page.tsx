import type { Metadata } from 'next';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { listNotifications } from '@/lib/notifications/queries';
import { NotificationList } from '@/components/notifications/notification-list';

export const metadata: Metadata = { title: 'Notifications' };

/** In-app notification center (handover §27). Lists the viewer's notifications; tap to open + read. */
export default async function NotificationsPage() {
  const user = await requireUser('/me/notifications');
  const notifications = await listNotifications(user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-foreground text-xl font-semibold tracking-tight">Notifications</h1>
        <Link
          href="/me/settings/notifications"
          className="text-foreground-muted hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <Settings size={15} aria-hidden />
          Preferences
        </Link>
      </div>
      <NotificationList initial={notifications} />
    </div>
  );
}
