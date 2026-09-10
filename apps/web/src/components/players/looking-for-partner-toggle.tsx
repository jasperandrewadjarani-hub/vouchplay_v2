'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserSearch, Loader2 } from 'lucide-react';
import { setLookingForPartner } from '@/lib/actions/profile';

/**
 * One-tap "I'm looking for a partner" switch (master_plan §2M).
 *
 * The same control in two places - a card on the Players tab, and inline in the tournament's
 * partner-invite step - both writing the one `looking_for_partner` column, so the badge, the row
 * icon, the directory filter and the Edit-profile checkbox all stay in sync. Optimistic: the switch
 * moves on tap and settles when the write returns, reverting only if it failed.
 */
export function LookingForPartnerToggle({
  initial,
  variant = 'card',
}: {
  initial: boolean;
  /** 'card' is the standalone Players-tab surface; 'inline' is the slim row inside another panel. */
  variant?: 'card' | 'inline';
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next); // optimistic
    setError(null);
    start(async () => {
      const res = await setLookingForPartner(next);
      if (res.ok) {
        router.refresh();
      } else {
        setOn(!next); // revert
        setError(res.error ?? 'Could not update your status.');
      }
    });
  }

  const Switch = (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Looking for a partner"
      onClick={toggle}
      disabled={pending}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60"
      style={{ backgroundColor: on ? 'var(--accent-lime)' : 'var(--surface-muted)' }}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );

  if (variant === 'inline') {
    return (
      <div className="border-border bg-surface-muted flex items-center justify-between gap-3 rounded-xl border p-2.5">
        <span className="text-foreground flex items-center gap-2 text-sm font-medium">
          <UserSearch size={15} style={{ color: 'var(--accent-lime)' }} aria-hidden />
          {on ? "You're marked as looking for a partner" : 'No partner yet? Let others know'}
          {pending && <Loader2 size={13} className="animate-spin" aria-hidden />}
        </span>
        {Switch}
      </div>
    );
  }

  return (
    <div className="border-border bg-surface rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <UserSearch size={16} style={{ color: 'var(--accent-lime)' }} aria-hidden />
            Looking for a partner?
            {pending && <Loader2 size={13} className="animate-spin" aria-hidden />}
          </p>
          <p className="text-foreground-muted mt-0.5 text-xs">
            {on
              ? "You're findable - players can filter to you and see it on your card."
              : 'Turn this on so players searching for a partner can find you.'}
          </p>
        </div>
        {Switch}
      </div>
      {error && (
        <p className="text-danger mt-2 text-xs" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
