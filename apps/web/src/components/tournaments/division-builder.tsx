'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import {
  addDivision,
  updateDivision,
  cloneDivision,
  removeDivision,
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
  const [activeAction, setActiveAction] = useState<'status' | 'clone' | 'remove' | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

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
            onChange={(e) => {
              setActiveAction('status');
              start(async () => {
                const res = await setDivisionStatus(
                  division.id,
                  tournamentId,
                  slug,
                  e.target.value as (typeof DIVISION_STATUSES)[number],
                );
                setMsg(res.error ?? null);
                if (res.ok) router.refresh();
                setActiveAction(null);
              });
            }}
            disabled={pending}
            className="border-border bg-background rounded-lg border px-2 py-1 text-xs"
          >
            {DIVISION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {pending && activeAction === 'status' && (
            <Loader2
              size={14}
              className="text-foreground-muted animate-spin"
              aria-label="Updating"
            />
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setActiveAction('clone');
              start(async () => {
                const res = await cloneDivision(division.id, tournamentId, slug);
                setMsg(res.error ?? null);
                if (res.ok) router.refresh();
                setActiveAction(null);
              });
            }}
            className="border-border text-foreground rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
          >
            {pending && activeAction === 'clone' && (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            )}
            {pending && activeAction === 'clone' ? 'Cloning…' : 'Clone'}
          </button>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="border-border text-foreground rounded-lg border px-2.5 py-1 text-xs font-semibold"
          >
            {editing ? 'Close' : 'Edit'}
          </button>
          {!confirmRemove && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setMsg(null);
                setConfirmRemove(true);
              }}
              className="border-danger/40 text-danger inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
            >
              <Trash2 size={12} aria-hidden />
              Remove
            </button>
          )}
        </div>
      </div>
      {confirmRemove && (
        <div className="border-danger/30 bg-danger/5 mt-3 rounded-xl border p-3">
          <p className="text-foreground text-sm font-medium">Remove {division.name}?</p>
          <p className="text-foreground-muted mt-1 text-xs">
            This is only allowed before the division has registrations, teams, invitations, or
            player interest.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setActiveAction('remove');
                start(async () => {
                  const res = await removeDivision(division.id, tournamentId, slug);
                  setMsg(res.error ?? res.message ?? null);
                  if (res.ok) {
                    setConfirmRemove(false);
                    router.refresh();
                  }
                  setActiveAction(null);
                });
              }}
              className="bg-danger inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {pending && activeAction === 'remove' && (
                <Loader2 size={12} className="animate-spin" aria-hidden />
              )}
              {pending && activeAction === 'remove' ? 'Removing…' : 'Yes, remove'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmRemove(false)}
              className="border-border text-foreground rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              Keep division
            </button>
          </div>
        </div>
      )}
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
