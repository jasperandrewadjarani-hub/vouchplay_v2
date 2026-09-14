'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { usePushSubscription } from './use-push-subscription';

const STORAGE_PREFIX = 'vp:push-cta:';

/**
 * Contextual push opt-in (master_plan §2AY Decision F) - a compact inline block at the moment of
 * value (registration Done step, vouch success screen). Shown at most once per context per device:
 * dismissing it ("Not now") or successfully enabling push hides it for good. Never blocks the
 * screen's primary actions - it renders below them, nothing else on the page waits on it.
 */
export function PushOptInCta({
  context,
  onVisible,
  onHidden,
}: {
  context: 'registration' | 'vouch';
  /** Fires once the block actually renders - a host with an auto-close timer can hold itself open. */
  onVisible?: () => void;
  /** Fires when the block goes away again (Not now, or the "all set" line timing out). */
  onHidden?: () => void;
}) {
  const { state, enable } = usePushSubscription({ adminEnabled: true });
  const [dismissed, setDismissed] = useState(true);
  const [justEnabled, setJustEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const key = `${STORAGE_PREFIX}${context}`;
  const visible = !dismissed && state === 'off';

  useEffect(() => {
    if (visible) onVisible?.();
    else onHidden?.();
    // The callbacks are host-owned setters; only the visibility transition matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(key) === '1');
    } catch {
      setDismissed(false);
    }
  }, [key]);

  useEffect(() => {
    if (!justEnabled) return;
    const timer = setTimeout(() => setDismissed(true), 3000);
    return () => clearTimeout(timer);
  }, [justEnabled]);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      // Non-fatal: the CTA simply shows again next time.
    }
  }

  if (dismissed || state !== 'off') return null;

  if (justEnabled) {
    return (
      <div className="border-border bg-surface rounded-xl border p-3 text-center">
        <p className="text-success text-sm font-medium">You&apos;re all set.</p>
      </div>
    );
  }

  return (
    <div className="border-border bg-surface flex items-center gap-3 rounded-xl border p-3">
      <Bell size={18} className="text-foreground-muted shrink-0" aria-hidden />
      <p className="text-foreground min-w-0 flex-1 text-sm font-medium">
        Get updates on your phone
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const ok = await enable();
          setBusy(false);
          if (ok) {
            try {
              window.localStorage.setItem(key, '1');
            } catch {
              // Non-fatal.
            }
            setJustEnabled(true);
          }
        }}
        className="vp-gradient vp-glow shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        Turn on notifications
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="text-foreground-muted hover:text-foreground shrink-0 rounded-xl px-2 py-1.5 text-xs font-medium"
      >
        Not now
      </button>
    </div>
  );
}
