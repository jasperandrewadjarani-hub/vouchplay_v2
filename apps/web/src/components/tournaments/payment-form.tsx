'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { submitPayment, type PaymentActionState } from '@/lib/actions/payment';
import { Field, Input, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: PaymentActionState = {};

/**
 * Manual payment-proof submission (handover §24.1–§24.2). Shown for a registration awaiting payment
 * on a fee-bearing division. Handles first submission and resubmission after rejection.
 */
export function PaymentForm({
  registrationId,
  tournamentId,
  amountDue,
  currency,
  instructions,
  methods,
  paymentStatus,
  rejectionReason,
}: {
  registrationId: string;
  tournamentId: string;
  amountDue: number;
  currency: string;
  instructions: string | null;
  methods: string | null;
  paymentStatus: string | null;
  rejectionReason: string | null;
}) {
  const router = useRouter();
  const action = submitPayment.bind(null, registrationId, tournamentId);
  const [state, formAction] = useActionState(action, empty);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (paymentStatus === 'submitted') {
    return (
      <p className="text-foreground-muted mt-2 text-xs">
        Payment proof submitted - awaiting organizer review.
      </p>
    );
  }
  if (paymentStatus === 'verified') return null;

  return (
    <div className="border-border mt-2 rounded-lg border border-dashed p-3">
      <p className="text-foreground text-sm font-semibold">
        Payment due: {currency} {amountDue.toLocaleString()}
      </p>
      {instructions && (
        <p className="text-foreground-muted mt-1 text-xs whitespace-pre-wrap">{instructions}</p>
      )}
      {methods && <p className="text-foreground-muted mt-1 text-xs">Accepted: {methods}</p>}
      {paymentStatus === 'rejected' && rejectionReason && (
        <p className="text-danger mt-1 text-xs">
          Previous proof rejected: {rejectionReason}. Please resubmit.
        </p>
      )}
      <form action={formAction} className="mt-2 space-y-2">
        <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
        <FormError>{state.error}</FormError>
        <Field label="Method" htmlFor="method" required>
          <Input
            id="method"
            name="method"
            required
            maxLength={80}
            placeholder="e.g. GCash, bank transfer"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Payer name" htmlFor="payerName">
            <Input id="payerName" name="payerName" maxLength={120} />
          </Field>
          <Field label="Reference #" htmlFor="transactionReference">
            <Input id="transactionReference" name="transactionReference" maxLength={120} />
          </Field>
        </div>
        <Field
          label="Proof of payment"
          htmlFor="proof"
          required
          hint="PNG, JPG, WebP, or PDF, up to 5 MB."
        >
          <input
            id="proof"
            name="proof"
            type="file"
            required
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="text-foreground-muted file:border-border file:bg-surface file:text-foreground text-sm file:mr-3 file:rounded-lg file:border file:px-3 file:py-1.5 file:text-sm"
          />
        </Field>
        <SubmitButton pendingLabel="Submitting…">Submit payment proof</SubmitButton>
      </form>
    </div>
  );
}
