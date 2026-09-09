'use client';

import { useActionState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { submitPayment, type PaymentActionState } from '@/lib/actions/payment';
import { Field, Input, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';
import { PaidEntryActions } from './paid-entry-actions';

const empty: PaymentActionState = {};

/**
 * Manual payment-proof submission (handover §24.1–§24.2). Shown for a registration awaiting payment
 * on a fee-bearing division. Handles first submission and resubmission after rejection.
 */
export function PaymentForm({
  registrationId,
  tournamentId,
  amountDue,
  perPlayer,
  teamSize = 1,
  earlyBird = false,
  currency,
  instructions,
  methods,
  paymentStatus,
  rejectionReason,
  paymentQrUrl,
  teamId,
  divisionId,
  partnerName,
}: {
  registrationId: string;
  tournamentId: string;
  amountDue: number;
  /** Per-player price behind the total, so the payer can check the arithmetic. */
  perPlayer?: number | null;
  teamSize?: number;
  earlyBird?: boolean;
  currency: string;
  instructions: string | null;
  methods: string | null;
  paymentStatus: string | null;
  rejectionReason: string | null;
  paymentQrUrl: string | null;
  /** Team context for the post-payment partner change (§2A). */
  teamId?: string;
  divisionId?: string;
  partnerName?: string | null;
}) {
  const router = useRouter();
  const action = submitPayment.bind(null, registrationId, tournamentId);
  const [state, formAction] = useActionState(action, empty);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (paymentStatus === 'submitted') {
    return (
      <PaidEntryActions
        registrationId={registrationId}
        tournamentId={tournamentId}
        teamId={teamId}
        divisionId={divisionId}
        partnerName={partnerName}
        canChangePartner={teamSize > 1 && Boolean(teamId && divisionId)}
      />
    );
  }
  if (paymentStatus === 'verified') return null;

  return (
    <div className="border-border mt-2 rounded-lg border border-dashed p-3">
      {/* State the arithmetic, not just a total. Somebody comparing this against the fee they were
          quoted should never have to work out where the difference came from (§1V). */}
      <p className="text-foreground text-base font-bold">
        Send {currency} {amountDue.toLocaleString()}
      </p>
      {perPlayer != null && teamSize > 1 && (
        <p className="text-foreground-muted mt-0.5 text-xs">
          {currency} {perPlayer.toLocaleString()} per player x {teamSize} players
          {earlyBird ? ' (early bird price)' : ''}
        </p>
      )}
      {instructions && (
        <p className="text-foreground-muted mt-1 text-xs whitespace-pre-wrap">{instructions}</p>
      )}
      {methods && <p className="text-foreground-muted mt-1 text-xs">Accepted: {methods}</p>}
      {paymentQrUrl && (
        <div className="mt-3">
          <p className="text-foreground-muted mb-1.5 text-xs">Scan to pay</p>
          {/* A signed Storage URL is required for this private organizer-uploaded QR. Rendered
              larger than before and never squashed: a QR squeezed into a small box is a QR that
              will not scan. `object-contain` keeps whatever aspect ratio the organizer uploaded. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={paymentQrUrl}
            alt="Payment QR code"
            className="h-56 w-56 rounded-xl bg-white object-contain p-3"
          />
          {/* Most people pay from the same phone they are reading this on, and you cannot scan a
             code with the device displaying it. Saving the original file lets them open it in a
             gallery and scan it from their banking app (§1Y). */}
          <a
            href={paymentQrUrl}
            download="vouchplay-payment-qr"
            target="_blank"
            rel="noopener noreferrer"
            className="border-border text-foreground mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-sm font-semibold"
          >
            <Download size={16} aria-hidden />
            Save QR to your phone
          </a>
        </div>
      )}
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
          hint="PNG, JPG, WebP, or PDF up to 5 MB. Your proof is kept private."
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
