'use client';

import { PaymentModalBody, type PaymentDetails } from '../payment-modal';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { quoteFor } from './shared';
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
  onSuccess,
}: {
  tournament: WizardTournament;
  /** The chosen division, or null for a bare-slot reservation. */
  division: DivisionDTO | null;
  state: ViewerRegistrationState;
  registrationId: string | null;
  payFor: WizardPayFor;
  onSuccess: () => void;
}) {
  const quote = division ? quoteFor(division, tournament.earlyBird) : null;
  const slotPrice = state.slotPrice;
  const reg = division ? state.registrationsByDivision[division.id] : undefined;

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
            amountDue: quote?.perPlayer ?? 0,
            currency: division?.currency ?? 'PHP',
            earlyBird: quote?.earlyBirdApplied ?? false,
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
            amountDue: quote?.teamTotal ?? 0,
            perPlayer: quote?.perPlayer ?? null,
            teamSize: division?.teamSize ?? 1,
            currency: division?.currency ?? 'PHP',
            earlyBird: quote?.earlyBirdApplied ?? false,
            instructions: tournament.paymentInstructions,
            methods: tournament.paymentMethods,
            paymentStatus: reg?.paymentStatus ?? null,
            rejectionReason: reg?.paymentRejectionReason ?? null,
            paymentQrUrl: state.paymentQrUrl,
          };

  return <PaymentModalBody details={details} onSuccess={onSuccess} />;
}
