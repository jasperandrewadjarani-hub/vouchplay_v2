'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserSearch, Handshake, Loader2 } from 'lucide-react';
import { setLookingForPartner, setOpenForSponsorship } from '@/lib/actions/profile';

/**
 * Availability toggles (master_plan §2M/§2N).
 *
 * One control, generic over the flag it writes, so "looking for a partner" and "open to sponsorship"
 * behave identically and both stay in sync with the badge, the directory filter, the compact-row icon
 * and the Edit-profile checkboxes. Optimistic: the switch moves on tap and settles when the write
 * returns, reverting only on failure.
 */
type Kind = 'partner' | 'sponsor';

const COPY: Record<Kind, { on: string; off: string; label: string; icon: typeof UserSearch }> = {
  partner: {
    label: 'Looking for a partner',
    on: "You're marked as looking for a partner",
    off: 'Looking for a partner',
    icon: UserSearch,
  },
  sponsor: {
    label: 'Open to sponsorship',
    on: "You're open to sponsorship",
    off: 'Open to sponsorship',
    icon: Handshake,
  },
};

function AvailabilityToggle({ kind, initial }: { kind: Kind; initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const copy = COPY[kind];
  const Icon = copy.icon;

  function toggle() {
    const next = !on;
    setOn(next); // optimistic
    setError(null);
    start(async () => {
      const res =
        kind === 'partner' ? await setLookingForPartner(next) : await setOpenForSponsorship(next);
      if (res.ok) router.refresh();
      else {
        setOn(!next); // revert
        setError(res.error ?? 'Could not update your status.');
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-foreground flex min-w-0 items-center gap-2 text-sm font-medium">
          <Icon
            size={15}
            className="shrink-0"
            style={{ color: 'var(--accent-lime)' }}
            aria-hidden
          />
          <span className="truncate">{on ? copy.on : copy.off}</span>
          {pending && <Loader2 size={13} className="shrink-0 animate-spin" aria-hidden />}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={copy.label}
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
      </div>
      {error && (
        <p className="text-danger mt-1 text-xs" role="status">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Both availability toggles as one compact card - two thin rows, not two cards, so a directory screen
 * is not doubled in height (§2N). Grouped under one heading because it is one decision: how you want
 * to be found.
 */
export function AvailabilityCard({
  lookingForPartner,
  openForSponsorship,
}: {
  lookingForPartner: boolean;
  openForSponsorship: boolean;
}) {
  return (
    <div className="border-border bg-surface space-y-2 rounded-2xl border px-3.5 py-3">
      <p className="text-foreground-muted text-[11px] font-medium tracking-wide uppercase">
        Let people find you
      </p>
      <AvailabilityToggle kind="partner" initial={lookingForPartner} />
      <AvailabilityToggle kind="sponsor" initial={openForSponsorship} />
    </div>
  );
}

/** Standalone inline "looking for a partner" toggle for the tournament partner-invite step (§2M). */
export function LookingForPartnerInline({ initial }: { initial: boolean }) {
  return (
    <div className="border-border bg-surface-muted rounded-xl border p-2.5">
      <AvailabilityToggle kind="partner" initial={initial} />
    </div>
  );
}
