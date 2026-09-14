'use client';

import { usePwa } from '@/components/pwa/pwa-provider';
import { usePushSubscription } from '@/components/pwa/use-push-subscription';
import { pushRowCopy } from '@/components/pwa/push-state';
import { InstallRow } from '@/components/pwa/install-row';
import { PushToggle } from '@/components/pwa/push-toggle';

/**
 * "VouchPlay on your phone" card (master_plan §2AY Decision E) - ME page, directly under the profile
 * header and before "Who can see my ratings". Two rows: Add to Home Screen, Notifications on this
 * device. Both rows decide their own visibility internally; this card additionally hides ITSELF once
 * detection has settled and both rows would render nothing, so no empty card ever shows (e.g. a
 * desktop browser, already installed, with push off by admin).
 */
export function AppInstallCard({
  installPromptEnabled,
  pushEnabled,
}: {
  installPromptEnabled: boolean;
  pushEnabled: boolean;
}) {
  const pwa = usePwa();
  const { state } = usePushSubscription({ adminEnabled: pushEnabled });

  const installRowVisible =
    installPromptEnabled &&
    pwa.ready &&
    !pwa.standalone &&
    (pwa.canInstall || pwa.ios || pwa.inAppBrowser);
  const pushRowVisible = !pushRowCopy(state).hidden;
  const settled = pwa.ready && state !== 'loading';

  if (settled && !installRowVisible && !pushRowVisible) return null;

  return (
    <div className="border-border bg-surface space-y-1 rounded-2xl border p-4">
      <h2 className="text-foreground text-sm font-semibold">VouchPlay on your phone</h2>
      <div className="divide-border -mx-1 divide-y">
        {installPromptEnabled && <InstallRow />}
        <PushToggle adminEnabled={pushEnabled} />
      </div>
    </div>
  );
}
