'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { requestSlotCancellation } from '@/lib/actions/registration';

/**
 * "Cancel my reservation" on a bare (no-division-yet) slot (master_plan §2AS Decision F). A live bare
 * slot only - a slot already attached to an entry uses `PaidEntryActions`' "Request to cancel"
 * instead. Sends a reason to the organizer; it does not cancel the reservation by itself, matching
 * the same honesty as the entry-cancellation request it mirrors.
 */
export function CancelReservationForm({
  slotId,
  tournamentId,
}: {
  slotId: string;
  tournamentId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [sent, setSent] = useState(false);

  function submit() {
    setMsg(null);
    setIsError(false);
    start(async () => {
      const res = await requestSlotCancellation(slotId, tournamentId, reason);
      if (res.ok) {
        setSent(true);
        setOpen(false);
        router.refresh();
      } else {
        setMsg(res.error ?? 'Could not send that request.');
        setIsError(true);
      }
    });
  }

  if (sent) {
    return (
      <p className="text-foreground-muted flex items-start gap-2 text-sm" role="status">
        <CheckCircle2 size={15} className="text-success mt-0.5 shrink-0" aria-hidden />
        <span>Cancellation requested - the organizer will decide.</span>
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border text-foreground hover:bg-surface-muted inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold"
      >
        <XCircle size={16} aria-hidden />
        Cancel my reservation
      </button>
    );
  }

  return (
    <div className="border-border space-y-2 rounded-xl border p-3">
      <label htmlFor="slotCancelReason" className="text-foreground block text-sm font-medium">
        Why do you need to cancel?
      </label>
      <textarea
        id="slotCancelReason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        minLength={5}
        maxLength={500}
        placeholder="e.g. I am injured and cannot play"
        className="border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm"
      />
      <p className="text-foreground-muted text-xs">
        This sends a request to the organizer. It does not cancel your reservation by itself, and
        anything about your payment is settled with them directly.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || reason.trim().length < 5}
          onClick={submit}
          className="vp-gradient inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {pending ? 'Sending…' : 'Send request'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="text-foreground-muted hover:text-foreground min-h-11 px-2 text-sm font-medium"
        >
          Never mind
        </button>
      </div>
      {msg && (
        <p className={`text-sm ${isError ? 'text-danger' : 'text-foreground-muted'}`} role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
