'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useBackToClose } from '@/lib/hooks/use-back-to-close';
import type { DivisionCapacityRow } from '@/lib/tournaments/organizer-types';
import {
  clearRefine,
  SORT_OPTIONS,
  type EntryFilters,
  type EntrySort,
  type PaymentState,
} from '@/lib/tournaments/entry-view';

/**
 * Shared bottom sheet (master_plan §2BG Decision G): fixed to the bottom edge on a phone with a drag
 * handle and the safe-area inset, a centered dialog from `sm` up. Built as its own primitive rather
 * than reusing `components/ui/modal.tsx` - that component always renders a text `title`/`subtitle`
 * header plus its own close-button chrome and has no `footer` slot, so a sticky "Clear / Show N
 * entries" action bar (§2BG Decision D) would have had to live inside the scrolling body. Exported so
 * a later lane (`team-card.tsx`'s ⋯ action sheets) can reuse it without rebuilding the shell.
 */
export function BottomSheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);

  // master_plan §2BH Decision A: the phone's Back gesture closes this sheet instead of leaving the
  // page. `BottomSheet` is only ever mounted while its owner's boolean state is true (the caller
  // renders it as `{showX && <XSheet .../>}`), so `open` is always `true` for the sheet's lifetime -
  // FilterSheet and DivisionsSheet inherit this for free by being built on top of BottomSheet.
  useBackToClose(true, onClose);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="border-border bg-surface flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl border sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex shrink-0 justify-center pt-2 sm:hidden" aria-hidden>
          <span className="bg-border h-1.5 w-10 rounded-full" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-2 pb-3">
          <h2 className="text-foreground text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-foreground-muted hover:text-foreground hover:bg-surface-muted -m-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">{children}</div>
        {footer && (
          <div className="border-border bg-surface shrink-0 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Small toggle chip shared by the Payment / Account / Partner groups below - 44px tall, matching the
 *  reason chips above the list. */
function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center rounded-xl border px-3 text-sm font-medium transition-colors ${
        active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border text-foreground-muted hover:border-primary/40 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Divisions sheet (master_plan §2BG Decision C): pick mode is a searchable multi-select checklist
 * (the `Divisions ▾` filter button); capacity mode is the same rows read-only, one tap filtering to
 * that division and closing (the top-of-screen summary line). A search field only appears once there
 * are enough divisions that scanning stops being the fastest way to find one.
 */
export function DivisionsSheet({
  divisions,
  selected,
  mode,
  onChange,
  onClose,
}: {
  divisions: DivisionCapacityRow[];
  selected: string[];
  mode: 'pick' | 'capacity';
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const showSearch = divisions.length > 8;
  const needle = search.trim().toLowerCase();
  const filtered =
    showSearch && needle
      ? divisions.filter((d) => d.name.toLowerCase().includes(needle))
      : divisions;

  function tap(id: string) {
    if (mode === 'capacity') {
      onChange([id]);
      onClose();
      return;
    }
    onChange(toggleIn(selected, id));
  }

  return (
    <BottomSheet
      title={mode === 'capacity' ? 'Divisions' : 'Filter by division'}
      onClose={onClose}
      footer={
        mode === 'pick' ? (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-foreground-muted hover:text-foreground min-h-11 px-2 text-sm font-medium"
            >
              Clear
            </button>
            <Button type="button" onClick={onClose} className="flex-1">
              Done
            </Button>
          </div>
        ) : undefined
      }
    >
      {showSearch && (
        <div className="relative mb-2">
          <Search
            size={15}
            className="text-foreground-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search divisions"
            aria-label="Search divisions"
            className="border-border bg-background text-foreground placeholder:text-foreground-muted min-h-11 w-full rounded-xl border pr-3 pl-9 text-sm"
          />
        </div>
      )}
      {filtered.length === 0 ? (
        <p className="text-foreground-muted px-1 py-3 text-sm">No divisions found.</p>
      ) : (
        <ul className="divide-border divide-y">
          {filtered.map((d) => {
            const active = selected.includes(d.id);
            const pct = d.capacity > 0 ? Math.min(100, (d.registered / d.capacity) * 100) : 0;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => tap(d.id)}
                  aria-pressed={mode === 'pick' ? active : undefined}
                  className="flex min-h-[52px] w-full items-center gap-3 py-2 text-left"
                >
                  {mode === 'pick' && (
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        active ? 'border-primary bg-primary text-white' : 'border-border'
                      }`}
                    >
                      {active && (
                        <svg viewBox="0 0 16 16" width={12} height={12} fill="none">
                          <path
                            d="M3.5 8.5l3 3 6-7"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-foreground truncate text-sm font-medium">{d.name}</span>
                      <span className="text-foreground-muted shrink-0 text-xs font-semibold tabular-nums">
                        {d.capacity > 0 ? `${d.registered}/${d.capacity}` : d.registered}
                      </span>
                    </span>
                    {d.capacity > 0 && (
                      <span className="bg-surface-muted mt-1 block h-1.5 w-full overflow-hidden rounded-full">
                        <span
                          className="bg-primary block h-full rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </BottomSheet>
  );
}

const PAYMENT_OPTIONS: { value: PaymentState; label: string }[] = [
  { value: 'unpaid', label: 'Not paid' },
  { value: 'sent', label: 'Receipt sent' },
  { value: 'partial', label: 'Partly paid' },
  { value: 'paid', label: 'Paid' },
];
const PARTNER_OPTIONS: { value: 'open_seat' | 'pending'; label: string }[] = [
  { value: 'open_seat', label: 'Open seat' },
  { value: 'pending', label: 'Partner pending' },
];

/**
 * Filter sheet (master_plan §2BG Decision D): everything the bucket tabs and the reason chips do not
 * already answer. Edits a local draft so "Clear"/"Show N entries" can commit or discard in one action
 * instead of every tap re-filtering the list live underneath the sheet.
 */
export function FilterSheet({
  filters,
  sort,
  onApply,
  onClose,
  previewCount,
}: {
  filters: EntryFilters;
  sort: EntrySort;
  onApply: (filters: EntryFilters, sort: EntrySort) => void;
  onClose: () => void;
  previewCount: (filters: EntryFilters) => number;
}) {
  const [draft, setDraft] = useState<EntryFilters>(filters);
  const [draftSort, setDraftSort] = useState<EntrySort>(sort);

  return (
    <BottomSheet
      title="Filter"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDraft((d) => clearRefine(d))}
            className="text-foreground-muted hover:text-foreground min-h-11 px-2 text-sm font-medium"
          >
            Clear
          </button>
          <Button
            type="button"
            className="flex-1"
            onClick={() => {
              onApply(draft, draftSort);
              onClose();
            }}
          >
            Show {previewCount(draft)} entries
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <section>
          <h3 className="text-foreground-muted mb-1.5 text-xs font-semibold">Sort</h3>
          <div className="space-y-0.5">
            {SORT_OPTIONS.map((o) => {
              const active = o.key === draftSort.key && o.dir === draftSort.dir;
              return (
                <label
                  key={`${o.key}-${o.dir}`}
                  className="flex min-h-11 cursor-pointer items-center gap-2.5"
                >
                  <input
                    type="radio"
                    name="entry-sort"
                    checked={active}
                    onChange={() => setDraftSort({ key: o.key, dir: o.dir })}
                    className="border-border h-4 w-4 shrink-0"
                  />
                  <span className="text-foreground text-sm">{o.label}</span>
                </label>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="text-foreground-muted mb-1.5 text-xs font-semibold">Payment</h3>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_OPTIONS.map((o) => (
              <ToggleChip
                key={o.value}
                active={draft.payment.includes(o.value)}
                onClick={() => setDraft((d) => ({ ...d, payment: toggleIn(d.payment, o.value) }))}
              >
                {o.label}
              </ToggleChip>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-foreground-muted mb-1.5 text-xs font-semibold">Account</h3>
          <div className="flex flex-wrap gap-1.5">
            <ToggleChip
              active={draft.account.includes('unverified')}
              onClick={() =>
                setDraft((d) => ({ ...d, account: toggleIn(d.account, 'unverified') }))
              }
            >
              Unverified
            </ToggleChip>
          </div>
        </section>

        <section>
          <h3 className="text-foreground-muted mb-1.5 text-xs font-semibold">Partner</h3>
          <div className="flex flex-wrap gap-1.5">
            {PARTNER_OPTIONS.map((o) => (
              <ToggleChip
                key={o.value}
                active={draft.partner.includes(o.value)}
                onClick={() => setDraft((d) => ({ ...d, partner: toggleIn(d.partner, o.value) }))}
              >
                {o.label}
              </ToggleChip>
            ))}
          </div>
        </section>

        <section>
          <Switch
            checked={draft.includeClosed}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, includeClosed: v }))}
            label="Show closed entries"
            description="Withdrawn, rejected, cancelled and refunded"
          />
        </section>
      </div>
    </BottomSheet>
  );
}
