'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  UserPlus,
  X,
} from 'lucide-react';
import { OFFICIAL_ACHIEVEMENTS } from '@vouchplay/config';
import {
  ELIGIBILITY_RESULT_LABELS,
  HARD_RULE_LABELS,
  REASON_LABELS,
  FLAG_LABELS,
  type SeatSummary,
  type SeatState,
} from '@vouchplay/core';
import {
  confirmRegistration,
  rejectRegistration,
  approveRegistrationCancellation,
  declineRegistrationCancellation,
  revertConfirmation,
  restoreRegistration,
} from '@/lib/actions/registration';
import {
  approveEligibility,
  reclassifyRegistration,
  requestSkillReviewForRegistration,
  undoEligibilityApproval,
} from '@/lib/actions/eligibility';
import { issueOfficialAchievement } from '@/lib/actions/achievements';
import {
  verifyPayment,
  rejectPayment,
  markRefunded,
  getProofSignedUrl,
  verifyPaymentsBulk,
  unverifyPayment,
  restorePayment,
  markSeatPaid,
  undoSeatPaid,
} from '@/lib/actions/payment';
import type { OrganizerRegistration } from '@/lib/tournaments/registration-queries';
import { AddEntryWizard, type AddEntryDivisionOption } from './add-entry-wizard';
import {
  amountLabel,
  clearAllEntryFilters,
  clearEntryFilter,
  countEntries,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  describeEntryChips,
  ELIGIBILITY_LABELS,
  filterEntries,
  hasOpenSeat,
  hasUnconfirmedPartner,
  moneyTag,
  sortEntries,
  STATUS_LABELS,
  statusChip,
  teamLabel,
  type EligKind,
  type EntryFilterGroup,
  type EntryFilters,
  type EntrySort,
  type EntrySortKey,
  type RegStatus,
  type StatusChip,
} from '@/lib/tournaments/entry-view';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { OverflowMenu, type OverflowMenuAction } from '@/components/ui/overflow-menu';
import { AssignPartnerForm } from './assign-partner-form';
import { PlayerAvatar } from '@/components/players/player-avatar';

export interface EligibilityDivisionOption {
  id: string;
  name: string;
  format: string;
  teamSize: number;
}

/** One division's slot picture for the capacity strip (master_plan §2AG/A5) - "where do we stand?" */
export interface DivisionCapacityRow {
  id: string;
  name: string;
  capacity: number;
  registered: number;
  paid: number;
  pending: number;
}

/** Broad enough to structurally accept both the pre-§2BE actions' `{ok?, error?, message?}` shape and
 *  the new `OrganizerActionResult` union (`@/lib/tournaments/organizer-types`, lane 3) - `note` is the
 *  capacity/skill-fit note some actions (reclassify, restore) now return on success. */
type ActionResult = { ok?: boolean; error?: string; message?: string; note?: string };

const SORT_OPTIONS: { key: EntrySortKey; label: string }[] = [
  { key: 'needs_me', label: 'Needs me first' },
  { key: 'name', label: 'Name' },
  { key: 'division', label: 'Division' },
  { key: 'status', label: 'Status' },
  { key: 'registered_at', label: 'Registered at' },
  { key: 'amount', label: 'Amount' },
  { key: 'eligibility', label: 'Eligibility' },
  { key: 'payment', label: 'Payment' },
];

const STATUS_OPTIONS: RegStatus[] = [
  'payment_pending',
  'payment_submitted',
  'confirmed',
  'waitlisted',
  'withdrawn',
  'rejected',
];
const ELIGIBILITY_OPTIONS: EligKind[] = [
  'eligible',
  'review',
  'skill_mismatch',
  'ineligible_hard_rule',
];

/** Toggles `value` into/out of an array - the OR-within-a-group building block every chip uses. */
function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

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

/** One labelled group of multi-select chips (Division/Status/Eligibility/Payment/Partner/Requests).
 *  Reuses the app's chip visual (see `search-filters.tsx` `TogglePill`/removable-chip pattern) so this
 *  filter bar reads as the same control language as the players directory. */
function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: readonly T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div>
      <span className="text-foreground-muted flex items-center gap-1.5 text-xs font-semibold">
        {label}
        {selected.length > 0 && (
          <span className="bg-primary inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white">
            {selected.length}
          </span>
        )}
      </span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(o.value)}
              className={`inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-foreground-muted hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {active && <Check size={12} aria-hidden className="text-primary shrink-0" />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Division capacity strip: one glance at "where do we stand on slots" per division. Collapsed by
 * default behind a one-line summary (master_plan §2AP Decision I) - the per-division rows are detail
 * an organizer opens for, not something that should push the list down the page on every visit.
 * Tapping a row toggles that division into the filter, the same as tapping a Division chip.
 */
function CapacityStrip({
  divisions,
  activeIds,
  onToggle,
}: {
  divisions: DivisionCapacityRow[];
  activeIds: readonly string[];
  onToggle: (id: string) => void;
}) {
  if (divisions.length === 0) return null;
  const totalRegistered = divisions.reduce((sum, d) => sum + d.registered, 0);
  const totalCapacity = divisions.reduce((sum, d) => sum + d.capacity, 0);
  const totalPaid = divisions.reduce((sum, d) => sum + d.paid, 0);
  return (
    <details className="group border-border overflow-hidden rounded-2xl border">
      <summary className="hover:bg-surface-muted flex min-h-11 w-full cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
        <span className="text-foreground font-medium">
          Divisions ({divisions.length}) · {totalRegistered}/{totalCapacity} entered · {totalPaid}{' '}
          fully paid
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className="text-foreground-muted shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <ul className="border-border divide-border divide-y border-t">
        {divisions.map((d) => {
          const pct = d.capacity > 0 ? Math.min(100, (d.registered / d.capacity) * 100) : 0;
          const warn = d.capacity > 0 && d.registered / d.capacity >= 0.9;
          const active = activeIds.includes(d.id);
          return (
            <li key={d.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onToggle(d.id)}
                className={`hover:bg-surface-muted flex min-h-11 w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors ${
                  active ? 'bg-primary/5' : ''
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-foreground truncate text-sm font-medium">{d.name}</span>
                  <span className="text-foreground shrink-0 text-sm font-bold tabular-nums">
                    {d.registered} / {d.capacity}
                  </span>
                </span>
                <span className="text-foreground-muted flex items-center justify-between gap-2 text-[11px]">
                  <span>
                    {d.registered} registered · {d.paid} paid · {d.pending} pending
                  </span>
                </span>
                <span className="bg-surface-muted h-1.5 w-full overflow-hidden rounded-full">
                  <span
                    className={`block h-full rounded-full ${warn ? 'bg-warning' : 'bg-primary'}`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/**
 * Organizer registrations (handover §26.4, master_plan §1Z, §2AG/A5, §2AQ Decision D/E).
 *
 * Rebuilt as a list of rows plus a detail sheet, the shape a form-response tool uses, because the
 * previous screen expanded every entry inline: withdrawn entries filled the page by default, the
 * people in a team were buried under controls, and there was no way to see the applicants at a
 * glance or to find the ones that needed a decision.
 *
 * The organising principle is: the list answers "who is here and what needs me?", and the sheet
 * answers "everything about this one entry". Nothing that needs a decision is more than two taps
 * away, and nothing that does not need a decision takes up space. §2AQ cut the sheet down further:
 * one status line instead of a raw-status line, at most two primary buttons per state, and every
 * rare action (confirm without payment, reject, refund, request a skill review, assign a partner)
 * moved into one overflow (⋯) menu.
 */
export function OrganizerRegistrations({
  tournamentId,
  registrations,
  eligibilityDivisions,
  divisions,
}: {
  tournamentId: string;
  registrations: OrganizerRegistration[];
  /** Divisions for the reclassify control in the detail sheet - unrelated to the filter bar. */
  eligibilityDivisions: EligibilityDivisionOption[];
  /** Per-division capacity + counts for the strip and the Division filter chips. */
  divisions: DivisionCapacityRow[];
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<EntryFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<EntrySort>(DEFAULT_SORT);
  const [showFilters, setShowFilters] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Bulk verify (master_plan §2AQ Decision E) - a "Select" mode over the list, independent of the
  // detail sheet above.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  );
  // master_plan §2BE Decision C: "Add entry" - built from data this screen already loaded (capacity
  // strip + the reclassify picker's format/team-size), no extra query.
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

  const visible = sortEntries(filterEntries(registrations, filters), sort);
  const selected = registrations.find((r) => r.id === openId) ?? null;
  const chips = describeEntryChips(filters, divisions);
  // §2AQ Decision D: how many open entries have asked to cancel, for the amber pill next to Filters.
  const entryCounts = countEntries(registrations);
  const wantsToCancelCount = entryCounts.wantsToCancel;
  // §2BE Decision E: how many open entries carry an unverified (guest) member, for the matching pill.
  const unverifiedAccountCount = entryCounts.unverifiedAccounts;
  // True only while the default "Has receipt" filter is the sole thing narrowing the list, so the
  // count line can say what it's showing instead of the generic "shown" (master_plan §2AP Decision I).
  const isDefaultReceiptFilterOnly =
    filters.payment.length === 1 &&
    filters.payment[0] === 'has_proof' &&
    filters.divisions.length === 0 &&
    filters.statuses.length === 0 &&
    filters.eligibility.length === 0 &&
    filters.partner.length === 0 &&
    filters.requests.length === 0 &&
    !filters.includeClosed &&
    filters.search.trim() === '';
  const activeGroupCount =
    Number(filters.divisions.length > 0) +
    Number(filters.statuses.length > 0) +
    Number(filters.eligibility.length > 0) +
    Number(filters.payment.length > 0) +
    Number(filters.partner.length > 0) +
    Number(filters.requests.length > 0) +
    Number(filters.includeClosed);

  function toggleDivision(id: string) {
    setFilters((f) => ({ ...f, divisions: toggleIn(f.divisions, id) }));
  }
  function removeChip(group: EntryFilterGroup, value: string) {
    setFilters((f) => clearEntryFilter(f, group, value));
  }

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

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={15}
          className="text-foreground-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          aria-hidden
        />
        <input
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          placeholder="Search a player or team"
          aria-label="Search registrations by player name"
          className="border-border bg-background text-foreground placeholder:text-foreground-muted min-h-11 w-full rounded-xl border pr-3 pl-9 text-sm"
        />
      </div>

      {/* Division capacity strip - the "where do we stand on slots" view (§2AG/A5). */}
      <CapacityStrip
        divisions={divisions}
        activeIds={filters.divisions}
        onToggle={toggleDivision}
      />

      {/* Sort - outside the collapsible filter sheet, an organizer should always be able to reorder. */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="entry-sort" className="text-foreground-muted text-xs font-semibold">
          Sort
        </label>
        <select
          id="entry-sort"
          value={sort.key}
          onChange={(e) => setSort({ ...sort, key: e.target.value as EntrySortKey })}
          className="border-border bg-background text-foreground min-h-11 rounded-xl border px-3 text-xs"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}
          aria-label={
            sort.dir === 'asc'
              ? 'Sort ascending, tap for descending'
              : 'Sort descending, tap for ascending'
          }
          className="border-border text-foreground-muted hover:text-foreground inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-2.5"
        >
          <ChevronDown
            size={16}
            aria-hidden
            className={`transition-transform ${sort.dir === 'asc' ? 'rotate-180' : ''}`}
          />
        </button>
        <div className="ml-auto flex items-center gap-2">
          {/* §2AQ Decision D: a paid-or-holding entry that has asked to cancel is worth real money -
              this pill surfaces the count and applies the Requests filter in one tap. */}
          {wantsToCancelCount > 0 && (
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, requests: ['wants_to_cancel'] }))}
              className="border-warning/40 bg-warning/10 text-warning inline-flex min-h-11 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold"
            >
              <TriangleAlert size={12} aria-hidden />
              {wantsToCancelCount} want{wantsToCancelCount === 1 ? 's' : ''} to cancel
            </button>
          )}
          {/* §2BE Decision E: same pattern as "wants to cancel" - a count pill that applies the
              matching Requests filter in one tap. */}
          {unverifiedAccountCount > 0 && (
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, requests: ['unverified_account'] }))}
              className="border-warning/40 bg-warning/10 text-warning inline-flex min-h-11 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold"
            >
              <TriangleAlert size={12} aria-hidden />
              {unverifiedAccountCount} unverified
            </button>
          )}
          {/* master_plan §2BE Decision C: build a team for an existing account without waiting for
              them to self-register. */}
          <Button
            type="button"
            onClick={() => setShowAddEntry(true)}
            className="inline-flex min-h-11 items-center gap-1.5 px-3 py-0 text-sm"
          >
            <UserPlus size={15} aria-hidden />
            Add entry
          </Button>
          {/* Bulk verify (master_plan §2AQ Decision E) - toggles select mode; Cancel in the sticky
              bar below exits it too. */}
          <button
            type="button"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            aria-pressed={selectMode}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium ${
              selectMode
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border bg-surface text-foreground hover:bg-surface-muted'
            }`}
          >
            {selectMode ? 'Cancel select' : 'Select'}
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className="border-border bg-surface text-foreground hover:bg-surface-muted inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium"
          >
            <SlidersHorizontal size={15} aria-hidden />
            Filters
            {activeGroupCount > 0 && (
              <span
                className="bg-primary inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white"
                aria-label={`${activeGroupCount} filter group${activeGroupCount === 1 ? '' : 's'} applied`}
              >
                {activeGroupCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Active filters, individually removable - a filter you cannot see is a filter you cannot
          undo. Rendered above the list regardless of whether the sheet is open. */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={`${chip.group}:${chip.value}`}
              type="button"
              onClick={() => removeChip(chip.group, chip.value)}
              className="border-primary/40 bg-primary/10 text-foreground hover:border-primary inline-flex min-h-11 items-center gap-1 rounded-full border px-2.5 text-xs font-medium"
            >
              {chip.label}
              <X size={12} aria-hidden />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFilters(clearAllEntryFilters())}
            className="text-foreground-muted hover:text-foreground min-h-11 px-1.5 text-xs font-medium underline underline-offset-2"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Filter groups - collapsed into a disclosure so the default screen stays short on a phone. */}
      {showFilters && (
        <div className="border-border space-y-4 rounded-2xl border border-dashed p-3">
          <ChipGroup
            label="Division"
            options={divisions.map((d) => ({ value: d.id, label: d.name }))}
            selected={filters.divisions}
            onToggle={toggleDivision}
          />
          <ChipGroup
            label="Status"
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            selected={filters.statuses}
            onToggle={(s) => setFilters((f) => ({ ...f, statuses: toggleIn(f.statuses, s) }))}
          />
          <ChipGroup
            label="Eligibility"
            options={ELIGIBILITY_OPTIONS.map((k) => ({ value: k, label: ELIGIBILITY_LABELS[k] }))}
            selected={filters.eligibility}
            onToggle={(k) => setFilters((f) => ({ ...f, eligibility: toggleIn(f.eligibility, k) }))}
          />
          <ChipGroup
            label="Payment"
            options={[
              { value: 'has_proof' as const, label: 'Has receipt' },
              { value: 'no_proof' as const, label: 'No receipt' },
              // Seat-level payment states (master_plan §2AO A6) - on top of the older
              // has-a-receipt/no-receipt pair, so an organizer can find "still owes a top-up" teams.
              { value: 'partial' as const, label: 'Partially paid' },
              { value: 'paid' as const, label: 'Fully paid' },
            ]}
            selected={filters.payment}
            onToggle={(p) => setFilters((f) => ({ ...f, payment: toggleIn(f.payment, p) }))}
          />
          <ChipGroup
            label="Partner confirmed"
            options={[
              { value: 'confirmed' as const, label: 'Confirmed' },
              { value: 'unconfirmed' as const, label: 'Not confirmed' },
              { value: 'none' as const, label: 'No partner yet' },
            ]}
            selected={filters.partner}
            onToggle={(p) => setFilters((f) => ({ ...f, partner: toggleIn(f.partner, p) }))}
          />
          {/* §2AQ Decision D: entries whose player asked to cancel - `queuesFor` already surfaces
              `cancellation_requested`, this just gives it its own combinable chip. §2BE Decision E
              adds "Unverified account" alongside it - same "needs the organizer's eye" shape. */}
          <ChipGroup
            label="Requests / Accounts"
            options={[
              { value: 'wants_to_cancel' as const, label: 'Wants to cancel' },
              { value: 'unverified_account' as const, label: 'Unverified account' },
            ]}
            selected={filters.requests}
            onToggle={(v) => setFilters((f) => ({ ...f, requests: toggleIn(f.requests, v) }))}
          />
          {/* Legacy switch, kept alongside Status (handover A5): only decides visibility when no
              Status chip is picked - picking one is a more specific ask and wins outright. */}
          <label className="text-foreground-muted flex min-h-11 cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={filters.includeClosed}
              onChange={(e) => setFilters({ ...filters, includeClosed: e.target.checked })}
              className="h-4 w-4"
            />
            Show cancelled and withdrawn
          </label>
        </div>
      )}

      <p className="text-foreground-muted text-xs">
        {visible.length} {isDefaultReceiptFilterOnly ? 'with receipts' : 'shown'}
      </p>

      {bulkResult && (
        <p
          role={bulkResult.tone === 'danger' ? 'alert' : undefined}
          className={`text-xs ${bulkResult.tone === 'danger' ? 'text-danger' : 'text-success'}`}
        >
          {bulkResult.text}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="text-foreground-muted text-sm">Nothing here. Try a different filter.</p>
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
        <Modal
          title={teamLabel(selected)}
          subtitle={selected.divisionName}
          onClose={() => setOpenId(null)}
          align="center"
        >
          <RegRow tournamentId={tournamentId} reg={selected} divisions={eligibilityDivisions} />
        </Modal>
      )}

      {showAddEntry && (
        <AddEntryWizard
          tournamentId={tournamentId}
          divisions={addEntryDivisions}
          onClose={() => setShowAddEntry(false)}
        />
      )}

      {/* Sticky bulk-verify bar (master_plan §2AQ Decision E) - fixed above the tab bar so it never
          scrolls away while an organizer is mid-selection. */}
      {selectMode && (
        <div className="border-border bg-surface fixed inset-x-0 bottom-16 z-20 flex items-center justify-between gap-3 border-t px-4 py-3 shadow-lg">
          <span className="text-foreground text-sm font-semibold">{selectedIds.size} selected</span>
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

const TONE_STYLES: Record<StatusChip['tone'], string> = {
  action: 'border-warning/40 bg-warning/10 text-warning',
  waiting: 'border-border text-foreground-muted',
  done: 'border-success/30 bg-success/10 text-success',
  closed: 'border-border text-foreground-muted opacity-70',
};

/**
 * Fallback labels for reason codes not yet in the shared `@vouchplay/core` map (master_plan §2AO
 * Decision C: `PLAYING_DOWN_ONE_LEVEL` ships from the core/eligibility lane built in parallel with
 * this one). Merged in ahead of `REASON_LABELS` so this screen reads correctly whether or not that
 * lane has landed yet; once it does, the two copies should read the same and this entry becomes an
 * inert duplicate rather than a missing label.
 */
const REASON_LABEL_FALLBACK: Record<string, string> = {
  PLAYING_DOWN_ONE_LEVEL: 'Entered one level below their skill - assess before confirming',
};

function reasonLabel(code: string): string {
  return REASON_LABELS[code as keyof typeof REASON_LABELS] ?? REASON_LABEL_FALLBACK[code] ?? code;
}

/**
 * master_plan §2AU Decision F: guest entries (email verified at the very end, §2AU) show an
 * "Unverified account" chip - money is still money, so nothing here withholds a confirmation, it
 * only tells the organizer what they're looking at. `members[].unverified` and the entry's
 * `partnerNote` (a named-but-not-yet-invited partner, §2AU Decision D) are lane B's additive fields
 * on `OrganizerRegistration`; read defensively here so this file type-checks whether or not that
 * lane has landed yet - both simply read as absent (no chip, no note) until the columns arrive.
 */
/** master_plan §2BE Decision A: `members[].communitySkill`/`members[].email` are lane 3's additive
 *  fields on `OrganizerRegistration` - read defensively (same posture as `unverified` above) so this
 *  file type-checks whether or not that lane has landed yet; `communitySkill` simply reads as
 *  "Unrated" until it arrives. */
type GuestAwareMember = OrganizerRegistration['members'][number] & {
  unverified?: boolean;
  communitySkill?: string | null;
};
type GuestAwareEntry = OrganizerRegistration & { partnerNote?: string | null };

function entryMembers(entry: OrganizerRegistration): GuestAwareMember[] {
  return entry.members as GuestAwareMember[];
}
function hasUnverifiedMember(entry: OrganizerRegistration): boolean {
  return entryMembers(entry).some((m) => m.unverified === true);
}
function partnerNoteFor(entry: OrganizerRegistration): string | null {
  return (entry as GuestAwareEntry).partnerNote ?? null;
}

function UnverifiedAccountChip() {
  return (
    <span className="border-warning/30 bg-warning/10 text-foreground-muted inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold">
      Unverified account
    </span>
  );
}

/**
 * One entry, scannable in a glance: who, which division, what it needs, how much. The whole row is
 * the control - a small "Manage" link beside a tall row is a smaller target than the row itself.
 *
 * In select mode (master_plan §2AQ Decision E) a row with a submitted receipt gets a checkbox and
 * the row toggles selection instead of opening the detail sheet; a row with nothing to verify is
 * dimmed and inert.
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
  const chip = statusChip(entry);
  const money = moneyTag(entry);
  const amount = amountLabel(entry);
  const openSeat = hasOpenSeat(entry);
  const unconfirmed = !openSeat && hasUnconfirmedPartner(entry);
  const selectable = hasSubmittedReceipt(entry);
  const unverified = hasUnverifiedMember(entry);
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
        <span className="min-w-0 flex-1">
          <span className="text-foreground block truncate text-sm font-semibold">
            {teamLabel(entry)}
          </span>
          <span className="text-foreground-muted mt-0.5 block truncate text-xs">
            {entry.divisionName}
            {amount ? ` · ${amount}` : ''}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_STYLES[chip.tone]}`}
            >
              {chip.label}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_STYLES[money.tone]}`}
            >
              {money.label}
            </span>
            {unverified && <UnverifiedAccountChip />}
            {openSeat && (
              <span className="border-border text-foreground-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
                <Clock size={10} aria-hidden />
                No partner yet
              </span>
            )}
            {unconfirmed && (
              <span className="border-border text-foreground-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
                <Clock size={10} aria-hidden />
                Partner not confirmed
              </span>
            )}
            {entry.eligibilityStatus !== 'eligible' && (
              <span className="border-warning/40 bg-warning/10 text-warning inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                <TriangleAlert size={10} aria-hidden />
                {statusToLabel(entry.eligibilityStatus)}
              </span>
            )}
          </span>
        </span>
        {!selectMode && (
          <ChevronRight size={16} className="text-foreground-muted shrink-0" aria-hidden />
        )}
      </button>
    </li>
  );
}

const ELIG_STYLES: Record<string, string> = {
  eligible: 'bg-success/10 text-success border-success/30',
  review: 'bg-warning/10 text-warning border-warning/30',
  skill_mismatch: 'bg-warning/10 text-warning border-warning/30',
  ineligible_hard_rule: 'bg-danger/10 text-danger border-danger/30',
};

interface SnapshotPlayer {
  playerId: string;
  result: string;
  communitySkillLevel: number | null;
  sts: number;
  uniqueVoucherCount: number;
  skillVerified: boolean;
  hardRuleCodes: string[];
  reasonCodes: string[];
  flags: string[];
}
interface Snapshot {
  result?: string;
  hardRuleCodes?: string[];
  reasonCodes?: string[];
  flags?: string[];
  players?: SnapshotPlayer[];
  override?: { by: string; at: string; reason: string | null } | null;
}

const CLOSED_REG_STATUSES = new Set(['withdrawn', 'cancelled', 'rejected', 'refunded']);

function RegRow({
  tournamentId,
  reg,
  divisions,
}: {
  tournamentId: string;
  reg: OrganizerRegistration;
  divisions: EligibilityDivisionOption[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // ⋯ overflow inline panels (master_plan §2BE Decision A/B) - one open at a time in spirit, each
  // toggled by its own overflow item.
  const [showReclassify, setShowReclassify] = useState(false);
  const [reclassDiv, setReclassDiv] = useState('');
  const [reclassReason, setReclassReason] = useState('');
  const [showConfirmEntry, setShowConfirmEntry] = useState(false);
  const [showRevert, setShowRevert] = useState(false);
  const [revertReason, setRevertReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');
  const [showRestore, setShowRestore] = useState(false);
  const [restoreReason, setRestoreReason] = useState('');
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [showApproveCancel, setShowApproveCancel] = useState(false);
  const [showAssignPartner, setShowAssignPartner] = useState(false);
  const [award, setAward] = useState<string>(OFFICIAL_ACHIEVEMENTS[0].key);

  function run(fn: () => Promise<ActionResult>) {
    setMsg(null);
    setNote(null);
    start(async () => {
      const res = await fn();
      setMsg(res.error ?? res.message ?? null);
      setNote(res.note ?? null);
      if (res.ok) router.refresh();
    });
  }

  const closed = CLOSED_REG_STATUSES.has(reg.status);
  const confirmed = reg.status === 'confirmed';
  const waitlisted = reg.status === 'waitlisted';
  const restorable = ['rejected', 'cancelled', 'withdrawn'].includes(reg.status);
  const nameById = new Map(reg.members.map((m) => [m.id, m.name]));
  const isFree = reg.amountDue == null || reg.amountDue <= 0;
  const openSeat = hasOpenSeat(reg);
  const partnerNote = partnerNoteFor(reg);

  const verifiedSlot = (reg.slots ?? []).find((s) => s.status === 'verified');
  const verifiedTarget: { kind: 'team' | 'slot'; id: string } | null =
    reg.paymentStatus === 'verified' && reg.paymentId
      ? { kind: 'team', id: reg.paymentId }
      : verifiedSlot
        ? { kind: 'slot', id: verifiedSlot.id }
        : null;

  const sameDivisionTargets = divisions.filter((d) => d.id !== reg.divisionId);
  const canConfirmWithoutPayment = !confirmed && !closed && !waitlisted;

  const overflowActions: OverflowMenuAction[] = [
    // master_plan §2BE Decision B: reclassify moves here, applies to every status, and now carries a
    // capacity note instead of a block.
    ...(sameDivisionTargets.length > 0
      ? [{ label: 'Reclassify division', onSelect: () => setShowReclassify((v) => !v) }]
      : []),
    ...(canConfirmWithoutPayment
      ? [
          {
            label: isFree ? 'Confirm entry' : 'Confirm without payment',
            onSelect: () => setShowConfirmEntry((v) => !v),
          },
        ]
      : []),
    // master_plan §2BE Decision B: every forward decision gets a way back.
    ...(confirmed
      ? [{ label: 'Move back to review', onSelect: () => setShowRevert((v) => !v) }]
      : []),
    // §2AQ Decision C: while a cancellation request is open, Approve cancellation / Decline is the
    // whole decision - "Reject entry" and "Refund payment" would just be two more ways to do the
    // same thing and read as noise.
    ...(!closed && !reg.cancellationRequest
      ? [
          {
            label: 'Reject entry',
            tone: 'danger' as const,
            onSelect: () => setShowReject((v) => !v),
          },
        ]
      : []),
    ...(restorable ? [{ label: 'Restore entry', onSelect: () => setShowRestore((v) => !v) }] : []),
    ...(verifiedTarget && !reg.cancellationRequest
      ? [
          {
            label: 'Refund payment',
            onSelect: () => {
              if (confirm('Mark this payment refunded?')) {
                run(() => markRefunded(verifiedTarget.id, tournamentId, '', verifiedTarget.kind));
              }
            },
          },
        ]
      : []),
    ...reg.members.map((m) => ({
      label: `Request skill review · ${m.name.split(/\s+/)[0]}`,
      onSelect: () => {
        setReviewFor((cur) => (cur === m.id ? null : m.id));
        setReviewReason('');
      },
    })),
  ];

  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50';
  const divisionChip =
    'border-border text-foreground-muted inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold';

  return (
    <div>
      {/* Header row (master_plan §2BE Decision A): division · format on the left, the ⋯ overflow of
          rare whole-entry moves on the right. */}
      <div className="flex items-start justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={divisionChip}>
            {reg.divisionName} · {reg.teamSize > 1 ? 'Doubles' : 'Singles'}
          </span>
          <span className="text-foreground-muted text-xs font-medium">{headerStatusWord(reg)}</span>
        </span>
        <OverflowMenu actions={overflowActions} />
      </div>

      {showReclassify && (
        <div className="border-border mt-2 space-y-2 rounded-lg border border-dashed p-2.5">
          <p className="text-foreground text-xs font-semibold">Reclassify division</p>
          <div className="flex flex-wrap gap-2">
            <select
              value={reclassDiv}
              onChange={(e) => setReclassDiv(e.target.value)}
              className="border-border bg-background rounded-lg border px-2.5 py-1.5 text-xs"
            >
              <option value="">Move to division…</option>
              {sameDivisionTargets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <input
              value={reclassReason}
              onChange={(e) => setReclassReason(e.target.value)}
              placeholder="Reason (optional)"
              className="border-border bg-background min-w-[10rem] flex-1 rounded-lg border px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
            />
            <button
              type="button"
              disabled={pending || !reclassDiv}
              onClick={() =>
                run(async () => {
                  const res = await reclassifyRegistration(
                    reg.id,
                    tournamentId,
                    reclassDiv,
                    reclassReason,
                  );
                  if (res.ok) setShowReclassify(false);
                  return res;
                })
              }
              className={`${btn} vp-gradient text-white`}
            >
              Move
            </button>
          </div>
        </div>
      )}

      {/* master_plan §2AU Decision D: a guest's partner is captured as a name only at entry time -
          invited for real once the guest verifies their own email - so the organizer sees who is
          meant to join without a second account existing yet. */}
      {partnerNote && !openSeat && (
        <p className="text-foreground-muted mt-1 text-xs">Partner: {partnerNote} (to be invited)</p>
      )}

      {/* Members (master_plan §2BE Decision A): one row per seat, avatar + name + community skill,
          Change ▾ for a filled seat or Add partner for an open one. */}
      <ul className="mt-2.5 space-y-2">
        {reg.members.map((m) => (
          <MemberRow key={m.id} member={m} />
        ))}
        {openSeat &&
          (partnerNote ? (
            <li className="text-foreground-muted text-xs">
              Partner: {partnerNote} (to be invited)
            </li>
          ) : (
            <li>
              {showAssignPartner ? (
                <AssignPartnerForm
                  teamId={reg.teamId}
                  tournamentId={tournamentId}
                  divisionId={reg.divisionId}
                  onClose={() => setShowAssignPartner(false)}
                />
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground-muted text-xs">Open seat</span>
                  <button
                    type="button"
                    onClick={() => setShowAssignPartner(true)}
                    className={`${btn} border-border text-foreground border`}
                  >
                    Add partner
                  </button>
                </div>
              )}
            </li>
          ))}
      </ul>

      {/* Eligibility (master_plan §2BE Decision A) - one chip, reasons always visible when not
          Eligible, Approve/Undo on the right. */}
      <EligibilityRow
        reg={reg}
        tournamentId={tournamentId}
        nameById={nameById}
        pending={pending}
        run={run}
      />

      {/* Payment (master_plan §2BE Decision A) - state line only; every action lives in Receipts
          below. */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-foreground text-xs font-semibold">Payment</span>
        <span className="text-foreground-muted text-xs">{paymentStateLine(reg)}</span>
      </div>

      {/* Receipts (master_plan §2AO A6, §2BE Decision A/B) - the team receipt, if any, plus one row
          per seat, each with its own Verify/Decline and now Undo/Restore. */}
      <ReceiptsBlock
        reg={reg}
        tournamentId={tournamentId}
        pending={pending}
        start={start}
        run={run}
        nameById={nameById}
        setMsg={setMsg}
      />

      {/* Cancellation request (§1Y, §2L, §2AP I, §2AQ Decision E) - the player's own reason, cut to
          one line: what they said, then what to do about it. */}
      {reg.cancellationRequest && (
        <div className="border-warning/40 bg-warning/10 mt-2 rounded-lg border p-2.5">
          <p className="text-warning flex items-center gap-1.5 text-xs font-semibold">
            <TriangleAlert size={13} aria-hidden />
            Cancellation requested
          </p>
          <p className="text-foreground mt-1 text-sm whitespace-pre-wrap">
            &ldquo;{reg.cancellationRequest.reason}&rdquo;
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowApproveCancel((v) => !v)}
              className={`${btn} bg-danger/90 text-white`}
            >
              Approve cancellation
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => declineRegistrationCancellation(reg.id, tournamentId))}
              className={`${btn} border-border text-foreground border`}
            >
              Decline
            </button>
          </div>
          {showApproveCancel && (
            <div className="border-border mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-2">
              <p className="text-foreground-muted text-xs">
                Cancel this entry? Any refund is settled with the player.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const res = await approveRegistrationCancellation(reg.id, tournamentId);
                    if (res.ok) setShowApproveCancel(false);
                    return res;
                  })
                }
                className={`${btn} bg-danger/90 text-white`}
              >
                Yes, cancel entry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Overflow-triggered inline panels below - one at a time in practice, each closes itself on
          success. */}
      {showConfirmEntry && (
        <div className="border-border mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-2">
          <p className="text-foreground-muted text-xs">
            {isFree ? 'Confirm this entry?' : 'Confirm this entry without a payment record?'}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await confirmRegistration(reg.id, tournamentId);
                if (res.ok) setShowConfirmEntry(false);
                return res;
              })
            }
            className={`${btn} vp-gradient text-white`}
          >
            Yes, confirm
          </button>
        </div>
      )}

      {showRevert && (
        <div className="mt-2 flex gap-2">
          <input
            value={revertReason}
            onChange={(e) => setRevertReason(e.target.value)}
            placeholder="Reason (required)"
            className="border-border bg-background flex-1 rounded-lg border px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <button
            type="button"
            disabled={pending || revertReason.trim().length < 3}
            onClick={() =>
              run(async () => {
                const res = await revertConfirmation(reg.id, tournamentId, revertReason.trim());
                if (res.ok) setShowRevert(false);
                return res;
              })
            }
            className={`${btn} bg-danger/90 text-white`}
          >
            Move back to review
          </button>
        </div>
      )}

      {showReject && !closed && (
        <div className="mt-2 flex gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="border-border bg-background flex-1 rounded-lg border px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await rejectRegistration(reg.id, tournamentId, reason);
                if (res.ok) setShowReject(false);
                return res;
              })
            }
            className={`${btn} bg-danger/90 text-white`}
          >
            Confirm reject
          </button>
        </div>
      )}

      {showRestore && (
        <div className="mt-2 flex gap-2">
          <input
            value={restoreReason}
            onChange={(e) => setRestoreReason(e.target.value)}
            placeholder="Reason (required)"
            className="border-border bg-background flex-1 rounded-lg border px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <button
            type="button"
            disabled={pending || restoreReason.trim().length < 3}
            onClick={() =>
              run(async () => {
                const res = await restoreRegistration(reg.id, tournamentId, restoreReason.trim());
                if (res.ok) setShowRestore(false);
                return res;
              })
            }
            className={`${btn} vp-gradient text-white`}
          >
            Restore entry
          </button>
        </div>
      )}

      {reviewFor && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={reviewReason}
            onChange={(e) => setReviewReason(e.target.value)}
            placeholder="Why this review? (required)"
            className="border-border bg-background min-w-[12rem] flex-1 rounded-lg border px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <button
            type="button"
            disabled={pending || !reviewReason.trim()}
            onClick={() => {
              const targetId = reviewFor;
              run(async () => {
                const res = await requestSkillReviewForRegistration(
                  reg.id,
                  tournamentId,
                  targetId as string,
                  reviewReason,
                );
                if (res.ok) setReviewFor(null);
                return res;
              });
            }}
            className={`${btn} vp-gradient text-white`}
          >
            Submit review
          </button>
        </div>
      )}

      {/* Awards (§9.4) - issue an official achievement to a confirmed team. */}
      {confirmed && (
        <div className="border-border mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed p-2">
          <span className="text-foreground-muted text-xs">Award:</span>
          <select
            value={award}
            onChange={(e) => setAward(e.target.value)}
            className="border-border bg-background rounded-lg border px-2 py-1 text-xs"
          >
            {OFFICIAL_ACHIEVEMENTS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => issueOfficialAchievement(tournamentId, reg.teamId, award))}
            className={`${btn} vp-gradient text-white`}
          >
            Issue
          </button>
        </div>
      )}

      {note && <p className="text-warning mt-1 text-xs">{note}</p>}
      {msg && <p className="text-foreground-muted mt-1 text-xs">{msg}</p>}
    </div>
  );
}

/** Header status word (master_plan §2BE Decision A): Confirmed / Under review / Unpaid / Rejected /
 *  Cancelled / Withdrawn / Waitlisted / Refunded, derived from status + `paymentSummary`. */
function headerStatusWord(reg: OrganizerRegistration): string {
  const map: Record<string, string> = {
    confirmed: 'Confirmed',
    waitlisted: 'Waitlisted',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    withdrawn: 'Withdrawn',
    refunded: 'Refunded',
  };
  if (map[reg.status]) return map[reg.status] as string;
  const summary = reg.paymentSummary;
  if (summary && (summary.submittedSeats > 0 || summary.teamReceipt === 'submitted')) {
    return 'Under review';
  }
  return 'Unpaid';
}

/** Payment row's one-line state (master_plan §2BE Decision A) - "1 of 2 paid" / "Paid" / "Waiting for
 *  payment" / "Free division"; no buttons here, every action lives in the Receipts block below. */
function paymentStateLine(reg: OrganizerRegistration): string {
  if (reg.amountDue == null || reg.amountDue <= 0) return 'Free division';
  const summary = reg.paymentSummary;
  if (!summary) return moneyTag(reg).label;
  if (summary.state === 'refunded') return 'Refunded';
  if (summary.state === 'declined') return 'Payment declined';
  if (summary.state === 'paid') {
    return summary.totalSeats > 1 ? `${summary.paidSeats} of ${summary.totalSeats} paid` : 'Paid';
  }
  if (summary.state === 'partial') return `${summary.paidSeats} of ${summary.totalSeats} paid`;
  if (summary.submittedSeats > 0 || summary.state === 'submitted') {
    return 'Receipt submitted - review below';
  }
  return 'Waiting for payment';
}

/** One member's row in the roster card (master_plan §2BE Decision A): avatar, name, community skill,
 *  and a muted "Change ▾" menu. Replace/Remove are disabled until migration 0051 (Phase B) ships the
 *  `organizer_replace_member`/`organizer_remove_member` RPCs - shown, not hidden, so the organizer
 *  knows the power is coming rather than wondering if it was missed. */
function MemberRow({ member }: { member: OrganizerRegistration['members'][number] }) {
  const m = member as GuestAwareMember;
  const initials =
    m.name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2">
        <PlayerAvatar url={m.avatarUrl} initials={initials} name={m.name} size="sm" />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            {m.slug ? (
              <Link
                href={`/players/${m.slug}`}
                className="text-foreground hover:text-primary truncate text-sm font-medium"
              >
                {m.name}
              </Link>
            ) : (
              <span className="text-foreground truncate text-sm font-medium">{m.name}</span>
            )}
            {m.unverified === true && <UnverifiedAccountChip />}
          </span>
          <span className="text-foreground-muted block text-xs">
            Community: {m.communitySkill ?? 'Unrated'}
          </span>
        </span>
      </span>
      <SeatChangeMenu name={m.name} />
    </li>
  );
}

/** A tiny local "Change ▾" dropdown - not the shared `OverflowMenu` (that one is icon-only, `⋯`),
 *  since the sketch calls for a labelled muted control here. Both items are disabled until Phase B
 *  (migration 0051) - honest about what is not built yet rather than hiding the power entirely. */
function SeatChangeMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const first = name.split(/\s+/)[0] ?? name;
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Change ${first}'s seat`}
        onClick={() => setOpen((v) => !v)}
        className="text-foreground-muted hover:text-foreground inline-flex min-h-9 items-center gap-0.5 rounded-lg px-1.5 text-xs font-medium"
      >
        Change
        <ChevronDown size={12} aria-hidden />
      </button>
      {open && (
        <div className="border-border bg-surface absolute right-0 z-10 mt-1 min-w-[13rem] rounded-xl border p-1 shadow-lg">
          <button
            type="button"
            disabled
            className="text-foreground-muted flex w-full flex-col items-start rounded-lg px-2.5 py-1.5 text-left text-xs disabled:opacity-60"
          >
            <span className="font-medium">Replace player</span>
            <span>Coming with the next update</span>
          </button>
          <button
            type="button"
            disabled
            className="text-foreground-muted flex w-full flex-col items-start rounded-lg px-2.5 py-1.5 text-left text-xs disabled:opacity-60"
          >
            <span className="font-medium">Remove</span>
            <span>Coming with the next update</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** A running server-action call that does not itself resolve to an `ActionResult` (e.g. fetching a
 *  signed proof URL) - `run`'s wrapper only fits actions that report ok/error/message. */
type StartTransition = (fn: () => void) => void;

const SEAT_STATE_LABELS: Record<SeatState, string> = {
  paid: 'Paid',
  submitted: 'Receipt sent',
  topup: 'Top-up needed',
  declined: 'Declined',
  unpaid: 'Not paid',
  empty: 'Empty',
};

const SEAT_STATE_TONE: Record<SeatState, string> = {
  paid: 'text-success',
  submitted: 'text-warning',
  topup: 'text-warning',
  declined: 'text-danger',
  unpaid: 'text-foreground-muted',
  empty: 'text-foreground-muted',
};

const TEAM_RECEIPT_LABELS: Record<string, { label: string; tone: string }> = {
  none: { label: 'Not paid', tone: 'text-foreground-muted' },
  submitted: { label: 'Receipt sent', tone: 'text-warning' },
  verified: { label: 'Paid', tone: 'text-success' },
  rejected: { label: 'Declined', tone: 'text-danger' },
  refunded: { label: 'Refunded', tone: 'text-foreground-muted' },
};
const TEAM_RECEIPT_FALLBACK = { label: 'Not paid', tone: 'text-foreground-muted' };

/** A small inline reason prompt shared by every Decline/Undo/Restore in the Receipts block (master_plan
 *  §2BE: "confirm dialogs use the existing inline-confirm pattern in the file, not window.confirm"). */
function InlineReasonPrompt({
  placeholder,
  pending,
  confirmLabel,
  onConfirm,
}: {
  placeholder: string;
  pending: boolean;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="border-border bg-background min-w-[10rem] flex-1 rounded-lg border px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      <button
        type="button"
        disabled={pending || value.trim().length < 3}
        onClick={() => onConfirm(value.trim())}
        className="bg-danger/90 rounded-lg px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        {confirmLabel}
      </button>
    </div>
  );
}

/**
 * The team-scope receipt row (master_plan §2BE Decision A/B): "Team receipt", a state word, View
 * proof, and by status: submitted → Verify/Decline; verified → "Verified ✓" + Undo (`unverifyPayment`);
 * rejected → the reason + Restore (`restorePayment`); refunded → "Refunded" only.
 */
function TeamReceiptRow({
  reg,
  tournamentId,
  pending,
  start,
  run,
  setMsg,
}: {
  reg: OrganizerRegistration;
  tournamentId: string;
  pending: boolean;
  start: StartTransition;
  run: (fn: () => Promise<ActionResult>) => void;
  setMsg: (m: string | null) => void;
}) {
  const [showDecline, setShowDecline] = useState(false);
  const [showUndo, setShowUndo] = useState(false);
  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50';
  const state = TEAM_RECEIPT_LABELS[reg.paymentStatus ?? 'none'] ?? TEAM_RECEIPT_FALLBACK;
  const status = reg.paymentStatus ?? 'none';
  // `paymentRejectionReason` is not on `OrganizerRegistration` today (only on the viewer-facing DTO) -
  // read defensively so this renders nothing rather than failing to type-check if/when it arrives.
  const rejectionReason = (
    reg as OrganizerRegistration & { paymentRejectionReason?: string | null }
  ).paymentRejectionReason;

  return (
    <div className="border-border rounded-lg border p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-foreground-muted text-xs">
          Team receipt
          {reg.amountDue != null && reg.currency && (
            <span>
              {' '}
              · {reg.currency} {reg.amountDue.toLocaleString()}
            </span>
          )}
        </span>
        <span className={`text-xs font-semibold ${state.tone}`}>
          {status === 'verified' ? 'Verified ✓' : state.label}
        </span>
      </div>
      {rejectionReason && status === 'rejected' && (
        <p className="text-danger mt-1 text-[11px]">{rejectionReason}</p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {reg.hasProof && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await getProofSignedUrl(reg.paymentId as string, 'team');
                if (res.url) window.open(res.url, '_blank', 'noopener');
                else setMsg(res.error ?? 'Could not open proof.');
              })
            }
            className={`${btn} border-border text-foreground border`}
          >
            View proof
          </button>
        )}
        {status === 'submitted' && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => verifyPayment(reg.paymentId as string, tournamentId, 'team'))
              }
              className={`${btn} vp-gradient text-white`}
            >
              Verify
            </button>
            <button
              type="button"
              onClick={() => setShowDecline((v) => !v)}
              className={`${btn} text-danger border-border border`}
            >
              Decline
            </button>
          </>
        )}
        {status === 'verified' && (
          <button
            type="button"
            onClick={() => setShowUndo((v) => !v)}
            className={`${btn} border-border text-foreground border`}
          >
            Undo
          </button>
        )}
        {status === 'rejected' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => restorePayment(reg.paymentId as string, tournamentId, 'team'))}
            className={`${btn} border-border text-foreground border`}
          >
            Restore
          </button>
        )}
      </div>
      {showDecline && (
        <InlineReasonPrompt
          placeholder="Reason for declining (required)"
          pending={pending}
          confirmLabel="Confirm decline"
          onConfirm={(r) =>
            run(async () => {
              const res = await rejectPayment(reg.paymentId as string, tournamentId, r, 'team');
              if (res.ok) setShowDecline(false);
              return res;
            })
          }
        />
      )}
      {showUndo && (
        <InlineReasonPrompt
          placeholder="Reason for undoing this verification (required)"
          pending={pending}
          confirmLabel="Confirm undo"
          onConfirm={(r) =>
            run(async () => {
              const res = await unverifyPayment(reg.paymentId as string, tournamentId, 'team', r);
              if (res.ok) setShowUndo(false);
              return res;
            })
          }
        />
      )}
    </div>
  );
}

/**
 * One seat's line in the Receipts block (master_plan §2BE Decision A/B): "Slot · {first name}", its
 * state, and: covered by the team receipt → muted note + the same View link; a slot exists → View +
 * Verify/Decline (submitted) or "Paid ✓" + Undo (verified) or reason + Restore (rejected); no slot →
 * muted "Unpaid" + "Mark paid (cash)".
 */
function SeatRow({
  seat,
  slot,
  nameById,
  currency,
  extra,
  coveredByTeamReceipt,
  teamPaymentId,
  registrationId,
  tournamentId,
  pending,
  start,
  run,
  setMsg,
}: {
  seat: SeatSummary;
  slot: OrganizerRegistration['slots'][number] | undefined;
  nameById: Map<string, string>;
  currency: string | null;
  /** True when this seat's own receipt is redundant - the team receipt already covers every slot
   *  (master_plan §2AP Decision C6, "overpayment"). */
  extra: boolean;
  /** True when the team receipt already covers every seat and this seat has no slot of its own -
   *  master_plan §2BE Decision A: "if team receipt, both should have the same link". */
  coveredByTeamReceipt: boolean;
  teamPaymentId: string | null;
  registrationId: string;
  tournamentId: string;
  pending: boolean;
  start: StartTransition;
  run: (fn: () => Promise<ActionResult>) => void;
  setMsg: (m: string | null) => void;
}) {
  const [showDecline, setShowDecline] = useState(false);
  const [showUndo, setShowUndo] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50';
  const name = seat.playerId ? (nameById.get(seat.playerId) ?? 'Player') : null;
  const firstName = name ? (name.split(/\s+/)[0] ?? name) : 'Open';
  const topupAmount = Math.max(0, seat.amountDue - seat.amountSubmitted);

  if (coveredByTeamReceipt) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
        <span className="text-foreground-muted text-xs">Slot · {firstName}</span>
        <span className="flex items-center gap-1.5">
          <span className="text-foreground-muted text-xs">Covered by team receipt</span>
          {teamPaymentId && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await getProofSignedUrl(teamPaymentId, 'team');
                  if (res.url) window.open(res.url, '_blank', 'noopener');
                  else setMsg(res.error ?? 'Could not open proof.');
                })
              }
              className={`${btn} border-border text-foreground border`}
            >
              View
            </button>
          )}
        </span>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-foreground-muted text-xs">Slot · {firstName}</span>
        <span className="flex items-center gap-1.5">
          {extra && (
            <span className="border-warning/40 bg-warning/10 text-warning inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold">
              Extra
            </span>
          )}
          <span className={`text-xs font-semibold ${SEAT_STATE_TONE[seat.state]}`}>
            {slot?.status === 'verified' ? 'Paid ✓' : SEAT_STATE_LABELS[seat.state]}
            {seat.state === 'topup' && ` (${currency ?? 'PHP'} ${topupAmount.toLocaleString()})`}
          </span>
        </span>
      </div>
      {slot?.rejectionReason && slot.status === 'rejected' && (
        <p className="text-danger text-[11px]">{slot.rejectionReason}</p>
      )}
      {!slot && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-foreground-muted text-xs">Unpaid</span>
          {seat.playerId && (
            <button
              type="button"
              onClick={() => setShowMarkPaid((v) => !v)}
              className={`${btn} border-border text-foreground border`}
            >
              Mark paid (cash)
            </button>
          )}
        </div>
      )}
      {slot && (
        <div className="flex flex-wrap items-center gap-1.5">
          {slot.hasProof && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await getProofSignedUrl(slot.id, 'slot');
                  if (res.url) window.open(res.url, '_blank', 'noopener');
                  else setMsg(res.error ?? 'Could not open proof.');
                })
              }
              className={`${btn} border-border text-foreground border`}
            >
              View proof
            </button>
          )}
          {slot.status === 'submitted' && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => verifyPayment(slot.id, tournamentId, 'slot'))}
                className={`${btn} vp-gradient text-white`}
              >
                Verify
              </button>
              <button
                type="button"
                onClick={() => setShowDecline((v) => !v)}
                className={`${btn} text-danger border-border border`}
              >
                Decline
              </button>
            </>
          )}
          {slot.status === 'verified' && (
            <button
              type="button"
              onClick={() => setShowUndo((v) => !v)}
              className={`${btn} border-border text-foreground border`}
            >
              Undo
            </button>
          )}
          {slot.status === 'rejected' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => restorePayment(slot.id, tournamentId, 'slot'))}
              className={`${btn} border-border text-foreground border`}
            >
              Restore
            </button>
          )}
        </div>
      )}
      {showDecline && slot && (
        <InlineReasonPrompt
          placeholder="Reason for declining (required)"
          pending={pending}
          confirmLabel="Confirm decline"
          onConfirm={(r) =>
            run(async () => {
              const res = await rejectPayment(slot.id, tournamentId, r, 'slot');
              if (res.ok) setShowDecline(false);
              return res;
            })
          }
        />
      )}
      {showUndo && slot && (
        <InlineReasonPrompt
          placeholder="Reason for undoing this verification (required)"
          pending={pending}
          confirmLabel="Confirm undo"
          onConfirm={(r) =>
            run(async () => {
              // master_plan §2BE Decision B: a cash-marked seat (`markSeatPaid` inserts it `verified`
              // with no proof) undoes through `undoSeatPaid`; a real, player-submitted-then-verified
              // receipt undoes through `unverifyPayment` instead. The DTO does not carry the slot's
              // `method` column, so `hasProof` is the reliable stand-in: a verified slot with no proof
              // on file was never a receipt the organizer reviewed - it was marked paid by hand.
              const res = !slot.hasProof
                ? await undoSeatPaid(slot.id, tournamentId)
                : await unverifyPayment(slot.id, tournamentId, 'slot', r);
              if (res.ok) setShowUndo(false);
              return res;
            })
          }
        />
      )}
      {showMarkPaid && seat.playerId && (
        <div className="border-border mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-2">
          <p className="text-foreground-muted text-xs">
            Mark {firstName}&rsquo;s seat as paid in cash?
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await markSeatPaid(
                  registrationId,
                  seat.playerId as string,
                  tournamentId,
                );
                if (res.ok) setShowMarkPaid(false);
                return res;
              })
            }
            className={`${btn} vp-gradient text-white`}
          >
            Yes, mark paid
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * The organizer's whole money picture for one entry (master_plan §2AO A2/A6, §2BE Decision A/B): the
 * team receipt if one exists, then every seat with its own review controls (now including Undo and
 * Restore). Reads `paymentSummary`/`slots` defensively - both are additive fields on
 * `OrganizerRegistration` landing from a parallel lane, so this renders nothing rather than crashing
 * until they arrive.
 */
function ReceiptsBlock({
  reg,
  tournamentId,
  pending,
  start,
  run,
  setMsg,
  nameById,
}: {
  reg: OrganizerRegistration;
  tournamentId: string;
  pending: boolean;
  start: StartTransition;
  run: (fn: () => Promise<ActionResult>) => void;
  setMsg: (m: string | null) => void;
  nameById: Map<string, string>;
}) {
  const summary = reg.paymentSummary;
  if (!summary) return null;
  const slotByPlayer = new Map((reg.slots ?? []).map((s) => [s.playerId, s]));
  // Overpayment (master_plan §2AP Decision C6): the team receipt already covers every slot, but a
  // seat also carries its own receipt - visible to the organizer instead of silently absorbed.
  const teamReceiptCoversAll =
    summary.teamReceipt === 'verified' || summary.teamReceipt === 'submitted';
  const hasOverpayment = teamReceiptCoversAll && (reg.slots ?? []).length > 0;

  return (
    <div className="border-border mt-2 space-y-2.5 rounded-lg border border-dashed p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-foreground text-xs font-semibold">Receipts</span>
        <span className="text-foreground-muted text-xs">{moneyTag(reg).label}</span>
      </div>

      {reg.paymentId && (
        <TeamReceiptRow
          reg={reg}
          tournamentId={tournamentId}
          pending={pending}
          start={start}
          run={run}
          setMsg={setMsg}
        />
      )}

      {hasOverpayment && (
        <p className="text-warning text-xs">
          Extra receipt on file - the team receipt already covers every slot. Refund or keep.
        </p>
      )}

      <ul className="divide-border divide-y">
        {summary.seats.map((seat, i) => {
          const slot = seat.playerId ? slotByPlayer.get(seat.playerId) : undefined;
          return (
            <SeatRow
              key={seat.playerId ?? `open-seat-${i}`}
              seat={seat}
              slot={slot}
              nameById={nameById}
              currency={reg.currency}
              extra={hasOverpayment && !!slot}
              coveredByTeamReceipt={teamReceiptCoversAll && !slot}
              teamPaymentId={reg.paymentId}
              registrationId={reg.id}
              tournamentId={tournamentId}
              pending={pending}
              start={start}
              run={run}
              setMsg={setMsg}
            />
          );
        })}
      </ul>
    </div>
  );
}

/** Up to two short reason lines across every member (master_plan §2BE Decision A: "labels only,
 *  ≤ 2 lines, always visible when not Eligible"). Prefixed by first name only when there is more than
 *  one member, so a singles entry's lines read exactly as before. The full evidence (community skill,
 *  STS, active vouches) still lives on the player's own profile - unchanged from the prior collapsed
 *  panel, just no longer gated behind a toggle. */
function eligibilityReasonLines(
  snap: Snapshot,
  nameById: Map<string, string>,
): { text: string; tone: 'danger' | 'warning' | 'muted' }[] {
  const players = snap.players ?? [];
  const multi = players.length > 1;
  const lines: { text: string; tone: 'danger' | 'warning' | 'muted' }[] = [];
  for (const p of players) {
    const prefix = multi ? `${(nameById.get(p.playerId) ?? 'Player').split(/\s+/)[0]}: ` : '';
    for (const c of p.hardRuleCodes) {
      lines.push({
        text: prefix + (HARD_RULE_LABELS[c as keyof typeof HARD_RULE_LABELS] ?? c),
        tone: 'danger',
      });
    }
    for (const c of p.reasonCodes) {
      lines.push({ text: prefix + reasonLabel(c), tone: 'warning' });
    }
    for (const c of p.flags) {
      lines.push({
        text: prefix + (FLAG_LABELS[c as keyof typeof FLAG_LABELS] ?? c),
        tone: 'muted',
      });
    }
  }
  return lines.slice(0, 2);
}

const REASON_LINE_TONE: Record<'danger' | 'warning' | 'muted', string> = {
  danger: 'text-danger',
  warning: 'text-warning',
  muted: 'text-foreground-muted',
};

/**
 * Eligibility row (master_plan §2BE Decision A): one chip, up to two reason lines always visible when
 * not Eligible, and Approve / Undo on the right. Reclassify moved to the sheet's ⋯ overflow - this row
 * no longer carries it.
 */
function EligibilityRow({
  reg,
  tournamentId,
  nameById,
  pending,
  run,
}: {
  reg: OrganizerRegistration;
  tournamentId: string;
  nameById: Map<string, string>;
  pending: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
}) {
  const snap = (reg.eligibilitySnapshot ?? {}) as Snapshot;
  const status = reg.eligibilityStatus;
  const isEligible = status === 'eligible';
  const isHardRule = status === 'ineligible_hard_rule';
  const [approveReason, setApproveReason] = useState('');
  const [showApprove, setShowApprove] = useState(false);

  const resultKey = snap.result as keyof typeof ELIGIBILITY_RESULT_LABELS | undefined;
  const label =
    resultKey && ELIGIBILITY_RESULT_LABELS[resultKey]
      ? ELIGIBILITY_RESULT_LABELS[resultKey]
      : statusToLabel(status);
  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50';
  const lines = isEligible ? [] : eligibilityReasonLines(snap, nameById);

  return (
    <div className="mt-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="text-foreground-muted mr-1.5 text-xs font-semibold">Eligibility</span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              ELIG_STYLES[status] ?? 'border-border text-foreground-muted'
            }`}
          >
            {label}
          </span>
          {lines.length > 0 && (
            <span className="mt-1 block space-y-0.5">
              {lines.map((l, i) => (
                <span key={i} className={`block text-xs ${REASON_LINE_TONE[l.tone]}`}>
                  {l.text}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {!isEligible && (
            <button
              type="button"
              onClick={() => setShowApprove((v) => !v)}
              className={`${btn} vp-gradient text-white`}
            >
              Approve
            </button>
          )}
          {snap.override && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => undoEligibilityApproval(reg.id, tournamentId))}
              className={`${btn} border-border text-foreground border`}
            >
              Undo
            </button>
          )}
        </span>
      </div>

      {snap.override && (
        <p className="text-foreground-muted mt-1 text-[11px]">
          Overridden by an organizer{snap.override.reason ? ` - "${snap.override.reason}"` : ''}.
        </p>
      )}

      {showApprove && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={approveReason}
            onChange={(e) => setApproveReason(e.target.value)}
            placeholder={isHardRule ? 'Reason (required to override a rule)' : 'Reason (optional)'}
            className="border-border bg-background min-w-[12rem] flex-1 rounded-lg border px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <button
            type="button"
            disabled={pending || (isHardRule && !approveReason.trim())}
            onClick={() =>
              run(async () => {
                const res = await approveEligibility(reg.id, tournamentId, approveReason);
                if (res.ok) setShowApprove(false);
                return res;
              })
            }
            className={`${btn} vp-gradient text-white`}
          >
            Confirm approve
          </button>
        </div>
      )}
    </div>
  );
}

function statusToLabel(status: string): string {
  const map: Record<string, string> = {
    eligible: 'Eligible',
    review: 'Needs review',
    skill_mismatch: 'Potential skill mismatch',
    ineligible_hard_rule: 'Does not meet a division rule',
  };
  return map[status] ?? status.replace(/_/g, ' ');
}
