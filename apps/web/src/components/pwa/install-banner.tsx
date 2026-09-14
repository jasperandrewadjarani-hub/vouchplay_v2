'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { usePwa } from '@/components/pwa/pwa-provider';
import { openInChrome } from '@/lib/pwa/detect';
import { deriveInstallBranch, installBranchCopy } from './install-banner-state';
import { IosInstallSheet } from './ios-install-sheet';

const DISMISS_KEY = 'vp:install-banner:dismissed';
const APPEAR_DELAY_MS = 2500;

/**
 * Global auto-surfacing install banner (master_plan §2AZ). A bottom "mini-infobar" that slides up a
 * couple of seconds after arrival on any page and offers the one install action that fits the device -
 * install prompt, Chrome hand-off, or iOS steps. Mounted once in `AppShell`, floating just above the
 * mobile bottom nav / bottom-right on desktop, so it never collides with the top nudge chain.
 *
 * Persistence (§2AZ addendum - aggressive install push): dismiss is SESSION-scoped (`sessionStorage`),
 * so the X only tidies it away for the current visit and it returns on the next one. It stops coming
 * back for good only once the app is actually installed (`pwa.standalone`, at which point no branch
 * applies). Gated by the `pwa_install_banner_enabled` Admin kill switch; the passive ME-page card
 * (`AppInstallCard`) is the always-there way back in.
 *
 * Post-install confirmation (§2AZ addendum): the instant the app installs - via our button OR the
 * browser's own menu (`appinstalled`) - the card swaps to a short "open from your home screen" state.
 * No web API can launch the installed app or close this browser tab for the user, so a clear hand-off
 * pointing at the icon is the most we can do. It auto-retires after a few seconds.
 */
export function InstallBanner({ enabled }: { enabled: boolean }) {
  const pwa = usePwa();
  // Assume dismissed until localStorage says otherwise, so nothing can flash before the check runs.
  const [dismissed, setDismissed] = useState(true);
  const [shown, setShown] = useState(false);
  const [visible, setVisible] = useState(false); // drives the slide-up/fade transition
  const [copied, setCopied] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);
  const [confirmDismissed, setConfirmDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Switch to the confirmation card and retire the normal banner (session-dismiss) so nothing re-shows
  // if `standalone` updates a tick later than the install event.
  const markInstalled = useCallback(() => {
    setJustInstalled(true);
    setShown(true);
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // best-effort only
    }
  }, []);

  const branch = deriveInstallBranch({
    ready: pwa.ready,
    standalone: pwa.standalone,
    canInstall: pwa.canInstall,
    inAppBrowser: pwa.inAppBrowser,
    ios: pwa.ios,
  });

  // Read the per-session dismissal after mount (never during SSR). Session-scoped on purpose: the
  // banner returns on the next visit until the app is installed (§2AZ addendum).
  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  // Arm the appear timer once a valid branch exists and the banner is allowed. Cleared if the branch
  // disappears (e.g. the user installs) before it fires.
  useEffect(() => {
    if (!enabled || dismissed || !branch || shown) return;
    timerRef.current = setTimeout(() => setShown(true), APPEAR_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, dismissed, branch, shown]);

  // Kick the slide-up on the frame after the node mounts.
  useEffect(() => {
    if (!shown) return;
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [shown]);

  // Catch an install that happened outside our button (the browser's own "Install"/"Add" menu) so the
  // confirmation still fires.
  useEffect(() => {
    window.addEventListener('appinstalled', markInstalled);
    return () => window.removeEventListener('appinstalled', markInstalled);
  }, [markInstalled]);

  // Auto-retire the confirmation after a few seconds - it is an acknowledgement, not a task.
  useEffect(() => {
    if (!justInstalled) return;
    const t = setTimeout(() => setConfirmDismissed(true), 8000);
    return () => clearTimeout(t);
  }, [justInstalled]);

  function dismiss() {
    setVisible(false);
    setShown(false);
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Non-fatal: the banner may simply appear again sooner.
    }
  }

  // Post-install confirmation takes precedence over any install branch (and shows even though `branch`
  // is now null because the app is standalone).
  if (enabled && justInstalled && !confirmDismissed) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+4.75rem)] md:justify-end md:px-4 md:pb-4">
        <div
          role="status"
          className={`border-border bg-surface pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border p-3 shadow-lg transition-all duration-300 motion-reduce:transition-none md:max-w-sm ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static brand icon, no next/image needed */}
          <img
            src="/icons/icon-192.png"
            alt=""
            aria-hidden
            className="h-11 w-11 shrink-0 rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-sm leading-tight font-semibold">
              You&rsquo;re all set
            </p>
            <p className="text-foreground-muted mt-0.5 text-xs leading-snug">
              Open VouchPlay from this icon on your home screen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmDismissed(true)}
            className="vp-gradient vp-glow shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold text-white"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  if (!enabled || dismissed || !branch || !shown) return null;

  const copy = installBranchCopy(branch);

  async function onAction() {
    switch (branch) {
      case 'android': {
        const outcome = await pwa.promptInstall();
        if (outcome === 'accepted') {
          markInstalled(); // show the confirmation (appinstalled usually also fires; this is idempotent)
        } else if (outcome === 'dismissed') {
          dismiss(); // declined the OS prompt - stand down for this session
        }
        break;
      }
      case 'android-inapp':
        openInChrome();
        break;
      case 'ios-inapp':
        try {
          await navigator.clipboard.writeText(location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard API unavailable - nothing more we can safely do here.
        }
        break;
      case 'ios':
        setSheetOpen(true);
        break;
    }
  }

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+4.75rem)] md:justify-end md:px-4 md:pb-4"
        aria-live="polite"
      >
        <div
          role="region"
          aria-label="Install VouchPlay"
          className={`border-border bg-surface pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border p-3 shadow-lg transition-all duration-300 motion-reduce:transition-none md:max-w-sm ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static brand icon, no next/image needed */}
          <img
            src="/icons/icon-192.png"
            alt=""
            aria-hidden
            className="h-11 w-11 shrink-0 rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-sm leading-tight font-semibold">{copy.title}</p>
            <p className="text-foreground-muted mt-0.5 text-xs leading-snug">{copy.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onAction}
            className="vp-gradient vp-glow shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold text-white"
          >
            {branch === 'ios-inapp' && copied ? 'Copied' : copy.action}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-foreground-muted hover:text-foreground -mr-1 shrink-0 rounded-lg p-1.5"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>
      {branch === 'ios' && <IosInstallSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />}
    </>
  );
}
