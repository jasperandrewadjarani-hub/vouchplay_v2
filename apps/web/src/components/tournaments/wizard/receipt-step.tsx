'use client';

import { PaymentModalBody, type PaymentDetails } from '../payment-modal';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { quoteFor, viewerHasOtherPaidEntry } from './shared';
import { useEntryQuote } from './use-entry-quote';
import type { WizardPayFor, WizardTournament } from './types';

/**
 * Step 4: the receipt form (master_plan §2AO B). A thin adapter that builds the right
 * `PaymentDetails` for the chosen `payFor` and hands off to the shared `PaymentModalBody` - the same
 * amount headline, QR, instructions and form used everywhere money changes hands, generalised with a
 * `mode` so it can post a team payment, a seat payment, or a bare-slot reservation.
 */
export function ReceiptStep({
  tournament,
  division,
  state,
  registrationId,
  payFor,
  onChangePayFor,
  onSuccess,
}: {
  tournament: WizardTournament;
  /** The chosen division, or null for a bare-slot reservation. */
  division: DivisionDTO | null;
  state: ViewerRegistrationState;
  registrationId: string | null;
  payFor: WizardPayFor;
  /** "Paying for: My slot / Whole team" (master_plan §2AS A2/Decision A) - changes the amount and the
   *  action bound in `PaymentModalBody` without a trip back through Pay. */
  onChangePayFor: (payFor: WizardPayFor) => void;
  onSuccess: () => void;
}) {
  // §2BQ: a division with a next-entry price is priced by the server, seat by seat, once the entry
  // exists - the same quote the payment action charges. Every other division prices locally as before.
  const entryQuote = useEntryQuote(division, { registrationId });
  const localNext =
    !registrationId && viewerHasOtherPaidEntry(state, tournament.divisions, division?.id ?? null);
  const quote = division ? quoteFor(division, tournament.earlyBird, undefined, localNext) : null;
  const serverQuote = entryQuote.quote;
  const mySeat = serverQuote?.seats.find((s) => s.isViewer) ?? null;
  const slotPrice = state.slotPrice;
  const reg = division ? state.registrationsByDivision[division.id] : undefined;
  // The switch only makes sense once there is a choice to make: a doubles entry with a registration
  // already created (never a bare-slot reservation, which has no "whole team" to speak of).
  const showPayForSwitch = Boolean(
    division && division.teamSize > 1 && registrationId && payFor !== 'reservation',
  );

  const details: PaymentDetails =
    payFor === 'reservation'
      ? {
          mode: 'reservation',
          registrationId: null,
          tournamentId: tournament.id,
          divisionName: null,
          amountDue: state.bareSlot?.amountDue ?? slotPrice?.perPlayer ?? 0,
          currency: state.bareSlot?.currency ?? 'PHP',
          earlyBird: slotPrice?.earlyBirdApplied ?? false,
          instructions: tournament.paymentInstructions,
          methods: tournament.paymentMethods,
          paymentStatus: state.bareSlot?.status ?? null,
          rejectionReason: state.bareSlot?.rejectionReason ?? null,
          paymentQrUrl: state.paymentQrUrl,
        }
      : payFor === 'seat'
        ? {
            mode: 'seat',
            registrationId,
            tournamentId: tournament.id,
            divisionName: division?.name ?? null,
            amountDue: mySeat?.perPlayer ?? quote?.perPlayer ?? 0,
            currency: division?.currency ?? 'PHP',
            earlyBird: mySeat ? mySeat.basis === 'early_bird' : (quote?.earlyBirdApplied ?? false),
            nextEntry: mySeat ? mySeat.basis === 'next_entry' : (quote?.nextEntryApplied ?? false),
            standardPerPlayer: mySeat?.standardPerPlayer ?? quote?.standardPerPlayer,
            instructions: tournament.paymentInstructions,
            methods: tournament.paymentMethods,
            paymentStatus: reg?.paymentStatus ?? null,
            rejectionReason: reg?.paymentRejectionReason ?? null,
            paymentQrUrl: state.paymentQrUrl,
          }
        : {
            mode: 'team',
            registrationId,
            tournamentId: tournament.id,
            divisionName: division?.name ?? null,
            amountDue: serverQuote?.total ?? quote?.teamTotal ?? 0,
            perPlayer: quote?.perPlayer ?? null,
            seatLines: serverQuote?.seats,
            saved: serverQuote?.saved,
            teamSize: division?.teamSize ?? 1,
            currency: division?.currency ?? 'PHP',
            earlyBird: quote?.earlyBirdApplied ?? false,
            instructions: tournament.paymentInstructions,
            methods: tournament.paymentMethods,
            paymentStatus: reg?.paymentStatus ?? null,
            rejectionReason: reg?.paymentRejectionReason ?? null,
            paymentQrUrl: state.paymentQrUrl,
          };

  return (
    <div className="space-y-3">
      {showPayForSwitch && (
        <div
          role="group"
          aria-label="Paying for"
          className="border-border bg-surface-muted flex items-center gap-1 rounded-xl border p-1 text-xs font-semibold"
        >
          <span className="text-foreground-muted pl-1.5">Paying for</span>
          <button
            type="button"
            aria-pressed={payFor === 'seat'}
            onClick={() => onChangePayFor('seat')}
            className={`min-h-9 flex-1 rounded-lg px-2.5 py-1.5 transition-colors ${
              payFor === 'seat'
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            }`}
          >
            My slot
          </button>
          <button
            type="button"
            aria-pressed={payFor === 'team'}
            onClick={() => onChangePayFor('team')}
            className={`min-h-9 flex-1 rounded-lg px-2.5 py-1.5 transition-colors ${
              payFor === 'team'
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            }`}
          >
            Whole team
          </button>
        </div>
      )}
      {entryQuote.applies && entryQuote.loading ? (
        <p role="status" className="text-foreground-muted py-6 text-center text-sm">
          Working out your price…
        </p>
      ) : (
        <PaymentModalBody details={details} onSuccess={onSuccess} />
      )}
    </div>
  );
}
