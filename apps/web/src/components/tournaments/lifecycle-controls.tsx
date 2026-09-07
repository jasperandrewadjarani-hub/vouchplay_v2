'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TournamentStatus } from '@vouchplay/db';
import {
  MANAGEABLE_TOURNAMENT_STATUSES,
  TOURNAMENT_STATUS_GUIDANCE,
  isManageableTournamentStatus,
} from '@vouchplay/core';
import { setTournamentStatus, type TournamentActionState } from '@/lib/actions/tournament';
import { SubmitButton } from '@/components/ui/button';
import { Field, FormError, FormMessage, Select } from '@/components/ui/field';
import { tournamentStatusLabel, TournamentStatusPill } from './status-pill';

const empty: TournamentActionState = {};

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
  const [selected, setSelected] = useState<string>(status);
  const action = setTournamentStatus.bind(null, tournamentId, slug);
  const [state, formAction] = useActionState(action, empty);

  useEffect(() => setSelected(status), [status]);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  if (status === 'archived') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-foreground-muted text-sm">Current:</span>
          <TournamentStatusPill status={status} />
        </div>
        <p className="text-foreground-muted text-sm">
          Archived tournaments use the owner-only Restore control at the bottom of this page.
        </p>
      </div>
    );
  }

  const guidance = isManageableTournamentStatus(selected)
    ? TOURNAMENT_STATUS_GUIDANCE[selected]
    : '';
  const selectedStatus = selected as TournamentStatus;

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-foreground-muted text-sm">Current:</span>
        <TournamentStatusPill status={status} />
      </div>

      <Field
        label="Change status"
        htmlFor="nextStatus"
        hint="You can move forward or backward at any time. Archived uses the separate retention control."
      >
        <Select
          id="nextStatus"
          name="nextStatus"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          {MANAGEABLE_TOURNAMENT_STATUSES.map((option) => (
            <option key={option} value={option}>
              {tournamentStatusLabel(option as TournamentStatus)}
            </option>
          ))}
        </Select>
      </Field>

      <div
        className={`rounded-xl border p-3 ${
          selected === 'cancelled'
            ? 'border-danger/30 bg-danger/5'
            : 'border-border bg-surface-muted/40'
        }`}
        aria-live="polite"
      >
        <p className="text-foreground text-sm font-medium">
          {tournamentStatusLabel(selectedStatus)}
        </p>
        <p className="text-foreground-muted mt-1 text-xs">{guidance}</p>
      </div>

      <p className="text-foreground-muted text-xs">
        Changing status does not delete or roll back registrations, teams, payments, eligibility
        decisions, announcements, or achievements.
      </p>
      <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
      <FormError>{state.error}</FormError>
      <SubmitButton pendingLabel="Updating status…" disabled={selected === status}>
        Update status
      </SubmitButton>
    </form>
  );
}
