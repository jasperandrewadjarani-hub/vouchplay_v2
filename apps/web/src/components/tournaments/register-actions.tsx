'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { registerSolo, registerTeam, withdrawRegistration } from '@/lib/actions/registration';

const btn =
  'inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50';

/** Register / withdraw buttons for one division (handover §21, §23). */
export function RegisterActions({
  tournamentId,
  divisionId,
  teamId,
  format,
  registration,
  registrationOpen,
}: {
  tournamentId: string;
  divisionId: string;
  teamId?: string;
  format: 'singles' | 'doubles';
  registration?: { id: string; status: string; paymentStatus?: string | null } | null;
  registrationOpen: boolean;
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
    return (
      <div className="flex flex-col gap-2">
        {/* The status is already the chip at the top of the card (§2G), so it is not repeated here
            (§2L). This block is only the actions that apply to the current state. */}
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
            {pending ? 'Cancelling…' : 'Cancel registration'}
          </button>
        )}
        {/* Once a receipt exists, PaidEntryActions owns this state and offers Request to cancel.
           Two different explanations of the same situation is one too many (§1Y). */}
        {needsOrganiserToCancel && !paymentStarted && (
          <p className="text-foreground-muted max-w-sm text-xs">
            This entry can no longer be cancelled here. Contact the organizer for help.
          </p>
        )}
        {!canWithdraw && !needsOrganiserToCancel && (
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
