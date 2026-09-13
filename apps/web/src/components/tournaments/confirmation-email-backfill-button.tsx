'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { emailConfirmedPlayers } from '@/lib/actions/payment';

/**
 * Organizer-only "email every confirmed entry not yet emailed" backfill control (master_plan §2AQ
 * Decision D) - the same shape as `PaymentReceiptBackfillButton`: inline confirm, then an inline
 * result, then a refresh so the backlog count updates.
 */
export function ConfirmationEmailBackfillButton({
  tournamentId,
  backlog,
}: {
  tournamentId: string;
  backlog: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (backlog === 0) {
    return <p className="text-foreground-muted text-xs">All confirmed players emailed.</p>;
  }

  const noun = backlog === 1 ? 'player' : 'players';

  const submit = () => {
    setResult(null);
    start(async () => {
      const response = await emailConfirmedPlayers(tournamentId);
      setConfirming(false);
      if (response.error) return setResult({ kind: 'danger', text: response.error });
      setResult({ kind: 'success', text: response.message ?? 'Confirmation emails sent.' });
      router.refresh();
    });
  };

  return (
    <div className="space-y-1.5">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground text-sm">
            Email {backlog} confirmed {noun} not yet emailed?
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="bg-primary text-primary-foreground inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-60"
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
          Email confirmed players ({backlog} not yet emailed)
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
