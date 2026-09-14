import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getNotificationPreferences } from '@/lib/notifications/queries';
import { emailChannelEnabled } from '@/lib/notifications/email';
import { loadSettingFlag } from '@/lib/settings';
import { NotificationPreferencesForm } from '@/components/notifications/notification-preferences';

export const metadata: Metadata = { title: 'Notification preferences' };

/** Notification preferences (handover §27.5). */
export default async function NotificationSettingsPage() {
  const user = await requireUser('/me/settings/notifications');
  const [prefs, pushEnabled] = await Promise.all([
    getNotificationPreferences(user.id),
    // master_plan §2AY Decision E: the same "Notifications on this device" switch as the ME card.
    loadSettingFlag('push_notifications_enabled', true),
  ]);

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="space-y-1">
        <h1 className="text-foreground text-xl font-semibold tracking-tight">
          Notification preferences
        </h1>
        <p className="text-foreground-muted text-sm">Choose what you want to hear about.</p>
      </div>
      <NotificationPreferencesForm
        mutedCategories={prefs.mutedCategories}
        emailEnabled={prefs.emailEnabled}
        emailChannelReady={emailChannelEnabled()}
        pushEnabled={pushEnabled}
      />
    </div>
  );
}
