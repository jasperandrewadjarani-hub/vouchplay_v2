'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Clock, ShieldCheck } from 'lucide-react';
import { submitPayment, type PaymentActionState } from '@/lib/actions/payment';
import { Field, Input, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

const empty: PaymentActionState = {};

export interface PaymentDetails {
  registrationId: string;
  tournamentId: string;
  divisionName: string;
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
  slotHoldMinutes?: number;
}

/**
 * Payment as a centered modal (master_plan §2K).
 *
 * Payment is the LAST step of registering, so it gets its own focused surface instead of being poured
 * inline into the My-registrations list. The modal portals to document.body (shared Modal, §1X), so
 * it floats center-screen over whatever opened it - the division browser after "Enter and pay", or a
 * "Pay now" button in My registrations - and the page behind it never looks like it failed or reset.
 */
function PaymentModalBody({ details, onClose }: { details: PaymentDetails; onClose: () => void }) {
  const {
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
    slotHoldMinutes = 30,
  } = details;
  const router = useRouter();
  const [payingLater, setPayingLater] = useState(false);
  const action = submitPayment.bind(null, registrationId, tournamentId);
  const [state, formAction] = useActionState(action, empty);

  // On a successful receipt submission the entry flips to "under review": close and refresh so the
  // list shows the new state instead of the payment form.
  useEffect(() => {
    if (state.ok) {
      router.refresh();
      onClose();
    }
  }, [state.ok, router, onClose]);

  return (
    <div className="space-y-3">
      <div className="border-primary/30 bg-primary/5 rounded-xl border p-3">
        <p className="text-foreground text-xl font-bold">
          Send {currency} {amountDue.toLocaleString()}
        </p>
        {perPlayer != null && teamSize > 1 && (
          <p className="text-foreground-muted mt-0.5 text-xs">
            {currency} {perPlayer.toLocaleString()} per player x {teamSize} players
            {earlyBird ? ' (early bird price)' : ''}
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

      {/* Leaving without paying is allowed, but it is a real decision with a consequence, so it is a
          deliberate two-step rather than a silent close (§2J). */}
      <div className="border-border border-t pt-3">
        {payingLater ? (
          <div className="border-warning/40 bg-warning/10 rounded-lg border p-2.5">
            <p className="text-foreground flex items-start gap-1.5 text-sm font-semibold">
              <Clock size={14} className="text-warning mt-0.5 shrink-0" aria-hidden />
              Your slot is not confirmed until you pay
            </p>
            <p className="text-foreground-muted mt-1 text-xs leading-relaxed">
              This entry holds your place for about {slotHoldMinutes} minutes. After that the slot
              can go to someone else, and it is only locked in once you pay and the organizer
              verifies it. You can come back and pay any time from My registrations.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPayingLater(false)}
                className="vp-gradient inline-flex min-h-[44px] items-center rounded-xl px-4 text-sm font-semibold text-white"
              >
                Keep paying
              </button>
              <button
                type="button"
                onClick={onClose}
                className="border-border text-foreground-muted hover:text-foreground inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-medium"
              >
                Yes, I&rsquo;ll pay later
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPayingLater(true)}
            className="border-border text-foreground-muted hover:text-foreground hover:bg-surface-muted inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border text-sm font-medium transition-colors"
          >
            I&rsquo;ll pay later
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * "Pay now to secure your slot" - the single control a pending entry shows in My registrations, and
 * the thing "Enter and pay" flows into. It owns the modal's open state so the list stays a list.
 * `autoOpen` is set for the entry the player just created, so payment appears the instant the page
 * settles after "Proceeding to payment…" - no vanished form, no five-second gap (§2K).
 */
export function PayNowCell({
  details,
  autoOpen = false,
}: {
  details: PaymentDetails;
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
        <Modal
          title="Pay to secure your slot"
          subtitle={details.divisionName}
          align="center"
          onClose={() => setOpen(false)}
        >
          <PaymentModalBody details={details} onClose={() => setOpen(false)} />
        </Modal>
      )}
    </div>
  );
}
