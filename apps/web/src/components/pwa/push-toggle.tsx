'use client';

import { Bell, BellOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { usePushSubscription } from './use-push-subscription';
import { pushRowCopy } from './push-state';

/**
 * "Notifications on this device" row (master_plan §2AY Decision E). Shared between the ME "VouchPlay
 * on your phone" card and Notification preferences - same component, same copy, same behaviour.
 * Renders nothing when the device genuinely cannot do push (desktop browser without PushManager) so
 * the row never shows as a dead control.
 */
export function PushToggle({ adminEnabled, id }: { adminEnabled: boolean; id?: string }) {
  const { state, pending, error, enable, disable } = usePushSubscription({ adminEnabled });
  const copy = pushRowCopy(state);

  if (copy.hidden) return null;

  function toggle(next: boolean) {
    if (next) enable();
    else disable();
  }

  return (
    <div className="px-1">
      <Switch
        id={id}
        checked={state === 'on'}
        onCheckedChange={toggle}
        disabled={copy.disabled || pending}
        iconOn={Bell}
        iconOff={BellOff}
        label="Notifications on this device"
        description={copy.description}
      />
      {error && (
        <p className="text-danger text-xs" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
