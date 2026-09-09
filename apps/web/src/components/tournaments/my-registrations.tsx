import { CircleCheck, CircleDollarSign, Clock, ListChecks, TriangleAlert } from 'lucide-react';
import { quoteFee } from '@vouchplay/core';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { RegisterActions } from './register-actions';
import { PaymentForm } from './payment-form';

/**
 * Default-collapsed "My registrations (N)" manager shown immediately after the tournament details
 * (handover Phase 13.5). It is the single home for a player's own entries: one card per active entry
 * with division, team, status, payment, and the valid change actions. A player may hold entries in
 * several distinct divisions; each is independent. Status uses an icon plus text (never colour
 * alone) and the native details/summary keeps it keyboard and screen reader operable.
 */

const ACTIVE = new Set([
  'payment_pending',
  'payment_submitted',
  'under_review',
  'waitlisted',
  'confirmed',
]);

type Tone = 'action' | 'waiting' | 'done';

function toneFor(regStatus: string, paymentStatus: string | null, fee: number): Tone {
  if (paymentStatus === 'rejected') return 'action';
  if (regStatus === 'payment_pending') return fee > 0 ? 'action' : 'waiting';
  if (regStatus === 'payment_submitted' || regStatus === 'under_review') return 'waiting';
  if (regStatus === 'waitlisted') return 'waiting';
  return 'done';
}

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === 'action') return <CircleDollarSign size={15} className="text-warning" aria-hidden />;
  if (tone === 'waiting') return <Clock size={15} className="text-foreground-muted" aria-hidden />;
  return <CircleCheck size={15} className="text-success" aria-hidden />;
}

export function MyRegistrations({
  tournamentId,
  divisions,
  state,
  registrationOpen,
  playerChangesConfigured,
  paymentInstructions,
  paymentMethods,
  earlyBird = { startsAt: null, endsAt: null },
  enteredRegistrationId = null,
}: {
  tournamentId: string;
  divisions: DivisionDTO[];
  state: ViewerRegistrationState;
  registrationOpen: boolean;
  playerChangesConfigured: boolean;
  paymentInstructions: string | null;
  paymentMethods: string | null;
  /** Tournament-wide early-bird window (§1V). */
  earlyBird?: { startsAt: string | null; endsAt: string | null };
  /** A registration just created by this visit: open the panel straight onto it (§1Y). */
  enteredRegistrationId?: string | null;
}) {
  // One quote per division, so the price shown and the price charged come from the same function.
  const quoteFor = (d: DivisionDTO) =>
    quoteFee({
      feeAmount: d.feeAmount,
      earlyBirdFeeAmount: d.earlyBirdFeeAmount,
      earlyBirdStartsAt: earlyBird.startsAt,
      earlyBirdEndsAt: earlyBird.endsAt,
      teamSize: d.teamSize,
    });
  const byId = new Map(divisions.map((d) => [d.id, d]));
  const entries = Object.entries(state.registrationsByDivision)
    .filter(([, reg]) => ACTIVE.has(reg.status))
    .map(([divisionId, reg]) => ({ division: byId.get(divisionId), reg, divisionId }))
    .filter((e) => e.division);
  if (entries.length === 0) return null;

  const actionable = entries.filter(
    (e) => toneFor(e.reg.status, e.reg.paymentStatus, e.division!.feeAmount) === 'action',
  ).length;

  // "Enter and pay" promised two things and used to deliver one, dropping the player back on the
  // division list to hunt for the payment form. The action now returns the new registration id, the
  // caller puts it in the URL, and this panel opens on it. The anchor does the scrolling natively,
  // so the continuous flow needs no client JavaScript at all (§1Y).
  const isNew = Boolean(
    enteredRegistrationId && entries.some((e) => e.reg.id === enteredRegistrationId),
  );

  return (
    <details
      open={isNew}
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
        {entries.map(({ division, reg, divisionId }) => {
          const d = division!;
          const team = state.teamsByDivision[divisionId];
          const tone = toneFor(reg.status, reg.paymentStatus, d.feeAmount);
          return (
            <li key={divisionId} className="border-border bg-surface rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-foreground text-sm font-semibold">{d.name}</span>
                <span className="text-foreground-muted inline-flex items-center gap-1.5 text-xs capitalize">
                  <ToneIcon tone={tone} />
                  {reg.status.replace(/_/g, ' ')}
                </span>
              </div>
              {team && (
                <p className="text-foreground-muted mt-1 text-xs">
                  Team: {team.members.map((m) => m.name).join(' & ')}
                </p>
              )}
              {d.feeAmount > 0 &&
                (reg.status === 'payment_pending' || reg.status === 'payment_submitted') && (
                  <PaymentForm
                    registrationId={reg.id}
                    tournamentId={tournamentId}
                    amountDue={quoteFor(d).teamTotal}
                    perPlayer={quoteFor(d).perPlayer}
                    teamSize={d.teamSize}
                    earlyBird={quoteFor(d).earlyBirdApplied}
                    currency={d.currency}
                    instructions={paymentInstructions}
                    methods={paymentMethods}
                    paymentQrUrl={state.paymentQrUrl}
                    paymentStatus={reg.paymentStatus}
                    rejectionReason={reg.paymentRejectionReason}
                  />
                )}
              <div className="mt-2">
                <RegisterActions
                  tournamentId={tournamentId}
                  divisionId={divisionId}
                  teamId={team?.teamId}
                  format={d.format as 'singles' | 'doubles'}
                  teamSize={d.teamSize}
                  registrationOpen={registrationOpen}
                  playerChangesConfigured={playerChangesConfigured}
                  registration={{
                    id: reg.id,
                    status: reg.status,
                    paymentStatus: reg.paymentStatus,
                  }}
                  divisions={divisions.map((division) => ({
                    id: division.id,
                    name: division.name,
                    format: division.format,
                    teamSize: division.teamSize,
                    status: division.status,
                  }))}
                />
              </div>
              {/* The 'cancel, dissolve, re-invite' explanation that used to live here described a
                  flow that no longer exists: under pay-first a team always carries a registration,
                  so that path could never run (§1V). PartnerChangeActions and PaidEntryActions now
                  each state the one thing that is true for the state the player is actually in. */}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
