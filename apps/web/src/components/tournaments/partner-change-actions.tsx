'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { leaveTeamAfterCancellation } from '@/lib/actions/registration';

/** An explicit two-step partner-change path: cancel first, then leave the now-unregistered team. */
export function PartnerChangeActions({
  teamId,
  tournamentId,
}: {
  teamId: string;
  tournamentId: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mt-2 space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm('Leave this cancelled team? Your partner will be notified.')) return;
          setMessage(null);
          start(async () => {
            const result = await leaveTeamAfterCancellation(teamId, tournamentId);
            setMessage(result.error ?? result.message ?? null);
            if (result.ok) router.refresh();
          });
        }}
        className="border-border text-foreground rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        {pending ? 'Leaving team…' : 'Leave team and change partner'}
      </button>
      {message && <p className="text-foreground-muted text-xs">{message}</p>}
    </div>
  );
}
