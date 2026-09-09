'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  moveRegistrationDivision,
  registerSolo,
  registerTeam,
  withdrawRegistration,
} from '@/lib/actions/registration';

const btn =
  'inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50';

/** Register / withdraw buttons for one division (handover §21, §23). */
export function RegisterActions({
  tournamentId,
  divisionId,
  teamId,
  format,
  teamSize,
  registration,
  divisions = [],
  registrationOpen,
  playerChangesConfigured,
}: {
  tournamentId: string;
  divisionId: string;
  teamId?: string;
  format: 'singles' | 'doubles';
  teamSize: number;
  registration?: { id: string; status: string; paymentStatus?: string | null } | null;
  divisions?: Array<{ id: string; name: string; format: string; teamSize: number; status: string }>;
  registrationOpen: boolean;
  playerChangesConfigured: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      setMsg(res.error ?? res.message ?? null);
      if (res.ok) router.refresh();
    });
  }

  if (registration) {
    // A player may cancel their own entry only while no money is involved. The server enforces the
    // same rule (player_cancel_registration raises payment_already_started once a payments row
    // exists), so showing the button after that would guarantee a dead end. Once a receipt is in,
    // the honest answer is the organizer - and we say so instead of hiding the option silently.
    const paymentStarted = Boolean(registration.paymentStatus);
    const cancellableStatus = ['payment_pending', 'waitlisted'].includes(registration.status);
    const canWithdraw = registrationOpen && cancellableStatus && !paymentStarted;
    const needsOrganiserToCancel =
      registrationOpen &&
      !canWithdraw &&
      !['withdrawn', 'cancelled', 'rejected'].includes(registration.status);
    const moveOptions = divisions.filter(
      (division) =>
        division.id !== divisionId &&
        division.status === 'open' &&
        division.format === format &&
        division.teamSize === teamSize,
    );
    const canMove =
      playerChangesConfigured &&
      registrationOpen &&
      registration.status === 'payment_pending' &&
      moveOptions.length > 0;
    return (
      <div className="flex flex-col gap-2">
        <span className="text-foreground-muted text-xs">
          Your status:{' '}
          <span className="text-foreground font-medium">
            {registration.status.replace(/_/g, ' ')}
          </span>
        </span>
        {canWithdraw && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm('Cancel this registration? This can release your slot.'))
                run(() => withdrawRegistration(registration.id, tournamentId));
            }}
            className={`${btn} text-danger border-border w-fit border`}
          >
            Cancel registration
          </button>
        )}
        {needsOrganiserToCancel && (
          <p className="text-foreground-muted max-w-sm text-xs">
            {paymentStarted
              ? 'You have already paid, so cancelling has to go through the organizer. Message them and they can refund you and release your slot.'
              : 'This entry can no longer be cancelled here. Contact the organizer for help.'}
          </p>
        )}
        {canMove && (
          <label className="text-foreground-muted flex max-w-sm flex-col gap-1 text-xs">
            Change division
            <select
              defaultValue=""
              disabled={pending}
              onChange={(event) => {
                const targetDivisionId = event.target.value;
                if (!targetDivisionId) return;
                if (
                  confirm('Move your complete team? The current payment deadline stays the same.')
                ) {
                  run(() =>
                    moveRegistrationDivision(registration.id, targetDivisionId, tournamentId),
                  );
                }
                event.currentTarget.value = '';
              }}
              className="border-border bg-surface text-foreground rounded-lg border px-2.5 py-1.5 text-sm"
            >
              <option value="">Choose another division</option>
              {moveOptions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!canWithdraw && !canMove && (
          <p className="text-foreground-muted text-xs">
            This entry can no longer be changed here. Contact the organizer for help.
          </p>
        )}
        {msg && <span className="text-foreground-muted text-xs">{msg}</span>}
      </div>
    );
  }

  if (format === 'singles') {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={pending || !registrationOpen}
          onClick={() => run(() => registerSolo(tournamentId, divisionId))}
          className={`${btn} vp-gradient w-fit text-white`}
        >
          {pending ? 'Registering…' : registrationOpen ? 'Register' : 'Registration closed'}
        </button>
        {msg && <span className="text-foreground-muted text-xs">{msg}</span>}
      </div>
    );
  }

  // Doubles: register once a team is formed.
  if (teamId) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={pending || !registrationOpen}
          onClick={() => run(() => registerTeam(teamId, tournamentId))}
          className={`${btn} vp-gradient w-fit text-white`}
        >
          {pending ? 'Registering…' : registrationOpen ? 'Register team' : 'Registration closed'}
        </button>
        {msg && <span className="text-foreground-muted text-xs">{msg}</span>}
      </div>
    );
  }

  return (
    <span className="text-foreground-muted text-xs">Form a team with a partner to register.</span>
  );
}
