'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adminSetEventBadge } from '@/lib/actions/badges';

/**
 * One commemorative-tournament row on Admin → Badges "Event badges" (master_plan §2BK B): set or
 * clear the label that turns a tournament's confirmed entrants into `event:<tournamentId>` badge
 * holders. Clearing retires those badges silently, so Remove gets its own inline confirm.
 */
export function EventBadgeRow({
  tournamentId,
  initialLabel,
}: {
  tournamentId: string;
  initialLabel: string | null;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(initialLabel ?? '');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    if (!label.trim()) {
      setError('Enter a label, or use Remove to clear it.');
      return;
    }
    setError(null);
    setSavedMsg(null);
    start(async () => {
      const res = await adminSetEventBadge({ tournamentId, label: label.trim() });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedMsg(res.message ?? 'Saved.');
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    setSavedMsg(null);
    start(async () => {
      const res = await adminSetEventBadge({ tournamentId, label: null });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLabel('');
      setConfirmRemove(false);
      setSavedMsg(res.message ?? 'Removed.');
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Rise of Empires 2026"
          className="border-border bg-background min-h-[44px] flex-1 rounded-xl border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="vp-gradient min-h-[44px] flex-1 rounded-xl px-4 text-sm font-semibold text-white transition-all disabled:opacity-60 sm:flex-none"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
          {initialLabel && !confirmRemove && (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              disabled={pending}
              className="border-danger/40 text-danger hover:bg-danger/10 min-h-[44px] flex-1 rounded-xl border px-4 text-sm font-semibold transition-colors disabled:opacity-60 sm:flex-none"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {confirmRemove && (
        <div className="border-danger/40 bg-danger/5 flex flex-wrap items-center gap-2 rounded-xl border p-2 text-xs">
          <span className="text-foreground">
            Clear the event badge label? Existing badges retire silently.
          </span>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="border-danger/40 text-danger hover:bg-danger/10 min-h-[44px] rounded-lg border px-3 font-semibold transition-colors disabled:opacity-60"
          >
            {pending ? 'Removing…' : 'Confirm remove'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmRemove(false)}
            disabled={pending}
            className="border-border text-foreground min-h-[44px] rounded-lg border px-3 font-semibold transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      )}
      {savedMsg && <p className="text-success text-xs">{savedMsg}</p>}
    </div>
  );
}
