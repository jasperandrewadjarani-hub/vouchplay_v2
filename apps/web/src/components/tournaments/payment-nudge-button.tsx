'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { nudgeUnpaidPlayers } from '@/lib/actions/payment';

/**
 * Organizer-only "blast a pay-now reminder to every currently unpaid registration" control
 * (master_plan §2AQ Decision C), rendered on Manage next to the receipt-notification controls.
 * Mirrors `PaymentReceiptBackfillButton`'s inline-confirm-then-send-then-refresh pattern: no
 * `window.confirm`, an inline confirm step first, then an inline result.
 */
export function PaymentNudgeButton({
  tournamentId,
  unpaidCount,
}: {
  tournamentId: string;
  unpaidCount: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (unpaidCount === 0) {
    return <p className="text-foreground-muted text-xs">No unpaid players to remind right now.</p>;
  }

  const noun = unpaidCount === 1 ? 'player' : 'players';

  const submit = () => {
    setResult(null);
    start(async () => {
      const response = await nudgeUnpaidPlayers(tournamentId);
      setConfirming(false);
      if (response.error) return setResult({ kind: 'danger', text: response.error });
      const sent = response.sent ?? 0;
      const skipped = response.skipped ?? 0;
      setResult({
        kind: 'success',
        text:
          response.message ??
          `Reminded ${sent}${skipped > 0 ? ` · ${skipped} skipped (reminded today)` : ''}.`,
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-1.5">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground text-sm">
            Send a pay-now reminder to {unpaidCount} {noun}?
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="vp-gradient inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white transition-colors disabled:opacity-60"
          >
            {pending ? 'Sending…' : 'Send'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="border-border text-foreground hover:bg-surface-muted inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="border-border text-foreground hover:bg-surface-muted inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition-colors"
        >
          Remind unpaid players ({unpaidCount})
        </button>
      )}
      {result && (
        <p
          role={result.kind === 'danger' ? 'alert' : undefined}
          className={`text-xs ${result.kind === 'danger' ? 'text-danger' : 'text-success'}`}
        >
          {result.text}
        </p>
      )}
    </div>
  );
}
