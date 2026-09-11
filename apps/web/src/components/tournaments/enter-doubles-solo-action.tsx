'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { enterDoublesSolo } from '@/lib/actions/registration';
import { formatMonthDay } from '@/lib/format-date';

/**
 * "Enter now, choose a partner later" (master_plan §2AM decision 2). A secondary option next to
 * "Enter with a partner": pay for the team slot immediately with an open second seat, and name a
 * partner any time before the lock-in. An inline two-line confirm sheet, not a silent action - the
 * player is about to pay for a slot with no partner named yet.
 */
export function EnterDoublesSoloAction({
  tournamentId,
  divisionId,
  partnerLockAt,
}: {
  tournamentId: string;
  divisionId: string;
  /** Effective partner lock-in, or null when there is none to show. */
  partnerLockAt: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function submit() {
    setMsg(null);
    setIsError(false);
    start(async () => {
      const res = await enterDoublesSolo(tournamentId, divisionId);
      if (res.ok) {
        if (res.registrationId) {
          router.push(`?entered=${res.registrationId}#my-registrations`, { scroll: false });
        }
        router.refresh();
      } else {
        setMsg(res.error ?? 'Could not enter. Please try again.');
        setIsError(true);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-primary mt-1.5 inline-flex min-h-[40px] items-center text-xs font-semibold underline underline-offset-2"
      >
        Enter now, choose a partner later
      </button>
    );
  }

  return (
    <div className="border-border bg-surface mt-1.5 space-y-2 rounded-xl border p-3">
      <p className="text-foreground text-sm">
        You pay for the team slot now and choose your partner later
        {partnerLockAt ? ` - before ${formatMonthDay(partnerLockAt)}` : ''}.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="vp-gradient inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 text-xs font-semibold text-white disabled:opacity-50"
        >
          {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {pending ? 'Proceeding…' : 'Continue'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="border-border text-foreground min-h-[40px] rounded-lg border px-4 text-xs font-semibold disabled:opacity-50"
        >
          Back
        </button>
      </div>
      {msg && (
        <p className={`text-xs ${isError ? 'text-danger' : 'text-foreground-muted'}`} role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
