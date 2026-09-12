'use client';

import { useState } from 'react';
import {
  CircleCheck,
  CircleDollarSign,
  Clock,
  ListChecks,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { formatFee } from '@vouchplay/core';
import type { SeatState } from '@vouchplay/core';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { describeRegistrationStatus, type SlotTone } from '@/lib/tournaments/registration-status';
import { RegisterActions } from './register-actions';
import { PayNowCell } from './payment-modal';
import { PaidEntryActions } from './paid-entry-actions';
import { PartnerChangeActions } from './partner-change-actions';
import { Button } from '@/components/ui/button';
import { RegistrationWizard, type WizardTournament } from './registration-wizard';
import type { WizardInitial } from './wizard/types';

/**
 * Default-collapsed "My registrations (N)" manager shown immediately after the tournament details
 * (handover Phase 13.5; master_plan §2AO A7). It is the single home for a player's own entries: one
 * card per active entry with division, team, status, per-seat payment, and the valid change actions.
 * A player may hold entries in several distinct divisions; each is independent. A "Reserved slot"
 * card sits above them for a bare (no-division-yet) slot reservation. Status uses an icon plus text
 * (never colour alone) and the native details/summary keeps it keyboard and screen reader operable.
 */

const ACTIVE = new Set([
  'payment_pending',
  'payment_submitted',
  'under_review',
  'waitlisted',
  'confirmed',
]);

function ToneIcon({ tone }: { tone: SlotTone }) {
  if (tone === 'action') return <CircleDollarSign size={15} className="text-warning" aria-hidden />;
  if (tone === 'waiting') return <Clock size={15} className="text-foreground-muted" aria-hidden />;
  return <CircleCheck size={15} className="text-success" aria-hidden />;
}

/** "You: paid" / "Maria: not yet paid" / "Open seat" / "Maria: receipt sent" / "Top-up needed"
 *  (master_plan §2AO A7). */
function seatLineText(seatState: SeatState, who: string): string {
  switch (seatState) {
    case 'empty':
      return 'Open seat';
    case 'paid':
      return `${who}: paid`;
    case 'submitted':
      return `${who}: receipt sent`;
    case 'declined':
      return `${who}: payment declined`;
    case 'topup':
      return `${who}: top-up needed`;
    case 'unpaid':
    default:
      return `${who}: not yet paid`;
  }
}

export function MyRegistrations({
  tournament,
  state,
  enteredRegistrationId = null,
}: {
  tournament: WizardTournament;
  state: ViewerRegistrationState;
  /** A registration just created by this visit: open the panel straight onto it (§1Y). */
  enteredRegistrationId?: string | null;
}) {
  const { divisions, registrationOpen } = tournament;
  const byId = new Map(divisions.map((d) => [d.id, d]));
  const [wizardInitial, setWizardInitial] = useState<WizardInitial | null>(null);

  const entries = Object.entries(state.registrationsByDivision)
    .filter(([, reg]) => ACTIVE.has(reg.status))
    .map(([divisionId, reg]) => {
      const division = byId.get(divisionId);
      const team = state.teamsByDivision[divisionId];
      const partnerName = team?.members.find((m) => m.id !== state.viewerId)?.name ?? null;
      const status = division
        ? describeRegistrationStatus({
            regStatus: reg.status,
            paymentStatus: reg.paymentStatus,
            fee: division.feeAmount,
            partnerUnconfirmed: Boolean(team?.pendingPartner),
            seatOpen: Boolean(team?.seatOpen),
            partnerLockAt: state.partnerLockAt,
            partnerLockPassed: state.partnerLockPassed,
            paymentSummary: reg.paymentSummary,
            mySeat: reg.mySeat,
            partnerName,
          })
        : null;
      return { division, reg, divisionId, status, team, partnerName };
    })
    .filter((e) => e.division && e.status);

  const bareSlot = state.bareSlot ?? null;
  if (entries.length === 0 && !bareSlot) return null;

  const actionable = entries.filter((e) => e.status!.needsPayment).length;
  const isNew = Boolean(
    enteredRegistrationId && entries.some((e) => e.reg.id === enteredRegistrationId),
  );

  return (
    <>
      <details
        open={isNew || Boolean(bareSlot)}
        id="my-registrations"
        className="border-primary/30 bg-primary/5 scroll-mt-24 rounded-2xl border"
      >
        <summary className="text-foreground flex cursor-pointer list-none items-center gap-2 p-4 text-base font-semibold">
          <ListChecks size={18} className="text-primary" aria-hidden />
          My registrations ({entries.length})
          {actionable > 0 && (
            <span className="text-warning ml-1 inline-flex items-center gap-1 text-xs font-medium">
              <TriangleAlert size={13} aria-hidden />
              {actionable} to pay
            </span>
          )}
          <span className="text-foreground-muted ml-auto text-xs font-normal">Show</span>
        </summary>
        <ul className="space-y-3 px-4 pb-4">
          {bareSlot && (
            <li className="border-primary/40 bg-surface rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-foreground flex items-center gap-1.5 text-sm font-semibold">
                  <ShieldAlert size={15} className="text-primary" aria-hidden />
                  Reserved slot
                </span>
                <span
                  className={`text-xs font-medium ${
                    bareSlot.status === 'verified'
                      ? 'text-success'
                      : bareSlot.status === 'rejected'
                        ? 'text-danger'
                        : 'text-foreground-muted'
                  }`}
                >
                  {bareSlot.status === 'verified'
                    ? 'Verified'
                    : bareSlot.status === 'rejected'
                      ? `Declined${bareSlot.rejectionReason ? `: ${bareSlot.rejectionReason}` : ''}`
                      : 'Receipt sent'}
                </span>
              </div>
              <p className="text-foreground-muted mt-1 text-xs">
                {formatFee(bareSlot.currency, bareSlot.amountDue)} - holds a place in the
                tournament, not in a division.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" onClick={() => setWizardInitial({ step: 'division' })}>
                  Choose your division
                </Button>
                {bareSlot.status === 'rejected' && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setWizardInitial({ step: 'receipt', payFor: 'reservation' })}
                  >
                    Send a new receipt
                  </Button>
                )}
              </div>
            </li>
          )}
          {entries.map(({ division, reg, divisionId, status, team, partnerName }) => {
            const d = division!;
            const s = status!;
            const feeOwed = d.feeAmount > 0;
            const legacyNeedsPayment = !reg.paymentSummary && reg.paymentStatus !== 'submitted';
            const seatNeedsPayment = Boolean(
              reg.mySeat && (['unpaid', 'declined', 'topup'] as SeatState[]).includes(reg.mySeat),
            );
            const showPayNow =
              feeOwed &&
              reg.status !== 'confirmed' &&
              (reg.paymentSummary ? seatNeedsPayment : legacyNeedsPayment);
            const hasReceiptInReview =
              reg.paymentStatus === 'submitted' || Boolean(reg.paymentSummary?.anyReceipt);
            return (
              <li key={divisionId} className="border-border bg-surface rounded-xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-foreground text-sm font-semibold">{d.name}</span>
                  <span className="text-foreground-muted inline-flex items-center gap-1.5 text-xs">
                    <ToneIcon tone={s.tone} />
                    {s.shortLabel}
                  </span>
                </div>
                {team && (
                  <p className="text-foreground-muted mt-1 text-xs">
                    Team: {team.members.map((m) => m.name).join(' & ')}
                  </p>
                )}

                {/* One seat line per member, from the same summarizeEntryPayment the organizer and
                    the status chip read (master_plan §2AO A2/A7) - only once a caller supplies it. */}
                {feeOwed && reg.paymentSummary && reg.paymentSummary.totalSeats > 1 && (
                  <ul className="text-foreground-muted mt-1.5 space-y-0.5 text-xs">
                    {reg.paymentSummary.seats.map((seat, i) => {
                      const isMe = seat.playerId === state.viewerId;
                      const memberName = team?.members.find((m) => m.id === seat.playerId)?.name;
                      const who = isMe ? 'You' : (memberName ?? partnerName ?? 'Partner');
                      return <li key={i}>{seatLineText(seat.state, who)}</li>;
                    })}
                  </ul>
                )}

                {/* The unmissable truth: a provisional entry is NOT secured, and here is exactly what
                    is still outstanding. Amber when the applicant can act now (pay), muted when they
                    are waiting on the organizer or a partner (§2G). */}
                {!s.secured && (
                  <div
                    role="note"
                    className={`mt-2 rounded-lg border p-2.5 text-xs ${
                      s.tone === 'action'
                        ? 'border-warning/40 bg-warning/10'
                        : 'border-border bg-surface-muted'
                    }`}
                  >
                    <p
                      className={`flex items-center gap-1.5 font-semibold ${
                        s.tone === 'action' ? 'text-warning' : 'text-foreground'
                      }`}
                    >
                      <TriangleAlert size={13} aria-hidden />
                      {s.title}
                    </p>
                    {s.steps.length > 0 && (
                      <ul className="text-foreground-muted mt-1.5 space-y-1">
                        {s.steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span aria-hidden className="mt-0.5">
                              •
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Payment is the last step, so it opens the wizard's Pay step rather than being
                    poured into the list (§2K, §2AO B). A receipt already in review keeps its inline
                    management (partner change, request to cancel); an entry whose own seat still
                    needs money shows one clear "Pay now" control. */}
                {showPayNow ? (
                  <PayNowCell
                    tournament={tournament}
                    state={state}
                    registrationId={reg.id}
                    autoOpen={reg.id === enteredRegistrationId}
                  />
                ) : (
                  feeOwed &&
                  hasReceiptInReview && (
                    <div className="mt-2">
                      <PaidEntryActions
                        registrationId={reg.id}
                        tournamentId={tournament.id}
                        teamId={team?.teamId}
                        divisionId={divisionId}
                        partnerName={partnerName}
                        canChangePartner={d.teamSize > 1 && Boolean(team?.teamId && divisionId)}
                      />
                    </div>
                  )
                )}
                {/* Once a receipt is in, PaidEntryActions above is the sole manager of the entry, so
                    RegisterActions is not also rendered - it only repeated the status and a dead-end
                    sentence there (§2L). It still owns cancel / change-division for unpaid entries. */}
                {!hasReceiptInReview && (
                  <div className="mt-2">
                    <RegisterActions
                      tournamentId={tournament.id}
                      divisionId={divisionId}
                      teamId={team?.teamId}
                      format={d.format as 'singles' | 'doubles'}
                      registrationOpen={registrationOpen}
                      registration={{
                        id: reg.id,
                        status: reg.status,
                        paymentStatus: reg.paymentStatus,
                      }}
                    />
                  </div>
                )}
                {/* One compact Partner block per doubles entry (§2AM): open seat, pending invite,
                    confirmed partner (change/leave), an outgoing or incoming release request, or the
                    lock notice - exactly one at a time, and team is always set for a doubles division
                    (a paid entry always has at least one confirmed member). */}
                {d.format === 'doubles' && team && (
                  <PartnerChangeActions
                    teamId={team.teamId}
                    tournamentId={tournament.id}
                    divisionId={divisionId}
                    viewerId={state.viewerId}
                    pendingPartnerName={team.pendingPartner?.name ?? null}
                    pendingInvitationId={team.pendingInvitationId}
                    confirmedPartner={team.confirmedPartner}
                    seatOpen={team.seatOpen}
                    releaseRequest={team.releaseRequest}
                    partnerLockAt={state.partnerLockAt}
                    partnerChangesOpen={state.partnerChangesOpen}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </details>

      {wizardInitial && (
        <RegistrationWizard
          tournament={tournament}
          state={state}
          initial={wizardInitial}
          onClose={() => setWizardInitial(null)}
        />
      )}
    </>
  );
}
