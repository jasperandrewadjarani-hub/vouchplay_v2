import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Notification reads (handover §27). Per-viewer, uncached (the unread badge must be live). The caller
 * passes its OWN authenticated user id; reads are scoped to that recipient via the service client.
 */
export interface NotificationDTO {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const svc = createServiceClient();
    const { count } = await svc
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .is('read_at', null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function listNotifications(userId: string, limit = 50): Promise<NotificationDTO[]> {
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from('notifications')
      .select('id, type, category, title, body, link, read_at, created_at')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (
      (data ?? []) as {
        id: string;
        type: string;
        category: string;
        title: string;
        body: string | null;
        link: string | null;
        read_at: string | null;
        created_at: string;
      }[]
    ).map((n) => ({
      id: n.id,
      type: n.type,
      category: n.category,
      title: n.title,
      body: n.body,
      link: n.link,
      isRead: n.read_at != null,
      createdAt: n.created_at,
    }));
  } catch {
    return [];
  }
}

export interface NotificationPreferences {
  mutedCategories: string[];
  emailEnabled: boolean;
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from('notification_preferences')
      .select('muted_categories, email_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    const row = data as { muted_categories: string[]; email_enabled: boolean } | null;
    return {
      mutedCategories: row?.muted_categories ?? [],
      emailEnabled: row?.email_enabled ?? false,
    };
  } catch {
    return { mutedCategories: [], emailEnabled: false };
  }
}
