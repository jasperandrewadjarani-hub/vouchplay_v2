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
import { confirmRegistration, rejectRegistration } from '@/lib/actions/registration';
import {
  approveEligibility,
  reclassifyRegistration,
  requestSkillReviewForRegistration,
} from '@/lib/actions/eligibility';
import { issueOfficialAchievement } from '@/lib/actions/achievements';
import {
  verifyPayment,
  rejectPayment,
  markRefunded,
  getProofSignedUrl,
} from '@/lib/actions/payment';
import type { OrganizerRegistration } from '@/lib/tournaments/registration-queries';
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
import { OverflowMenu, type OverflowMenuAction } from '@/components/ui/overflow-menu';
import { AssignPartnerForm } from './assign-partner-form';

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

type ActionResult = { ok?: boolean; error?: string; message?: string };

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
  const [filters, setFilters] = useState<EntryFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<EntrySort>(DEFAULT_SORT);
  const [showFilters, setShowFilters] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  if (registrations.length === 0) {
    return <p className="text-foreground-muted text-sm">No registrations yet.</p>;
  }

  const visible = sortEntries(filterEntries(registrations, filters), sort);
  const selected = registrations.find((r) => r.id === openId) ?? null;
  const chips = describeEntryChips(filters, divisions);
  // §2AQ Decision D: how many open entries have asked to cancel, for the amber pill next to Filters.
  const wantsToCancelCount = countEntries(registrations).wantsToCancel;
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
              `cancellation_requested`, this just gives it its own combinable chip. */}
          <ChipGroup
            label="Requests"
            options={[{ value: 'wants_to_cancel' as const, label: 'Wants to cancel' }]}
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

      {visible.length === 0 ? (
        <p className="text-foreground-muted text-sm">Nothing here. Try a different filter.</p>
      ) : (
        <ul className="border-border divide-border divide-y overflow-hidden rounded-2xl border">
          {visible.map((r) => (
            <EntryRow key={r.id} entry={r} onOpen={() => setOpenId(r.id)} />
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
 * One entry, scannable in a glance: who, which division, what it needs, how much. The whole row is
 * the control - a small "Manage" link beside a tall row is a smaller target than the row itself.
 */
function EntryRow({ entry, onOpen }: { entry: OrganizerRegistration; onOpen: () => void }) {
  const chip = statusChip(entry);
  const money = moneyTag(entry);
  const amount = amountLabel(entry);
  const openSeat = hasOpenSeat(entry);
  const unconfirmed = !openSeat && hasUnconfirmedPartner(entry);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="hover:bg-surface-muted flex w-full items-center gap-3 px-3 py-3 text-left"
      >
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
        <ChevronRight size={16} className="text-foreground-muted shrink-0" aria-hidden />
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

/** One status line for the sheet header (master_plan §2AQ Decision E): the money tag, plus - only
 *  when it is not already saying so - how many of a multi-seat entry's slots are paid. Replaces the
 *  old "{names} · {raw status}" line. */
function sheetStatusLine(reg: OrganizerRegistration): string {
  const money = moneyTag(reg);
  const summary = reg.paymentSummary;
  const alreadyHasSeatDetail = money.label.toLowerCase().includes('slots paid');
  if (
    summary &&
    summary.totalSeats > 1 &&
    !alreadyHasSeatDetail &&
    (summary.paidSeats > 0 || summary.submittedSeats > 0)
  ) {
    return `${money.label} · ${summary.paidSeats} of ${summary.totalSeats} slots paid`;
  }
  return money.label;
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
  const [reason, setReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [declineReceiptReason, setDeclineReceiptReason] = useState('');
  const [showDeclineReceipt, setShowDeclineReceipt] = useState(false);
  const [showConfirmNoPayment, setShowConfirmNoPayment] = useState(false);
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [showAssignPartner, setShowAssignPartner] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [award, setAward] = useState<string>(OFFICIAL_ACHIEVEMENTS[0].key);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<ActionResult>) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      setMsg(res.error ?? res.message ?? null);
      if (res.ok) router.refresh();
    });
  }

  const closed = CLOSED_REG_STATUSES.has(reg.status);
  const confirmed = reg.status === 'confirmed';
  const waitlisted = reg.status === 'waitlisted';
  const nameById = new Map(reg.members.map((m) => [m.id, m.name]));
  const slugById = new Map(reg.members.map((m) => [m.id, m.slug]));

  // §2AQ Decision E: the primary row is decided by exactly one of these states.
  const teamSubmitted = reg.paymentStatus === 'submitted' && !!reg.paymentId;
  const submittedSlots = (reg.slots ?? []).filter((s) => s.status === 'submitted');
  const bothSubmitted = teamSubmitted && submittedSlots.length > 0;
  const singleTarget: { kind: 'team' | 'slot'; id: string } | null =
    teamSubmitted && !bothSubmitted
      ? { kind: 'team', id: reg.paymentId as string }
      : !teamSubmitted && submittedSlots.length > 0 && !bothSubmitted
        ? { kind: 'slot', id: submittedSlots[0]!.id }
        : null;
  const isFree = reg.amountDue == null || reg.amountDue <= 0;

  type PrimaryKind = 'verify' | 'confirm_free' | 'waiting_paid' | 'waitlisted' | 'none';
  const kind: PrimaryKind =
    closed || confirmed || bothSubmitted
      ? 'none'
      : singleTarget
        ? 'verify'
        : waitlisted
          ? 'waitlisted'
          : isFree
            ? 'confirm_free'
            : 'waiting_paid';

  const canConfirmWithoutPayment = !confirmed && !closed && !waitlisted;
  const openSeat = hasOpenSeat(reg);
  const verifiedSlot = (reg.slots ?? []).find((s) => s.status === 'verified');
  const verifiedTarget: { kind: 'team' | 'slot'; id: string } | null =
    reg.paymentStatus === 'verified' && reg.paymentId
      ? { kind: 'team', id: reg.paymentId }
      : verifiedSlot
        ? { kind: 'slot', id: verifiedSlot.id }
        : null;

  const overflowActions: OverflowMenuAction[] = [
    ...(canConfirmWithoutPayment
      ? [{ label: 'Confirm without payment', onSelect: () => setShowConfirmNoPayment((v) => !v) }]
      : []),
    ...(!closed
      ? [
          {
            label: 'Reject entry',
            tone: 'danger' as const,
            onSelect: () => setShowReject((v) => !v),
          },
        ]
      : []),
    ...(verifiedTarget
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
    ...(openSeat
      ? [{ label: 'Assign partner', onSelect: () => setShowAssignPartner((v) => !v) }]
      : []),
  ];

  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50';

  return (
    <div>
      {/* One status line replaces the old "{names} · {raw status}" line (§2AQ Decision E). The
          overflow (⋯) carries every action that is not the one or two the current state calls for. */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-foreground-muted text-xs">{sheetStatusLine(reg)}</p>
        <OverflowMenu actions={overflowActions} />
      </div>

      {kind === 'verify' && singleTarget && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => verifyPayment(singleTarget.id, tournamentId, singleTarget.kind))
            }
            className={`${btn} vp-gradient text-white`}
          >
            Verify payment
          </button>
          <button
            type="button"
            onClick={() => setShowDeclineReceipt((v) => !v)}
            className={`${btn} text-danger border-border border`}
          >
            Decline receipt
          </button>
        </div>
      )}
      {kind === 'confirm_free' && (
        <div className="mt-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => confirmRegistration(reg.id, tournamentId))}
            className={`${btn} vp-gradient text-white`}
          >
            Confirm entry
          </button>
        </div>
      )}
      {kind === 'waiting_paid' && (
        <p className="text-foreground-muted mt-2 text-xs">Waiting for payment.</p>
      )}
      {kind === 'waitlisted' && (
        <p className="text-foreground-muted mt-2 text-xs">On the waitlist.</p>
      )}

      {showDeclineReceipt && singleTarget && (
        <div className="mt-2 flex gap-2">
          <input
            value={declineReceiptReason}
            onChange={(e) => setDeclineReceiptReason(e.target.value)}
            placeholder="Reason (required)"
            className="border-border bg-background flex-1 rounded-lg border px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <button
            type="button"
            disabled={pending || !declineReceiptReason.trim()}
            onClick={() =>
              run(async () => {
                const res = await rejectPayment(
                  singleTarget.id,
                  tournamentId,
                  declineReceiptReason.trim(),
                  singleTarget.kind,
                );
                if (res.ok) setShowDeclineReceipt(false);
                return res;
              })
            }
            className={`${btn} bg-danger/90 text-white`}
          >
            Confirm decline
          </button>
        </div>
      )}

      {showConfirmNoPayment && (
        <div className="border-border mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-2">
          <p className="text-foreground-muted text-xs">
            Confirm this entry without a payment record?
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await confirmRegistration(reg.id, tournamentId);
                if (res.ok) setShowConfirmNoPayment(false);
                return res;
              })
            }
            className={`${btn} vp-gradient text-white`}
          >
            Yes, confirm
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

      {showAssignPartner && (
        <AssignPartnerForm
          teamId={reg.teamId}
          tournamentId={tournamentId}
          divisionId={reg.divisionId}
          onClose={() => setShowAssignPartner(false)}
        />
      )}

      {/* Eligibility decision-support (§25.5, §2AQ Decision E) - neutral, closed by default for
          every status. */}
      <EligibilityPanel
        reg={reg}
        tournamentId={tournamentId}
        divisions={divisions}
        nameById={nameById}
        slugById={slugById}
        pending={pending}
        run={run}
      />

      {/* Payments (master_plan §2AO A6, §2AQ Decision E) - the team receipt, if any, plus one line
          per seat with its own Verify / Decline. Refund lives only in the overflow now. */}
      <PaymentsBlock
        reg={reg}
        tournamentId={tournamentId}
        pending={pending}
        start={start}
        run={run}
        setMsg={setMsg}
        nameById={nameById}
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
            &ldquo;{reg.cancellationRequest.reason}&rdquo; Use Reject entry to cancel.
          </p>
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

      {msg && <p className="text-foreground-muted mt-1 text-xs">{msg}</p>}
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

/**
 * The team-scope receipt row (master_plan §2AQ Decision E): labelled "Team receipt", a state word,
 * and View proof + Verify/Decline only when a receipt actually exists. Refund moved to the sheet's
 * overflow menu - this row no longer carries it.
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
  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50';
  const state = TEAM_RECEIPT_LABELS[reg.paymentStatus ?? 'none'] ?? TEAM_RECEIPT_FALLBACK;
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
        <span className={`text-xs font-semibold ${state.tone}`}>{state.label}</span>
      </div>
      {(reg.hasProof || reg.paymentStatus === 'submitted') && (
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
          {reg.paymentStatus === 'submitted' && (
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
                disabled={pending}
                onClick={() => {
                  const why = prompt('Reason for declining this payment?');
                  if (why && why.trim())
                    run(() =>
                      rejectPayment(reg.paymentId as string, tournamentId, why.trim(), 'team'),
                    );
                }}
                className={`${btn} text-danger border-border border`}
              >
                Decline
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One seat's line in the Payments block: "Slot · {first name}", its state word, and - only when a
 * slot receipt actually exists for that player - View proof / Verify / Decline (master_plan §2AO A6,
 * §2AQ Decision E - no separate bold name column, refund moved to the overflow).
 */
function SeatRow({
  seat,
  slot,
  nameById,
  currency,
  extra,
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
  tournamentId: string;
  pending: boolean;
  start: StartTransition;
  run: (fn: () => Promise<ActionResult>) => void;
  setMsg: (m: string | null) => void;
}) {
  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50';
  const name = seat.playerId ? (nameById.get(seat.playerId) ?? 'Player') : null;
  const firstName = name ? (name.split(/\s+/)[0] ?? name) : 'Open';
  const topupAmount = Math.max(0, seat.amountDue - seat.amountSubmitted);

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
            {SEAT_STATE_LABELS[seat.state]}
            {seat.state === 'topup' && ` (${currency ?? 'PHP'} ${topupAmount.toLocaleString()})`}
          </span>
        </span>
      </div>
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
                disabled={pending}
                onClick={() => {
                  const why = prompt('Reason for declining this seat payment?');
                  if (why && why.trim())
                    run(() => rejectPayment(slot.id, tournamentId, why.trim(), 'slot'));
                }}
                className={`${btn} text-danger border-border border`}
              >
                Decline
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The organizer's whole money picture for one entry (master_plan §2AO A2/A6): a one-line summary,
 * the team receipt if one exists, then every seat with its own review controls. Reads
 * `paymentSummary`/`slots` defensively - both are additive fields on `OrganizerRegistration` landing
 * from a parallel lane, so this renders nothing rather than crashing until they arrive.
 */
function PaymentsBlock({
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
  const hasOverpayment =
    (summary.teamReceipt === 'verified' || summary.teamReceipt === 'submitted') &&
    (reg.slots ?? []).length > 0;

  return (
    <div className="border-border mt-2 space-y-2.5 rounded-lg border border-dashed p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-foreground text-xs font-semibold">Payments</span>
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

function EligibilityPanel({
  reg,
  tournamentId,
  divisions,
  nameById,
  slugById,
  pending,
  run,
}: {
  reg: OrganizerRegistration;
  tournamentId: string;
  divisions: EligibilityDivisionOption[];
  nameById: Map<string, string>;
  slugById: Map<string, string | null>;
  pending: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
}) {
  const snap = (reg.eligibilitySnapshot ?? {}) as Snapshot;
  const status = reg.eligibilityStatus;
  const isEligible = status === 'eligible';
  const isHardRule = status === 'ineligible_hard_rule';

  // §2AQ Decision E: closed by default for EVERY status, "Needs review" included - a chip that opens
  // itself reads as an alarm even when there is nothing here worth interrupting the organizer for.
  const [open, setOpen] = useState(false);
  const [approveReason, setApproveReason] = useState('');
  const [showApprove, setShowApprove] = useState(false);
  const [showReclass, setShowReclass] = useState(false);
  const [reclassDiv, setReclassDiv] = useState('');
  const [reclassReason, setReclassReason] = useState('');

  const resultKey = snap.result as keyof typeof ELIGIBILITY_RESULT_LABELS | undefined;
  const label =
    resultKey && ELIGIBILITY_RESULT_LABELS[resultKey]
      ? ELIGIBILITY_RESULT_LABELS[resultKey]
      : statusToLabel(status);
  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50';
  const sameDivisionTargets = divisions.filter((d) => d.id !== reg.divisionId);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
          ELIG_STYLES[status] ?? 'border-border text-foreground-muted'
        }`}
      >
        {label}
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="border-border mt-2 rounded-lg border border-dashed p-2.5">
          {/* Reason lines only, per player (§2AQ Decision E) - the evidence itself (community skill,
              STS, active vouches, Skill-Verified) lives on the player's own profile, linked here by
              name, rather than repeated on this screen. */}
          <div className="space-y-2">
            {(snap.players ?? []).length === 0 && (
              <p className="text-foreground-muted text-xs">No rule concerns on file.</p>
            )}
            {(snap.players ?? []).map((p) => {
              const slug = slugById.get(p.playerId);
              const name = nameById.get(p.playerId) ?? 'Player';
              const hasReasons =
                p.hardRuleCodes.length > 0 || p.reasonCodes.length > 0 || p.flags.length > 0;
              return (
                <div key={p.playerId} className="text-xs">
                  {slug ? (
                    <Link
                      href={`/players/${slug}`}
                      className="text-foreground hover:text-primary font-medium"
                    >
                      {name}
                    </Link>
                  ) : (
                    <span className="text-foreground font-medium">{name}</span>
                  )}
                  {hasReasons ? (
                    <div className="mt-0.5 space-y-0.5">
                      {p.hardRuleCodes.map((c) => (
                        <p key={c} className="text-danger">
                          {HARD_RULE_LABELS[c as keyof typeof HARD_RULE_LABELS] ?? c}
                        </p>
                      ))}
                      {p.reasonCodes.map((c) => (
                        <p key={c} className="text-warning">
                          {reasonLabel(c)}
                        </p>
                      ))}
                      {p.flags.map((c) => (
                        <p key={c} className="text-foreground-muted">
                          {FLAG_LABELS[c as keyof typeof FLAG_LABELS] ?? c}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-foreground-muted mt-0.5">No concerns.</p>
                  )}
                </div>
              );
            })}
          </div>

          {snap.override && (
            <p className="text-foreground-muted mt-2 text-[11px]">
              Overridden by an organizer{snap.override.reason ? ` - "${snap.override.reason}"` : ''}
              .
            </p>
          )}

          {/* Actions (§25.5) */}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {!isEligible && (
              <button
                type="button"
                onClick={() => setShowApprove((v) => !v)}
                className={`${btn} vp-gradient text-white`}
              >
                Approve
              </button>
            )}
            {sameDivisionTargets.length > 0 && (
              <button
                type="button"
                onClick={() => setShowReclass((v) => !v)}
                className={`${btn} border-border text-foreground border`}
              >
                Reclassify
              </button>
            )}
          </div>

          {showApprove && (
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={approveReason}
                onChange={(e) => setApproveReason(e.target.value)}
                placeholder={
                  isHardRule ? 'Reason (required to override a rule)' : 'Reason (optional)'
                }
                className="border-border bg-background min-w-[12rem] flex-1 rounded-lg border px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              <button
                type="button"
                disabled={pending || (isHardRule && !approveReason.trim())}
                onClick={() => run(() => approveEligibility(reg.id, tournamentId, approveReason))}
                className={`${btn} vp-gradient text-white`}
              >
                Confirm approve
              </button>
            </div>
          )}

          {showReclass && (
            <div className="mt-2 flex flex-wrap gap-2">
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
                  run(() => reclassifyRegistration(reg.id, tournamentId, reclassDiv, reclassReason))
                }
                className={`${btn} border-border text-foreground border`}
              >
                Move
              </button>
            </div>
          )}
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
