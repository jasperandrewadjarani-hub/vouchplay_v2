'use server';

import { revalidatePath } from 'next/cache';
import { MUTABLE_CATEGORIES } from '@vouchplay/core';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Notification user actions (handover §27). Marking read + preferences. All writes go through the
 * service client after confirming the caller owns the row/preferences (RLS keeps reads scoped; writes
 * are authored here).
 */
export interface NotificationActionState {
  ok?: boolean;
  error?: string;
}

export async function markNotificationRead(id: string): Promise<NotificationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  try {
    const svc = createServiceClient();
    await svc
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('recipient_id', user.id)
      .is('read_at', null);
    revalidatePath('/me/notifications');
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<NotificationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  try {
    const svc = createServiceClient();
    await svc
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', user.id)
      .is('read_at', null);
    revalidatePath('/me/notifications');
  } catch {
    return { error: 'That action is temporarily unavailable.' };
  }
  return { ok: true };
}

/** Save non-critical mute preferences + the email opt-in. Critical categories can never be muted. */
export async function updateNotificationPreferences(
  mutedCategories: string[],
  emailEnabled: boolean,
): Promise<NotificationActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  // Only mutable (non-critical) categories may be stored as muted.
  const allowed = new Set<string>(MUTABLE_CATEGORIES);
  const muted = Array.from(new Set(mutedCategories.filter((c) => allowed.has(c))));
  try {
    const svc = createServiceClient();
    await svc.from('notification_preferences').upsert(
      {
        user_id: user.id,
        muted_categories: muted,
        email_enabled: emailEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    revalidatePath('/me/settings/notifications');
  } catch {
    return { error: 'Could not save your preferences.' };
  }
  return { ok: true };
}
