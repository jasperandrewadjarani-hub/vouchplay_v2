'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck } from 'lucide-react';
import { markNotificationRead, markAllNotificationsRead } from '@/lib/actions/notifications';
import type { NotificationDTO } from '@/lib/notifications/queries';

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function NotificationList({ initial }: { initial: NotificationDTO[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [pending, start] = useTransition();
  const hasUnread = items.some((n) => !n.isRead);

  function open(n: NotificationDTO) {
    if (!n.isRead) {
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      start(async () => {
        await markNotificationRead(n.id);
        router.refresh();
      });
    }
    if (n.link) router.push(n.link);
  }

  function markAll() {
    setItems((cur) => cur.map((x) => ({ ...x, isRead: true })));
    start(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  if (items.length === 0) {
    return <p className="text-foreground-muted text-sm">You have no notifications yet.</p>;
  }

  return (
    <div className="space-y-3">
      {hasUnread && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={markAll}
            disabled={pending}
            className="border-border text-foreground hover:bg-surface-muted inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            <CheckCheck size={14} aria-hidden />
            Mark all read
          </button>
        </div>
      )}
      <ul className="space-y-2">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => open(n)}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${
                n.isRead
                  ? 'border-border bg-surface'
                  : 'border-primary/30 bg-primary/5 hover:bg-primary/10'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-foreground text-sm font-medium">{n.title}</span>
                <span className="text-foreground-muted shrink-0 text-[11px]">
                  {relative(n.createdAt)}
                </span>
              </div>
              {n.body && <p className="text-foreground-muted mt-0.5 text-xs">{n.body}</p>}
              {!n.isRead && (
                <span
                  className="bg-primary mt-1 inline-block h-1.5 w-1.5 rounded-full"
                  aria-label="Unread"
                />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
