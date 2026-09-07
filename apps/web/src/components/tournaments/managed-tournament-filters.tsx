'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, RotateCcw } from 'lucide-react';

export type ManagedVisibilityStatus = 'draft' | 'cancelled' | 'archived';

const STATUS_OPTIONS: Array<{ status: ManagedVisibilityStatus; label: string }> = [
  { status: 'draft', label: 'Draft' },
  { status: 'cancelled', label: 'Cancelled' },
  { status: 'archived', label: 'Archived' },
];

const PARAM_BY_STATUS: Record<ManagedVisibilityStatus, string> = {
  draft: 'hideDraft',
  cancelled: 'hideCancelled',
  archived: 'hideArchived',
};

/** Private managed-list display controls. URL state keeps Back/Forward and search predictable. */
export function ManagedTournamentFilters({
  hiddenStatuses,
  queryString,
}: {
  hiddenStatuses: ManagedVisibilityStatus[];
  queryString: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<ManagedVisibilityStatus | 'all' | null>(null);

  useEffect(() => setPendingKey(null), [queryString]);

  function navigate(next: URLSearchParams, key: ManagedVisibilityStatus | 'all') {
    setPendingKey(key);
    const qs = next.toString();
    startTransition(() =>
      router.replace(qs ? `/tournaments?${qs}` : '/tournaments', { scroll: false }),
    );
  }

  function setShown(status: ManagedVisibilityStatus, shown: boolean) {
    const next = new URLSearchParams(queryString);
    const param = PARAM_BY_STATUS[status];
    if (shown) next.delete(param);
    else next.set(param, '1');
    navigate(next, status);
  }

  function showAll() {
    const next = new URLSearchParams(queryString);
    for (const param of Object.values(PARAM_BY_STATUS)) next.delete(param);
    navigate(next, 'all');
  }

  return (
    <div className="border-border bg-surface-muted/50 rounded-xl border p-3" aria-busy={pending}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-foreground text-xs font-semibold">Display in Your tournaments</p>
          <p className="text-foreground-muted text-[11px]">
            Only your private organizer list changes.
          </p>
        </div>
        {hiddenStatuses.length > 0 && (
          <button
            type="button"
            onClick={showAll}
            disabled={pending}
            className="text-primary hover:bg-primary/10 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold disabled:opacity-60"
          >
            {pending && pendingKey === 'all' ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <RotateCcw size={14} aria-hidden />
            )}
            Show all
          </button>
        )}
      </div>
      <fieldset className="flex flex-wrap gap-2" disabled={pending}>
        <legend className="sr-only">Choose which managed tournament statuses are shown</legend>
        {STATUS_OPTIONS.map(({ status, label }) => {
          const shown = !hiddenStatuses.includes(status);
          const itemPending = pending && pendingKey === status;
          return (
            <label
              key={status}
              className={`border-border inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors ${
                shown
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'bg-background text-foreground-muted'
              } ${pending ? 'cursor-wait opacity-65' : 'hover:border-primary/50'}`}
            >
              <input
                type="checkbox"
                checked={shown}
                onChange={(event) => setShown(status, event.target.checked)}
                className="sr-only"
              />
              {itemPending ? (
                <Loader2 size={15} className="text-primary animate-spin" aria-hidden />
              ) : shown ? (
                <Eye size={15} className="text-primary" aria-hidden />
              ) : (
                <EyeOff size={15} aria-hidden />
              )}
              Show {label}
            </label>
          );
        })}
      </fieldset>
      <p className="text-foreground-muted mt-2 text-[11px]" aria-live="polite">
        {hiddenStatuses.length === 0
          ? 'Draft, Cancelled, and Archived tournaments are shown.'
          : `${hiddenStatuses.length} status ${hiddenStatuses.length === 1 ? 'group is' : 'groups are'} hidden.`}
      </p>
    </div>
  );
}
