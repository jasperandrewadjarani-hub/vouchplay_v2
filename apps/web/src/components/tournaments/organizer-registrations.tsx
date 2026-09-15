'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Info,
  Search,
  SlidersHorizontal,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { verifyPaymentsBulk } from '@/lib/actions/payment';
import type { OrganizerRegistration } from '@/lib/tournaments/registration-queries';
import { AddEntryWizard, type AddEntryDivisionOption } from './add-entry-wizard';
import { DivisionsSheet, FilterSheet } from './manage-sheets';
import { TeamCard } from './team-card';
import {
  activeRefineCount,
  countViews,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  ENTRY_FLAG_LABELS,
  entryFlags,
  entryVerdict,
  filterEntries,
  hasOpenSeat,
  isClosed,
  memberDisplay,
  moneyRead,
  NEEDS_CAPTION,
  NEEDS_REASON_SHORT,
  paymentState,
  sortEntries,
  STATUS_VIEW_CAPTIONS,
  STATUS_VIEW_LABELS,
  teamLabel,
  type EntryFilters,
  type EntryFlag,
  type EntrySort,
  type NeedsReason,
  type StatusView,
} from '@/lib/tournaments/entry-view';
import type {
  DivisionCapacityRow,
  EligibilityDivisionOption,
} from '@/lib/tournaments/organizer-types';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/players/player-avatar';

/** Left-to-right order of the status segmented control (master_plan §2BH Decision B). */
const STATUS_ORDER: StatusView[] = ['all', 'unconfirmed', 'confirmed'];

/** The icon each row-flag reads with on line 3 (master_plan §2BH Decision E: words, not icon-only
 *  meaning - the icon is decoration, the label always carries the meaning). */
const FLAG_ICON: Record<EntryFlag, typeof Clock> = {
  partner_pending: Clock,
  unverified: UserX,
  low_evidence: Info,
  eligibility_note: Info,
};

/** True when an entry has a receipt on file worth bulk-verifying - a submitted team payment or any
 *  submitted seat (master_plan §2AQ Decision E: bulk verify). Rows without one get no checkbox. */
function hasSubmittedReceipt(entry: OrganizerRegistration): boolean {
  const teamSubmitted = entry.paymentStatus === 'submitted' && !!entry.paymentId;
  const submittedSlots = (entry.slots ?? []).filter((s) => s.status === 'submitted');
  return teamSubmitted || submittedSlots.length > 0;
}

/** `verifyPaymentsBulk` items for one selected entry - the team receipt when it is the one submitted,
 *  else every submitted seat (master_plan §2AQ Decision E). */
function bulkItemsFor(entry: OrganizerRegistration): { id: string; kind: 'team' | 'slot' }[] {
  const teamSubmitted = entry.paymentStatus === 'submitted' && !!entry.paymentId;
  if (teamSubmitted) return [{ id: entry.paymentId as string, kind: 'team' }];
  const submittedSlots = (entry.slots ?? []).filter((s) => s.status === 'submitted');
  return submittedSlots.map((s) => ({ id: s.id, kind: 'slot' as const }));
}

/** §2BG: an open entry whose `paymentState` reads 'paid' - for the top-of-screen summary line's
 *  "{n} paid" count (a free division counts as paid, per `paymentState`/Decision D). */
function isPaidEntry(entry: OrganizerRegistration): boolean {
  return !isClosed(entry) && paymentState(entry) === 'paid';
}

function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const VERDICT_TONE_STYLES: Record<'action' | 'waiting' | 'done' | 'closed', string> = {
  action: 'border-warning/40 bg-warning/10 text-warning',
  waiting: 'border-border bg-surface-muted text-foreground-muted',
  done: 'border-success/30 bg-success/10 text-success',
  closed: 'border-border text-foreground-muted opacity-70',
};

/** A striped/dashed placeholder circle for an open seat, matching `PlayerAvatar`'s "sm" footprint so
 *  the stacked-avatar row lines up whether a seat is filled or not (master_plan §2BG Decision B). */
function OpenSeatAvatar() {
  return (
    <span
      aria-hidden
      className="border-border/70 text-foreground-muted ring-surface flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed text-sm font-semibold ring-2"
    >
      ?
    </span>
  );
}

/**
 * Top-of-screen summary (master_plan §2BG Decision C): "163 of 820 entered · 66 paid", replacing the
 * always-on capacity strip. Tapping opens the Divisions sheet in capacity mode. Renders as plain text
 * when there is nothing to open (no divisions loaded).
 */
function SummaryLine({
  divisions,
  registrations,
  onOpen,
}: {
  divisions: DivisionCapacityRow[];
  registrations: OrganizerRegistration[];
  onOpen: () => void;
}) {
  const entered =
    divisions.length > 0
      ? divisions.reduce((sum, d) => sum + d.registered, 0)
      : registrations.filter((r) => !isClosed(r)).length;
  const capacityTotal = divisions.reduce((sum, d) => sum + d.capacity, 0);
  const paid = registrations.filter(isPaidEntry).length;
  const label =
    capacityTotal > 0
      ? `${entered} of ${capacityTotal} entered · ${paid} paid`
      : `${entered} entered · ${paid} paid`;

  if (divisions.length === 0) {
    return <p className="text-foreground px-1 text-sm font-semibold tabular-nums">{label}</p>;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="border-border bg-surface hover:bg-surface-muted flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-left transition-colors"
    >
      <span className="text-foreground text-sm font-semibold tabular-nums">{label}</span>
      <ChevronRight size={16} className="text-foreground-muted shrink-0" aria-hidden />
    </button>
  );
}

function divisionsButtonLabel(divisions: DivisionCapacityRow[], selectedIds: string[]): string {
  if (selectedIds.length === 0) return 'All divisions';
  if (selectedIds.length === 1) {
    return divisions.find((d) => d.id === selectedIds[0])?.name ?? '1 division';
  }
  return `${selectedIds.length} divisions`;
}

/**
 * Organizer registrations (master_plan §2BH, rebuilding §2BG's tabs): a summary line, search, a
 * full-width "Needs you" to-do toggle, a 3-way status split whose counts always match Overview
 * (Not confirmed + Confirmed = All, Confirmed = every `status = confirmed`), reason chips inside
 * Needs you, and one action row (Divisions / Filter / Add entry). The row itself carries one verdict
 * pill and up to two words-not-icons flags; the full picture - roster, next step, receipts,
 * eligibility - lives in `TeamCard`'s own bottom sheet.
 */
export function OrganizerRegistrations({
  tournamentId,
  registrations,
  eligibilityDivisions,
  divisions,
}: {
  tournamentId: string;
  registrations: OrganizerRegistration[];
  /** Divisions for the reclassify control inside `TeamCard` - unrelated to the filter bar. */
  eligibilityDivisions: EligibilityDivisionOption[];
  /** Per-division capacity + counts for the summary line and the Divisions sheet. */
  divisions: DivisionCapacityRow[];
}) {
  const router = useRouter();
  const initialCounts = countViews(registrations, DEFAULT_FILTERS);
  const [filters, setFilters] = useState<EntryFilters>(() => ({
    ...DEFAULT_FILTERS,
    needsOnly: initialCounts.needs > 0,
  }));
  const [sort, setSort] = useState<EntrySort>(DEFAULT_SORT);
  const [showDivisionsSheet, setShowDivisionsSheet] = useState<'pick' | 'capacity' | null>(null);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Bulk verify (master_plan §2AQ Decision E) - "Verify several" toggles select mode over the list,
  // independent of the detail sheet above.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  );

  // master_plan §2BE Decision C: "Add entry" - built from data this screen already loaded (division
  // capacity + the reclassify picker's format/team-size), no extra query.
  const [showAddEntry, setShowAddEntry] = useState(false);
  const addEntryDivisions: AddEntryDivisionOption[] = divisions.map((d) => {
    const detail = eligibilityDivisions.find((e) => e.id === d.id);
    return {
      id: d.id,
      name: d.name,
      format: detail?.format ?? '',
      teamSize: detail?.teamSize ?? 1,
      registered: d.registered,
      capacity: d.capacity,
    };
  });

  // master_plan §2BH "Remembered view": {needsOnly, status} per tournament. The very first render
  // already picks a deterministic default above (needs-you on when there is work, status "all") so it
  // renders the same on the server and the client; this effect only overrides it once `localStorage`
  // is reachable, migrating the old single-bucket key exactly once.
  const hydratedRef = useRef(false);
  const storageKey = `vp.manage.view.${tournamentId}`;
  const legacyKey = `vp.manage.bucket.${tournamentId}`;
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as { needsOnly?: unknown; status?: unknown };
        const status = parsed.status;
        if (
          typeof parsed.needsOnly === 'boolean' &&
          (status === 'all' || status === 'unconfirmed' || status === 'confirmed')
        ) {
          setFilters((f) => ({ ...f, needsOnly: parsed.needsOnly as boolean, status }));
        }
      } else {
        const legacy = window.localStorage.getItem(legacyKey);
        if (legacy) {
          const migrated: { needsOnly: boolean; status: StatusView } =
            legacy === 'needs'
              ? { needsOnly: true, status: 'all' }
              : legacy === 'waiting'
                ? { needsOnly: false, status: 'unconfirmed' }
                : legacy === 'confirmed'
                  ? { needsOnly: false, status: 'confirmed' }
                  : { needsOnly: false, status: 'all' };
          setFilters((f) => ({ ...f, ...migrated }));
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(migrated));
          } catch {
            // ignore - see the fail-silent contract below.
          }
          window.localStorage.removeItem(legacyKey);
        }
      }
    } catch {
      // localStorage unavailable (private mode, etc.) - fail silently, per master_plan §2BG C.
    }
    hydratedRef.current = true;
  }, [storageKey, legacyKey]);
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ needsOnly: filters.needsOnly, status: filters.status }),
      );
    } catch {
      // ignore - same fail-silent contract as the read above.
    }
  }, [storageKey, filters.needsOnly, filters.status]);

  if (registrations.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-foreground-muted text-sm">No registrations yet.</p>
        <Button
          type="button"
          onClick={() => setShowAddEntry(true)}
          className="inline-flex items-center gap-1.5"
        >
          <UserPlus size={15} aria-hidden />
          Add entry
        </Button>
        {showAddEntry && (
          <AddEntryWizard
            tournamentId={tournamentId}
            divisions={addEntryDivisions}
            onClose={() => setShowAddEntry(false)}
          />
        )}
      </div>
    );
  }

  const counts = countViews(registrations, filters);
  const visible = sortEntries(filterEntries(registrations, filters), sort);
  const selected = registrations.find((r) => r.id === openId) ?? null;
  const searching = filters.search.trim().length > 0;
  const refineCount = activeRefineCount(filters);

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }
  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulkVerify() {
    const targets = registrations.filter((r) => selectedIds.has(r.id));
    const items = targets.flatMap(bulkItemsFor);
    if (items.length === 0) return;
    setBulkPending(true);
    setBulkResult(null);
    const res = await verifyPaymentsBulk(tournamentId, items);
    setBulkPending(false);
    type BulkItemResult = { id: string; ok: boolean; error?: string };
    const failures = ((res.results as BulkItemResult[] | undefined) ?? []).filter((r) => !r.ok);
    if (failures.length > 0) {
      const labelById = new Map<string, string>();
      for (const t of targets) {
        if (t.paymentId) labelById.set(t.paymentId, teamLabel(t));
        for (const s of t.slots ?? []) labelById.set(s.id, teamLabel(t));
      }
      setBulkResult({
        tone: 'danger',
        text:
          `Verified ${items.length - failures.length} of ${items.length}. ` +
          failures.map((f) => `${labelById.get(f.id) ?? f.id}: ${f.error ?? 'failed'}`).join(' · '),
      });
    } else {
      setBulkResult({ tone: 'success', text: res.message ?? `Verified ${items.length}.` });
    }
    exitSelectMode();
    router.refresh();
  }

  const canVerifySeveral = filters.needsOnly && visible.some((r) => hasSubmittedReceipt(r));

  return (
    <div className="space-y-3">
      {/* Sticky search + Needs-you + status control (master_plan §2BH Decision B/G) - offset below the
          app's sticky header the same way `sidebar.tsx`'s own sticky nav does (`top-16`, no
          `--app-header-h` token exists in this codebase yet). */}
      <div className="bg-background sticky top-16 z-10 space-y-2.5 pt-1 pb-2">
        <SummaryLine
          divisions={divisions}
          registrations={registrations}
          onOpen={() => setShowDivisionsSheet('capacity')}
        />

        <div className="relative">
          <Search
            size={15}
            className="text-foreground-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
            aria-hidden
          />
          <input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Name, nickname or email"
            aria-label="Search registrations"
            className="border-border bg-background text-foreground placeholder:text-foreground-muted min-h-11 w-full rounded-xl border pr-9 pl-9 text-sm"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, search: '' }))}
              aria-label="Clear search"
              className="text-foreground-muted hover:text-foreground absolute top-1/2 right-1.5 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg"
            >
              <X size={15} aria-hidden />
            </button>
          )}
        </div>

        {/* "Needs you" - a to-do list across any status, not a tab (master_plan §2BH Decision B). */}
        {!searching &&
          (counts.needs > 0 ? (
            <button
              type="button"
              aria-pressed={filters.needsOnly}
              onClick={() => setFilters((f) => ({ ...f, needsOnly: !f.needsOnly }))}
              className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border px-4 py-2.5 text-left transition-colors ${
                filters.needsOnly
                  ? 'border-amber-500 bg-amber-500 text-amber-950'
                  : 'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <AlertTriangle size={18} aria-hidden />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">Needs you</span>
                  {filters.needsOnly && (
                    <span className="text-xs font-normal opacity-80">Showing decisions</span>
                  )}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums ${
                    filters.needsOnly ? 'bg-amber-950/15 text-amber-950' : 'bg-amber-500 text-white'
                  }`}
                >
                  {counts.needs}
                </span>
                {filters.needsOnly && <X size={16} aria-hidden />}
              </span>
            </button>
          ) : (
            <p className="text-success flex items-center gap-1.5 px-1 text-sm">
              <CheckCircle2 size={16} aria-hidden />
              Nothing needs you
            </p>
          ))}

        {/* All · Not confirmed · Confirmed - counts always match Overview (master_plan §2BH B). */}
        <div
          role="tablist"
          aria-label="Status"
          className={`bg-surface-muted border-border grid grid-cols-3 gap-1 rounded-2xl border p-1 transition-opacity ${searching ? 'opacity-50' : ''}`}
        >
          {STATUS_ORDER.map((key) => {
            const active = filters.status === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilters((f) => ({ ...f, status: key }))}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-center transition-colors ${
                  active
                    ? 'vp-gradient text-white shadow-sm'
                    : 'text-foreground-muted hover:text-foreground'
                }`}
              >
                <span className="text-xs leading-tight font-semibold">
                  {STATUS_VIEW_LABELS[key]}
                </span>
                <span className="text-base font-bold tabular-nums">{counts[key]}</span>
              </button>
            );
          })}
        </div>

        <p className="text-foreground-muted px-1 text-xs">
          {searching
            ? 'Searching all entries'
            : filters.needsOnly
              ? NEEDS_CAPTION
              : STATUS_VIEW_CAPTIONS[filters.status]}
        </p>

        {!searching && filters.needsOnly && counts.needs > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(NEEDS_REASON_SHORT) as NeedsReason[])
              .filter((reason) => counts.reasons[reason] > 0)
              .map((reason) => {
                const active = filters.reasons.includes(reason);
                return (
                  <button
                    key={reason}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setFilters((f) => ({ ...f, reasons: toggleIn(f.reasons, reason) }))
                    }
                    className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold tabular-nums transition-colors ${
                      active
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-foreground-muted hover:text-foreground'
                    }`}
                  >
                    {NEEDS_REASON_SHORT[reason]} {counts.reasons[reason]}
                  </button>
                );
              })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDivisionsSheet('pick')}
            className="border-border bg-surface text-foreground hover:bg-surface-muted inline-flex min-h-11 max-w-[9.5rem] items-center gap-1 rounded-xl border px-3 text-sm font-medium"
          >
            <span className="truncate">{divisionsButtonLabel(divisions, filters.divisions)}</span>
            <ChevronDown size={14} aria-hidden className="shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => setShowFilterSheet(true)}
            aria-label="Filter"
            className="border-border bg-surface text-foreground hover:bg-surface-muted relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-2.5"
          >
            <SlidersHorizontal size={16} aria-hidden />
            {refineCount > 0 && (
              <span
                className="bg-primary absolute -top-1.5 -right-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white"
                aria-label={`${refineCount} filter${refineCount === 1 ? '' : 's'} applied`}
              >
                {refineCount}
              </span>
            )}
          </button>
          <Button
            type="button"
            onClick={() => setShowAddEntry(true)}
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 px-3 py-0 text-sm"
          >
            <UserPlus size={15} aria-hidden />
            Add entry
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-foreground-muted text-xs tabular-nums">{visible.length} shown</p>
        {canVerifySeveral && !selectMode && (
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className="text-primary min-h-9 text-xs font-semibold"
          >
            Verify several
          </button>
        )}
      </div>

      {bulkResult && (
        <p
          role={bulkResult.tone === 'danger' ? 'alert' : undefined}
          className={`text-xs ${bulkResult.tone === 'danger' ? 'text-danger' : 'text-success'}`}
        >
          {bulkResult.text}
        </p>
      )}

      {visible.length === 0 ? (
        filters.needsOnly && !searching ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl px-4 py-10 text-center">
            <CheckCircle2 size={28} className="text-success" aria-hidden />
            <p className="text-foreground text-sm font-semibold">All caught up</p>
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, needsOnly: false }))}
              className="text-primary min-h-11 text-sm font-semibold"
            >
              Show all
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-2xl px-4 py-10 text-center">
            <p className="text-foreground-muted text-sm">No entries match</p>
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="text-primary min-h-11 text-sm font-semibold"
            >
              Clear filters
            </button>
          </div>
        )
      ) : (
        <ul className="border-border divide-border divide-y overflow-hidden rounded-2xl border">
          {visible.map((r) => (
            <EntryRow
              key={r.id}
              entry={r}
              onOpen={() => setOpenId(r.id)}
              selectMode={selectMode}
              selected={selectedIds.has(r.id)}
              onToggleSelect={() => toggleSelected(r.id)}
            />
          ))}
        </ul>
      )}

      {selected && (
        <TeamCard
          tournamentId={tournamentId}
          reg={selected}
          divisions={eligibilityDivisions}
          onClose={() => setOpenId(null)}
        />
      )}

      {showAddEntry && (
        <AddEntryWizard
          tournamentId={tournamentId}
          divisions={addEntryDivisions}
          onClose={() => setShowAddEntry(false)}
        />
      )}

      {showDivisionsSheet && (
        <DivisionsSheet
          divisions={divisions}
          selected={filters.divisions}
          mode={showDivisionsSheet}
          onChange={(ids) => setFilters((f) => ({ ...f, divisions: ids }))}
          onClose={() => setShowDivisionsSheet(null)}
        />
      )}

      {showFilterSheet && (
        <FilterSheet
          filters={filters}
          sort={sort}
          onApply={(nextFilters, nextSort) => {
            setFilters(nextFilters);
            setSort(nextSort);
          }}
          onClose={() => setShowFilterSheet(false)}
          previewCount={(f) => filterEntries(registrations, f).length}
        />
      )}

      {/* Sticky bulk-verify bar (master_plan §2AQ Decision E) - fixed above the tab bar, with the
          safe-area inset so it never sits under a phone's home indicator. */}
      {selectMode && (
        <div className="border-border bg-surface fixed inset-x-0 bottom-16 z-20 flex items-center justify-between gap-3 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg">
          <span className="text-foreground text-sm font-semibold tabular-nums">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exitSelectMode}
              disabled={bulkPending}
              className="border-border text-foreground hover:bg-surface-muted inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={runBulkVerify}
              disabled={bulkPending || selectedIds.size === 0}
              className="vp-gradient inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white transition-colors disabled:opacity-60"
            >
              {bulkPending ? 'Verifying…' : 'Verify receipts'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One entry, scannable in a glance (master_plan §2BH Decision F/row spec): stacked avatars, names with
 * nicknames, `Division · money read`, one verdict pill, and - only when needed - a third line of tiny
 * muted flag labels (never icon-only). The whole row is the control; in select mode a row with a
 * submitted receipt gets a checkbox and toggles selection instead of opening `TeamCard`.
 */
function EntryRow({
  entry,
  onOpen,
  selectMode,
  selected,
  onToggleSelect,
}: {
  entry: OrganizerRegistration;
  onOpen: () => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const verdict = entryVerdict(entry);
  const flags = entryFlags(entry).slice(0, 2);
  const openSeat = hasOpenSeat(entry);
  const selectable = hasSubmittedReceipt(entry);

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (selectMode) {
            if (selectable) onToggleSelect();
            return;
          }
          onOpen();
        }}
        disabled={selectMode && !selectable}
        className={`hover:bg-surface-muted flex w-full items-center gap-3 px-3 py-3 text-left ${
          selectMode && !selectable ? 'opacity-50' : ''
        }`}
      >
        {selectMode && selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${teamLabel(entry)} for bulk verify`}
            className="h-4 w-4 shrink-0"
          />
        )}

        <span className="flex -space-x-3">
          {entry.members.map((m) => (
            <PlayerAvatar
              key={m.id}
              url={m.avatarUrl}
              initials={
                m.name
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || '?'
              }
              name={m.name}
              size="sm"
              className="ring-surface ring-2"
            />
          ))}
          {openSeat && <OpenSeatAvatar />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="text-foreground block truncate text-sm font-semibold">
            {entry.members.map((m, i) => {
              const d = memberDisplay(m);
              return (
                <span key={m.id}>
                  {i > 0 && ' & '}
                  {d.name}
                  {d.nickname && <span className="text-primary"> &ldquo;{d.nickname}&rdquo;</span>}
                </span>
              );
            })}
            {openSeat && <span className="text-foreground-muted font-normal"> & Open seat</span>}
          </span>
          <span className="text-foreground-muted mt-0.5 block truncate text-xs">
            {entry.divisionName} · {moneyRead(entry)}
          </span>
          {flags.length > 0 && (
            <span className="text-foreground-muted mt-0.5 flex items-center gap-1 overflow-hidden text-[11px] whitespace-nowrap">
              {flags.map((flag, i) => {
                const Icon = FLAG_ICON[flag];
                return (
                  <span key={flag} className="inline-flex shrink-0 items-center gap-1">
                    {i > 0 && <span aria-hidden>·</span>}
                    <Icon size={12} className="shrink-0" aria-hidden />
                    <span className="truncate">{ENTRY_FLAG_LABELS[flag]}</span>
                  </span>
                );
              })}
            </span>
          )}
        </span>

        {!selectMode && (
          <span className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${VERDICT_TONE_STYLES[verdict.tone]}`}
            >
              {verdict.label}
            </span>
          </span>
        )}

        {!selectMode && (
          <ChevronRight size={16} className="text-foreground-muted shrink-0" aria-hidden />
        )}
      </button>
    </li>
  );
}
