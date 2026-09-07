'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { TournamentStatus } from '@vouchplay/db';
import { canArchiveTournamentStatus } from '@vouchplay/core';
import {
  archiveTournament,
  restoreTournament,
  type TournamentActionState,
} from '@/lib/actions/tournament';
import { Field, FormError, FormMessage, Input } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: TournamentActionState = {};
export function ArchiveControls({
  tournamentId,
  slug,
  name,
  status,
}: {
  tournamentId: string;
  slug: string;
  name: string;
  status: TournamentStatus;
}) {
  const router = useRouter();
  const archiveAction = archiveTournament.bind(null, tournamentId, slug, name);
  const restoreAction = restoreTournament.bind(null, tournamentId, slug, name);
  const [archiveState, archiveFormAction] = useActionState(archiveAction, empty);
  const [restoreState, restoreFormAction] = useActionState(restoreAction, empty);

  useEffect(() => {
    if (archiveState.ok) router.push('/tournaments');
  }, [archiveState.ok, router]);

  useEffect(() => {
    if (restoreState.ok) router.refresh();
  }, [restoreState.ok, router]);

  if (status === 'archived') {
    return (
      <form action={restoreFormAction} className="space-y-3">
        <p className="text-foreground-muted text-sm">
          Restore this tournament to Draft so you can review it before publishing again.
        </p>
        <FormMessage>{restoreState.ok ? restoreState.message : undefined}</FormMessage>
        <FormError>{restoreState.error}</FormError>
        <SubmitButton pendingLabel="Restoring…" variant="secondary">
          Restore to Draft
        </SubmitButton>
      </form>
    );
  }

  if (!canArchiveTournamentStatus(status)) {
    return (
      <p className="text-foreground-muted text-sm">
        Active tournaments cannot be archived. First move it through the normal lifecycle to Draft,
        Cancelled, or Completed.
      </p>
    );
  }

  return (
    <form action={archiveFormAction} className="space-y-3">
      <p className="text-foreground-muted text-sm">
        Archiving hides this tournament from players without deleting its registrations, payments,
        or history. You can restore it later.
      </p>
      <FormError>{archiveState.error}</FormError>
      <Field label={`Type “${name}” to confirm`} htmlFor="tournamentName" required>
        <Input
          id="tournamentName"
          name="tournamentName"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </Field>
      <SubmitButton pendingLabel="Archiving…" variant="secondary">
        Archive tournament
      </SubmitButton>
    </form>
  );
}
