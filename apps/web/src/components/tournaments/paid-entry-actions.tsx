'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { requestRegistrationCancellation } from '@/lib/actions/registration';

/**
 * What a player can do once their receipt is in (master_plan §1Y).
 *
 * The old copy told them to message the organizer about a refund, which invited a conversation about
 * money VouchPlay never handled and was the wrong first thought after paying successfully. The state
 * now says plainly what is true, then offers the two things that genuinely exist.
 *
 * "Request to cancel" does not cancel anything, and the button says so before it is pressed. Once a
 * receipt exists the money went straight to the organizer, so only they can undo it. A control that
 * implies it cancels and then does not would be worse than no control at all.
 */
// Post-payment partner change is designed (§1Y) but needs the transactional RPC in migration 0027.
// The sentence promising it is deliberately NOT shipped yet: copy that describes a capability the
// app does not have is worse than no copy.
export function PaidEntryActions({
  registrationId,
  tournamentId,
}: {
  registrationId: string;
  tournamentId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function submit() {
    setMsg(null);
    setIsError(false);
    start(async () => {
      const res = await requestRegistrationCancellation(registrationId, tournamentId, reason);
      if (res.ok) {
        setSent(true);
        setOpen(false);
        setMsg(res.message ?? 'Request sent.');
        setIsError(false);
        router.refresh();
      } else {
        setMsg(res.error ?? 'Could not send that request.');
        setIsError(true);
      }
    });
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="text-foreground text-sm font-semibold">Payment submitted.</p>
      <p className="text-foreground-muted text-sm">
        This entry cannot be changed while the organizer reviews it.
      </p>

      {sent ? (
        <p className="text-foreground-muted flex items-start gap-2 text-sm" role="status">
          <CheckCircle2 size={15} className="text-success mt-0.5 shrink-0" aria-hidden />
          <span>Your cancellation request is with the organizer and is under review.</span>
        </p>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-border text-foreground inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-semibold"
        >
          Request to cancel
        </button>
      ) : (
        <div className="border-border space-y-2 rounded-xl border p-3">
          <label className="text-foreground block text-sm font-medium" htmlFor="cancelReason">
            Why do you need to cancel?
          </label>
          <textarea
            id="cancelReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. I am injured and cannot play"
            className="border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm"
          />
          <p className="text-foreground-muted text-xs">
            This sends a request to the organizer. It does not cancel your entry by itself, and
            anything about your payment is settled with them directly.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || reason.trim().length < 5}
              onClick={submit}
              className="vp-gradient inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
              {pending ? 'Sending…' : 'Send request'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setMsg(null);
              }}
              className="text-foreground-muted hover:text-foreground min-h-[44px] px-2 text-sm font-medium"
            >
              Never mind
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={`text-sm ${isError ? 'text-danger' : 'text-foreground-muted'}`} role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
