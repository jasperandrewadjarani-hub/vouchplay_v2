'use client';

import { useState } from 'react';
import type { PartnerDivisionRef, PartnerDeckData, PartnerSearchState } from '@/lib/partners/types';
import { openPartnerSearch, refreshPartnerDeck } from '@/lib/actions/partners';
import { Field, Input, FormError } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

const NOTE_MAX = 120;

/**
 * The opt-in panel ("Find a partner", master_plan §2AV B): divisions to search in plus an optional
 * one-line note. Used two ways from `partner-deck.tsx` - inline when there is no open search yet, and
 * inside a `Modal` (prefilled) for "Edit my search" - so it renders only its own content, never a
 * dialog shell itself.
 */
export function PartnerSearchSheet({
  tournamentId,
  slug,
  eligibleDivisions,
  initial = null,
  editing = false,
  onSuccess,
  onCancel,
}: {
  tournamentId: string;
  slug: string;
  eligibleDivisions: PartnerDivisionRef[];
  /** The viewer's current search, when editing one already open. */
  initial?: PartnerSearchState | null;
  editing?: boolean;
  /** Called with the freshly reloaded deck once the search is saved. */
  onSuccess: (deck: PartnerDeckData) => void;
  onCancel?: () => void;
}) {
  const seatDivisionIds = new Set(
    eligibleDivisions.filter((d) => d.viewerHasSeat).map((d) => d.id),
  );
  const [selected, setSelected] = useState<Set<string>>(() => {
    const base = new Set(
      initial?.divisionIds ??
        eligibleDivisions.filter((d) => d.recommended || d.viewerHasSeat).map((d) => d.id),
    );
    for (const id of seatDivisionIds) base.add(id);
    return base;
  });
  const [note, setNote] = useState(initial?.note ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string, checked: boolean) {
    if (seatDivisionIds.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0) {
      setError('Choose at least one division.');
      return;
    }
    setError(null);
    setPending(true);
    const res = await openPartnerSearch(tournamentId, Array.from(selected), note.trim());
    if (!res.ok) {
      setPending(false);
      setError(res.error ?? 'Could not save your search. Please try again.');
      return;
    }
    const fresh = await refreshPartnerDeck(slug);
    setPending(false);
    if (fresh) onSuccess(fresh);
  }

  const recommended = eligibleDivisions.filter((d) => d.recommended);
  const other = eligibleDivisions.filter((d) => !d.recommended);

  function Row({ d }: { d: PartnerDivisionRef }) {
    const locked = d.viewerHasSeat;
    const checked = locked || selected.has(d.id);
    return (
      <label
        className={`border-border flex min-h-11 items-start gap-2.5 rounded-xl border p-3 text-sm ${
          locked ? 'bg-surface-muted' : 'cursor-pointer'
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={(e) => toggle(d.id, e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="flex-1">
          <span className="text-foreground flex flex-wrap items-center gap-1.5 font-medium">
            {d.name}
            {d.recommended && (
              <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                Recommended
              </span>
            )}
          </span>
          {locked && (
            <span className="text-foreground-muted mt-0.5 block text-xs">
              You already hold a seat here
            </span>
          )}
        </span>
      </label>
    );
  }

  if (eligibleDivisions.length === 0) {
    return (
      <p className="text-foreground-muted text-sm">
        No open doubles divisions to search in right now.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-foreground mb-2 text-sm font-medium">Which divisions?</p>
        <div className="space-y-3">
          {recommended.length > 0 && (
            <ul className="space-y-1.5">
              {recommended.map((d) => (
                <li key={d.id}>
                  <Row d={d} />
                </li>
              ))}
            </ul>
          )}
          {other.length > 0 && (
            <ul className="space-y-1.5">
              {other.map((d) => (
                <li key={d.id}>
                  <Row d={d} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Field
        label="Note"
        htmlFor="partner-search-note"
        hint={`Optional · ${note.length}/${NOTE_MAX}`}
      >
        <Input
          id="partner-search-note"
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Weekday evenings, Alabang"
        />
      </Field>

      <FormError>{error}</FormError>

      <Button type="button" onClick={() => void submit()} disabled={pending} className="w-full">
        {pending ? 'Saving…' : editing ? 'Save' : 'Start looking'}
      </Button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-foreground-muted hover:text-foreground min-h-11 w-full text-center text-sm font-medium"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
