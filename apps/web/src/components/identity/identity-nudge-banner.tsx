'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, X } from 'lucide-react';

/**
 * Self-nudge banner for identity verification (master_plan §2AG Phase C, D2) - a quiet strip under
 * the header, mirroring the unvouched nudge in tone. Unlike that one, this is dismissible: it is a
 * recurring suggestion rather than a one-time launch message, so it needs to be silenceable without
 * disappearing forever. Renders nothing during server rendering and only decides after mount (same
 * approach as `WelcomeModal`) to avoid a hydration mismatch against the localStorage-derived
 * dismissal, which lives only in this viewer's browser.
 */
const STORAGE_KEY = 'vp:identity-nudge:snoozed-until';
const SNOOZE_DAYS = 7;

export function IdentityNudgeBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const until = window.localStorage.getItem(STORAGE_KEY);
      setVisible(!until || Number(until) < Date.now());
    } catch {
      // Private mode or blocked storage: show it rather than hide the nudge.
      setVisible(true);
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000),
      );
    } catch {
      // Non-fatal: the banner simply shows again next visit.
    }
  }

  if (!visible) return null;

  return (
    <div className="border-primary/30 bg-primary/5 border-b">
      <div className="text-foreground mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2 text-xs sm:text-sm">
        <ShieldCheck size={16} className="text-primary shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">Add your ID to earn a trusted badge.</span>
        <Link
          href="/me/settings/identity"
          className="text-primary shrink-0 font-semibold underline underline-offset-2"
        >
          Verify now
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-foreground-muted hover:text-foreground shrink-0"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}
