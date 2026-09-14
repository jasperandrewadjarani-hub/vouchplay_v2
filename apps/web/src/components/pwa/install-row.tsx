'use client';

import { useState } from 'react';
import { Smartphone } from 'lucide-react';
import { usePwa } from '@/components/pwa/pwa-provider';
import { openInChrome } from '@/lib/pwa/detect';
import { Button } from '@/components/ui/button';
import { IosInstallSheet } from './ios-install-sheet';

const smallBtn = 'px-3 py-1.5 text-xs';

/**
 * "Add to Home Screen" row (master_plan §2AY Decision E) - mirrors a Switch row's layout (icon,
 * label + description, a single action on the right) without being a toggle: there is nothing to
 * turn off once installed, the row just disappears.
 */
export function InstallRow() {
  const pwa = usePwa();
  const [showSheet, setShowSheet] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!pwa.ready) {
    return (
      <Row description="Checking this device…">
        <span />
      </Row>
    );
  }

  if (pwa.standalone || installed) return null;

  if (pwa.canInstall) {
    return (
      <Row description="Get the app icon on your phone">
        <Button
          type="button"
          variant="secondary"
          className={smallBtn}
          onClick={async () => {
            const outcome = await pwa.promptInstall();
            if (outcome === 'accepted') setInstalled(true);
          }}
        >
          Install
        </Button>
      </Row>
    );
  }

  // The in-app-browser case comes BEFORE iOS: an iPhone inside Facebook / Messenger has no Share ->
  // Add to Home Screen at all, so the Safari steps would be a dead end there. On Android we can hand
  // straight off to Chrome (§2AZ); iOS has no intent scheme, so it falls back to copy-link + Safari.
  if (pwa.inAppBrowser) {
    if (!pwa.ios) {
      return (
        <Row description="Open in Chrome to install">
          <Button
            type="button"
            variant="secondary"
            className={smallBtn}
            onClick={() => openInChrome()}
          >
            Open in Chrome
          </Button>
        </Row>
      );
    }
    return (
      <Row description="Open in Safari to install">
        <Button
          type="button"
          variant="secondary"
          className={smallBtn}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Clipboard API unavailable - nothing more we can do here.
            }
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </Row>
    );
  }

  if (pwa.ios) {
    return (
      <>
        <Row description="Works like an app, with notifications">
          <Button
            type="button"
            variant="secondary"
            className={smallBtn}
            onClick={() => setShowSheet(true)}
          >
            Show me how
          </Button>
        </Row>
        <IosInstallSheet open={showSheet} onClose={() => setShowSheet(false)} />
      </>
    );
  }

  return null;
}

function Row({ description, children }: { description: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 w-full items-center justify-between gap-3 px-1">
      <span className="flex min-w-0 items-center gap-2">
        <Smartphone size={15} className="text-foreground-muted shrink-0" aria-hidden />
        <span className="min-w-0">
          <span className="text-foreground block text-sm font-medium">Add to Home Screen</span>
          <span className="text-foreground-muted block text-xs">{description}</span>
        </span>
      </span>
      {children}
    </div>
  );
}
