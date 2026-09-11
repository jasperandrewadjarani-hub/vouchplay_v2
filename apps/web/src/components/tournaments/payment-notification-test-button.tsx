'use client';

import { useState, useTransition } from 'react';
import { sendPaymentNotificationTest } from '@/lib/actions/payment';

/**
 * Organizer-only "send a test email" control for the payment receipt notification setting (§2AK),
 * rendered on the Manage page next to the field so the organizer can confirm delivery before
 * registrations depend on it.
 */
export function PaymentNotificationTestButton({ tournamentId }: { tournamentId: string }) {
  const [result, setResult] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setResult(null);
    start(async () => {
      const response = await sendPaymentNotificationTest(tournamentId);
      if (response.error) return setResult({ kind: 'danger', text: response.error });
      setResult({ kind: 'success', text: response.message ?? 'Test email sent.' });
    });
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="border-border text-foreground hover:bg-surface-muted inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition-colors disabled:opacity-60"
      >
        {pending ? 'Sending test email…' : 'Send a test email'}
      </button>
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
