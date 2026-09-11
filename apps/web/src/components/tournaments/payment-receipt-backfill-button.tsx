'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendAllPaymentReceipts } from '@/lib/actions/payment';

/**
 * Organizer-only "email every uploaded receipt not yet emailed" backfill control (master_plan §2AL),
 * rendered next to the test-email button on the Manage page. It is a bulk external send, so tapping
 * it shows an inline confirm step first (no `window.confirm`) before calling the action, then an
 * inline result; a successful send refreshes the page so `pendingCount` updates.
 */
export function PaymentReceiptBackfillButton({
  tournamentId,
  pendingCount,
  email,
}: {
  tournamentId: string;
  pendingCount: number;
  email: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!email) return null;

  if (pendingCount === 0) {
    return (
      <p className="text-foreground-muted text-xs">All uploaded receipts have been emailed.</p>
    );
  }

  const noun = pendingCount === 1 ? 'receipt' : 'receipts';
  const emailNoun = pendingCount === 1 ? 'email' : 'emails';

  const submit = () => {
    setResult(null);
    start(async () => {
      const response = await sendAllPaymentReceipts(tournamentId);
      setConfirming(false);
      if (response.error) return setResult({ kind: 'danger', text: response.error });
      setResult({ kind: 'success', text: response.message ?? 'Receipts emailed.' });
      router.refresh();
    });
  };

  return (
    <div className="space-y-1.5">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground text-sm">
            Send {pendingCount} {emailNoun} to {email}?
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
          Email {pendingCount} uploaded {noun} to {email}
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
