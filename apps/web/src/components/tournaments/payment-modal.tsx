'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, ShieldCheck } from 'lucide-react';
import {
  submitPayment,
  submitSeatPayment,
  submitSlotReservation,
  type PaymentActionState,
} from '@/lib/actions/payment';
import { Field, Input, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { RegistrationWizard } from './registration-wizard';
import type { WizardTournament } from './wizard/types';

const empty: PaymentActionState = {};

/** What is being paid for (master_plan §2AO A2/B) - the ONE thing that decides which server action a
 *  receipt posts to. `team` pays every seat at once; `seat` pays only the payer's own seat; `reservation`
 *  is a bare slot with no division chosen yet. */
export type PaymentMode = 'team' | 'seat' | 'reservation';

export interface PaymentDetails {
  mode: PaymentMode;
  /** Null only for `reservation` - a bare slot has no registration yet. */
  registrationId: string | null;
  tournamentId: string;
  /** Null for `reservation` - there is no division yet. */
  divisionName: string | null;
  amountDue: number;
  perPlayer?: number | null;
  teamSize?: number;
  earlyBird?: boolean;
  currency: string;
  instructions: string | null;
  methods: string | null;
  paymentStatus: string | null;
  rejectionReason: string | null;
  paymentQrUrl: string | null;
}

/**
 * The receipt form itself (master_plan §2AO B, Receipt step) - amount headline, QR + save, payment
 * instructions/methods, and the method/payer/reference/proof form. Generalised with `mode` so the
 * same body posts a team payment, a seat payment, or a bare-slot reservation: the wizard's Receipt
 * step is the only caller now, and it decides which of the three this is.
 */
export function PaymentModalBody({
  details,
  onSuccess,
}: {
  details: PaymentDetails;
  /** Fired once the receipt is recorded (after `router.refresh()`); the wizard moves to Done. */
  onSuccess: () => void;
}) {
  const {
    mode,
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
  } = details;
  const router = useRouter();
  const action =
    mode === 'team'
      ? submitPayment.bind(null, registrationId as string, tournamentId)
      : mode === 'seat'
        ? submitSeatPayment.bind(null, registrationId as string, tournamentId)
        : submitSlotReservation.bind(null, tournamentId);
  const [state, formAction] = useActionState(action, empty);

  // On a successful receipt submission, refresh so the rest of the page reflects the new state, then
  // let the wizard move on to Done.
  useEffect(() => {
    if (state.ok) {
      router.refresh();
      onSuccess();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, router]);

  return (
    <div className="space-y-3">
      <div className="border-primary/30 bg-primary/5 rounded-xl border p-3">
        <p className="text-foreground text-xl font-bold">
          Send {currency} {amountDue.toLocaleString()}
        </p>
        {mode === 'team' && perPlayer != null && teamSize > 1 && (
          <p className="text-foreground-muted mt-0.5 text-xs">
            {currency} {perPlayer.toLocaleString()} per player x {teamSize} players
            {earlyBird ? ' (early bird price)' : ''}
          </p>
        )}
        {mode === 'seat' && (
          <p className="text-foreground-muted mt-0.5 text-xs">
            Your seat{earlyBird ? ' (early bird price)' : ''}
          </p>
        )}
        {mode === 'reservation' && (
          <p className="text-foreground-muted mt-0.5 text-xs">
            Reserves your place in the tournament{earlyBird ? ' (early bird price)' : ''}
          </p>
        )}
      </div>

      {instructions && (
        <p className="text-foreground-muted text-xs whitespace-pre-wrap">{instructions}</p>
      )}
      {methods && <p className="text-foreground-muted text-xs">Accepted: {methods}</p>}

      {paymentQrUrl && (
        <div>
          <p className="text-foreground-muted mb-1.5 text-xs">Scan to pay</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={paymentQrUrl}
            alt="Payment QR code"
            className="mx-auto h-56 w-56 rounded-xl bg-white object-contain p-3"
          />
          {/* Most people pay from the same phone they are reading this on and cannot scan a code on
              the same screen; saving it lets them open it in their banking app (§1Y). */}
          <a
            href={paymentQrUrl}
            download="vouchplay-payment-qr"
            target="_blank"
            rel="noopener noreferrer"
            className="border-border text-foreground mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold"
          >
            <Download size={16} aria-hidden />
            Save QR to your phone
          </a>
        </div>
      )}

      {paymentStatus === 'rejected' && rejectionReason && (
        <p className="text-danger text-xs">
          Previous proof rejected: {rejectionReason}. Please resubmit.
        </p>
      )}

      <form action={formAction} className="space-y-2">
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

/**
 * "Pay now to secure your slot" - the single control an unpaid entry shows in My registrations. It
 * opens the registration wizard at the Pay step for this registration (master_plan §2AO B) instead of
 * its own modal, so seat-vs-team and the receipt form live in the one place every entry point shares.
 * `autoOpen` is set for the entry the player just created, so payment appears the instant the page
 * settles - no vanished form, no five-second gap (§2K).
 */
export function PayNowCell({
  tournament,
  state,
  registrationId,
  autoOpen = false,
}: {
  tournament: WizardTournament;
  state: ViewerRegistrationState;
  registrationId: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="vp-gradient vp-glow inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white"
      >
        <ShieldCheck size={16} aria-hidden />
        Pay now to secure your slot
      </button>
      {open && (
        <RegistrationWizard
          tournament={tournament}
          state={state}
          initial={{ step: 'pay', registrationId }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
