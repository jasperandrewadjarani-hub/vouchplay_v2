import { CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMonthDay } from '@/lib/format-date';
import type { WizardPayFor } from './types';

export interface DoneOutcome {
  /** Null when nothing was created at all (a bare-slot reservation deferred with "I'll pay later"). */
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

/** Step 5: what was created, and what is still outstanding (master_plan §2AO B). */
export function DoneStep({
  outcome,
  onViewRegistrations,
  onClose,
}: {
  outcome: DoneOutcome;
  onViewRegistrations: () => void;
  onClose: () => void;
}) {
  const nothingCreated = !outcome.registrationId && !outcome.paidNow;

  if (nothingCreated) {
    return (
      <div className="space-y-4 text-center">
        <CircleCheck size={40} className="text-foreground-muted mx-auto" aria-hidden />
        <p className="text-foreground text-base font-semibold">No problem</p>
        <p className="text-foreground-muted text-sm">
          Nothing was reserved. Come back any time from this tournament&rsquo;s page to reserve your
          slot.
        </p>
        <Button type="button" onClick={onClose} className="w-full">
          Close
        </Button>
      </div>
    );
  }

  const headline = outcome.isReservation
    ? 'Slot reserved - receipt sent'
    : outcome.paidNow
      ? 'Receipt sent'
      : "You're entered - pay when you're ready";

  const bullets: string[] = [];
  if (outcome.paidNow) bullets.push('The organizer will verify your payment.');
  if (outcome.partnerNamed) bullets.push('Your partner needs to confirm the team.');
  if (outcome.payFor === 'seat') bullets.push('Your partner needs to pay their seat.');
  if (outcome.isReservation) {
    bullets.push(
      outcome.registrationCloseAt
        ? `Choose your division before ${formatMonthDay(outcome.registrationCloseAt)}.`
        : 'Choose your division any time before registration closes.',
    );
  }
  if (outcome.partnerChosenLater) bullets.push('Choose your partner before the lock-in date.');
  if (bullets.length === 0) bullets.push('The organizer will confirm your entry.');

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
      <Button type="button" onClick={onViewRegistrations} className="w-full">
        View my registrations
      </Button>
    </div>
  );
}
