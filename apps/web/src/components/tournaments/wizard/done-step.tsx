import Link from 'next/link';
import { CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMonthDay } from '@/lib/format-date';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { ClubRepSelector } from '../club-rep-selector';
import type { WizardPayFor, WizardTournament } from './types';

export interface DoneOutcome {
  /** Null when nothing was created at all - kept nullable because a bare-slot reservation paid this
   *  visit still has no registration id, not because "I'll pay later" can land here any more (that
   *  now closes the wizard outright - master_plan §2AT Decision F). */
  registrationId: string | null;
  payFor: WizardPayFor | null;
  /** A receipt (team, seat or reservation) was actually submitted this visit. */
  paidNow: boolean;
  /** A partner was named and is pending their own confirmation. */
  partnerNamed: boolean;
  /** The doubles entry has an open seat because a partner was deliberately deferred. */
  partnerChosenLater: boolean;
  isReservation: boolean;
  registrationCloseAt: string | null;
}

/**
 * Step 5: what was created, what is still outstanding, and - now that paying is done - a chance to
 * pick a club to represent (master_plan §2AO B, §2AT Decision G). Every path that reaches Done has
 * created or paid something ("I'll pay later" closes the wizard directly instead), so there is
 * always a real outcome to report here.
 */
export function DoneStep({
  outcome,
  tournament,
  state,
  onViewRegistrations,
}: {
  outcome: DoneOutcome;
  tournament: WizardTournament;
  state: ViewerRegistrationState;
  onViewRegistrations: () => void;
  onClose: () => void;
}) {
  const headline = outcome.isReservation
    ? 'Slot reserved - receipt sent'
    : outcome.paidNow
      ? 'Receipt sent'
      : "You're entered - pay when you're ready";

  const bullets: string[] = [];
  if (outcome.paidNow) bullets.push('The organizer will verify your payment.');
  if (outcome.partnerNamed) bullets.push('Your partner needs to confirm the team.');
  if (outcome.payFor === 'seat') bullets.push('Your partner needs to pay their slot.');
  if (outcome.isReservation) {
    bullets.push(
      outcome.registrationCloseAt
        ? `Choose your division before ${formatMonthDay(outcome.registrationCloseAt)}.`
        : 'Choose your division any time before registration closes.',
    );
  }
  if (outcome.partnerChosenLater) bullets.push('Choose your partner before the lock-in date.');
  if (bullets.length === 0) bullets.push('The organizer will confirm your entry.');

  // "Represent a club" (master_plan §2AT Decision G) - a real card only once there is a club to pick
  // from; otherwise a single line pointing at the one thing that would unlock it. Either way this is
  // wholly optional - "Decide later" (i.e. just tapping the button below without touching this card)
  // is always fine.
  const hasEligibleClubs = state.eligibleClubs.length > 0;
  const hasClubSelected = state.clubReps.length > 0;

  return (
    <div className="space-y-4 text-center">
      <CircleCheck size={40} className="text-success mx-auto" aria-hidden />
      <p className="text-foreground text-lg font-semibold">{headline}</p>
      <ul className="text-foreground-muted mx-auto max-w-sm space-y-1.5 text-left text-sm">
        {bullets.slice(0, 4).map((b, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span aria-hidden className="mt-0.5">
              •
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className="border-border bg-surface-muted rounded-xl border p-3 text-left">
        <p className="text-foreground-muted mb-2 text-xs">
          Playing for a club? Pick it here - you can change this later.
        </p>
        {hasEligibleClubs ? (
          <ClubRepSelector
            tournamentId={tournament.id}
            eligibleClubs={state.eligibleClubs}
            selected={state.clubReps.map((r) => r.clubId)}
            max={tournament.maxClubsPerPlayer}
          />
        ) : (
          <p className="text-foreground-muted text-sm">
            <Link href="/clubs" className="text-primary font-medium hover:underline">
              Join a club
            </Link>{' '}
            to represent it here.
          </p>
        )}
      </div>

      <Button type="button" onClick={onViewRegistrations} className="w-full">
        {hasClubSelected ? 'View my registrations' : 'Decide later · View my registrations'}
      </Button>
    </div>
  );
}
