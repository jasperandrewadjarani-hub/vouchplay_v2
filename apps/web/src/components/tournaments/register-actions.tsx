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
}: {
  tournamentId: string;
  divisionId: string;
  teamId?: string;
  format: 'singles' | 'doubles';
  registration?: { id: string; status: string } | null;
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
    const canWithdraw = !['withdrawn', 'cancelled', 'rejected'].includes(registration.status);
    return (
      <div className="flex flex-col gap-1">
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
              if (confirm('Withdraw this registration?'))
                run(() => withdrawRegistration(registration.id, tournamentId));
            }}
            className={`${btn} text-danger border-border w-fit border`}
          >
            Withdraw
          </button>
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
          disabled={pending}
          onClick={() => run(() => registerSolo(tournamentId, divisionId))}
          className={`${btn} vp-gradient w-fit text-white`}
        >
          {pending ? 'Registering…' : 'Register'}
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
          disabled={pending}
          onClick={() => run(() => registerTeam(teamId, tournamentId))}
          className={`${btn} vp-gradient w-fit text-white`}
        >
          {pending ? 'Registering…' : 'Register team'}
        </button>
        {msg && <span className="text-foreground-muted text-xs">{msg}</span>}
      </div>
    );
  }

  return (
    <span className="text-foreground-muted text-xs">Form a team with a partner to register.</span>
  );
}
