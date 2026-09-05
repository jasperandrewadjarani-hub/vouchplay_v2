'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TournamentStatus } from '@vouchplay/db';
import { setTournamentStatus } from '@/lib/actions/tournament';
import { tournamentStatusLabel, TournamentStatusPill } from './status-pill';

// Mirrors the server-side transition map (§17.2). The server re-validates.
const TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ['published', 'cancelled'],
  published: ['registration_open', 'draft', 'cancelled'],
  registration_open: ['registration_closed', 'cancelled'],
  registration_closed: ['locked', 'registration_open', 'cancelled'],
  locked: ['live', 'registration_closed', 'cancelled'],
  live: ['completed', 'cancelled'],
  completed: ['archived'],
  archived: [],
  cancelled: [],
};

export function LifecycleControls({
  tournamentId,
  slug,
  status,
}: {
  tournamentId: string;
  slug: string;
  status: TournamentStatus;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const next = TRANSITIONS[status];

  function go(to: TournamentStatus) {
    if (
      (to === 'cancelled' || to === 'archived') &&
      !confirm(`Set status to ${tournamentStatusLabel(to)}?`)
    )
      return;
    setMsg(null);
    start(async () => {
      const res = await setTournamentStatus(tournamentId, slug, to);
      setMsg(res.error ?? res.message ?? null);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-foreground-muted text-sm">Current:</span>
        <TournamentStatusPill status={status} />
      </div>
      {next.length === 0 ? (
        <p className="text-foreground-muted text-sm">This is a terminal status.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {next.map((to) => (
            <button
              key={to}
              type="button"
              disabled={pending}
              onClick={() => go(to)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${
                to === 'cancelled'
                  ? 'text-danger border-border border'
                  : 'border-border text-foreground hover:bg-surface-muted border'
              }`}
            >
              → {tournamentStatusLabel(to)}
            </button>
          ))}
        </div>
      )}
      {msg && <p className="text-foreground-muted text-xs">{msg}</p>}
    </div>
  );
}
