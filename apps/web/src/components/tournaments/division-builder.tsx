'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import {
  addDivision,
  updateDivision,
  cloneDivision,
  setDivisionStatus,
  type TournamentActionState,
} from '@/lib/actions/tournament';
import { DivisionFields } from './division-fields';
import { FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: TournamentActionState = {};
const DIVISION_STATUSES = ['draft', 'open', 'closed', 'locked', 'cancelled'] as const;

export function DivisionBuilder({
  tournamentId,
  slug,
  divisions,
}: {
  tournamentId: string;
  slug: string;
  divisions: DivisionDTO[];
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(divisions.length === 0);
  const addAction = addDivision.bind(null, tournamentId, slug);
  const [addState, addFormAction] = useActionState(addAction, empty);

  useEffect(() => {
    if (addState.ok) {
      router.refresh();
      setShowAdd(false);
    }
  }, [addState.ok, router]);

  return (
    <div className="space-y-4">
      {divisions.length > 0 && (
        <ul className="space-y-2">
          {divisions.map((d) => (
            <DivisionRow key={d.id} division={d} tournamentId={tournamentId} slug={slug} />
          ))}
        </ul>
      )}

      {showAdd ? (
        <form
          action={addFormAction}
          className="border-border space-y-3 rounded-xl border border-dashed p-3"
        >
          <p className="text-foreground text-sm font-semibold">New division</p>
          <FormMessage>{addState.ok ? addState.message : undefined}</FormMessage>
          <FormError>{addState.error}</FormError>
          <DivisionFields />
          <div className="flex gap-2">
            <SubmitButton pendingLabel="Adding…">Add division</SubmitButton>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="border-border text-foreground rounded-xl border px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="border-border text-foreground hover:bg-surface-muted rounded-xl border border-dashed px-4 py-2 text-sm font-medium"
        >
          + Add division
        </button>
      )}
    </div>
  );
}

function DivisionRow({
  division,
  tournamentId,
  slug,
}: {
  division: DivisionDTO;
  tournamentId: string;
  slug: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const editAction = updateDivision.bind(null, division.id, tournamentId, slug);
  const [editState, editFormAction] = useActionState(editAction, empty);
  useEffect(() => {
    if (editState.ok) {
      router.refresh();
      setEditing(false);
    }
  }, [editState.ok, router]);

  return (
    <li className="border-border rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-foreground text-sm font-semibold">{division.name}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            defaultValue={division.status}
            onChange={(e) =>
              start(async () => {
                const res = await setDivisionStatus(
                  division.id,
                  tournamentId,
                  slug,
                  e.target.value as (typeof DIVISION_STATUSES)[number],
                );
                setMsg(res.error ?? null);
                if (res.ok) router.refresh();
              })
            }
            disabled={pending}
            className="border-border bg-background rounded-lg border px-2 py-1 text-xs"
          >
            {DIVISION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await cloneDivision(division.id, tournamentId, slug);
                setMsg(res.error ?? null);
                if (res.ok) router.refresh();
              })
            }
            className="border-border text-foreground rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
          >
            Clone
          </button>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="border-border text-foreground rounded-lg border px-2.5 py-1 text-xs font-semibold"
          >
            {editing ? 'Close' : 'Edit'}
          </button>
        </div>
      </div>
      {msg && <p className="text-danger mt-1 text-xs">{msg}</p>}

      {editing && (
        <form action={editFormAction} className="mt-3 space-y-3">
          <FormError>{editState.error}</FormError>
          <DivisionFields initial={division} />
          <SubmitButton pendingLabel="Saving…">Save division</SubmitButton>
        </form>
      )}
    </li>
  );
}
