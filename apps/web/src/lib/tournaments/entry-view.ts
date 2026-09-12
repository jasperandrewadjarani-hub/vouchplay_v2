import type { OrganizerRegistration } from './registration-queries';

/**
 * How one registration presents itself in the organizer's list (master_plan §1Z, §2AG/A5).
 *
 * Pure and shared so the row, the detail sheet, the filters and the sort control cannot disagree
 * about what state an entry is in. Everything here answers one question: what does this organizer
 * need to decide?
 */

export type EntryQueue =
  'needs_payment_review' | 'cancellation_requested' | 'needs_eligibility_review';

/** The registration_status enum (migration 0008), mirrored here so filters/sort stay a closed set. */
export type RegStatus =
  | 'team_formed'
  | 'payment_pending'
  | 'payment_submitted'
  | 'under_review'
  | 'confirmed'
  | 'waitlisted'
  | 'rejected'
  | 'withdrawn'
  | 'cancelled'
  | 'refunded';

/** The registration_eligibility enum (migration 0008). */
export type EligKind = 'eligible' | 'review' | 'skill_mismatch' | 'ineligible_hard_rule';

/** Plain labels for the Status filter chips - never the raw database word. */
export const STATUS_LABELS: Record<RegStatus, string> = {
  team_formed: 'Team formed',
  payment_pending: 'Awaiting payment',
  payment_submitted: 'Payment submitted',
  under_review: 'Under review',
  confirmed: 'Confirmed',
  waitlisted: 'Waitlisted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

/** Plain labels for the Eligibility filter chips. */
export const ELIGIBILITY_LABELS: Record<EligKind, string> = {
  eligible: 'Eligible',
  review: 'Needs review',
  skill_mismatch: 'Skill mismatch',
  ineligible_hard_rule: 'Rule violation',
};

/** Entries an organizer has closed. Hidden by default: they are history, not work. */
export const CLOSED_STATUSES = new Set(['withdrawn', 'cancelled', 'rejected', 'refunded']);

export function isClosed(entry: Pick<OrganizerRegistration, 'status'>): boolean {
  return CLOSED_STATUSES.has(entry.status);
}

/**
 * The queues an entry currently sits in. An entry can be in more than one - a paid entry whose player
 * has asked to cancel needs both decisions - so this returns a set rather than a single bucket.
 */
export function queuesFor(entry: OrganizerRegistration): EntryQueue[] {
  if (isClosed(entry)) return [];
  const queues: EntryQueue[] = [];
  // §2AO A6: a submitted receipt on EITHER the team payment or any attached seat needs review, not
  // only the team-scope row `paymentStatus` used to check.
  if (entry.paymentStatus === 'submitted' || entry.paymentSummary.submittedSeats > 0) {
    queues.push('needs_payment_review');
  }
  if (entry.cancellationRequest) queues.push('cancellation_requested');
  if (entry.eligibilityStatus !== 'eligible') queues.push('needs_eligibility_review');
  return queues;
}

/** Team label: the thing an organizer actually scans for. Never an id. */
export function teamLabel(entry: OrganizerRegistration): string {
  const names = entry.members.map((m) => m.name).filter(Boolean);
  if (names.length === 0) return 'Unnamed team';
  return names.join(' & ');
}

/** True when a named partner has still not confirmed, which changes what the entry means. */
export function hasUnconfirmedPartner(entry: OrganizerRegistration): boolean {
  return entry.unconfirmedMemberIds.length > 0;
}

/** True when the team is short a player against its division's team size (master_plan §2AM decision
 *  2/3): never named, declined, expired, or the invite cancelled. Singles teams (teamSize 1) can
 *  never have an open seat. */
export function hasOpenSeat(entry: OrganizerRegistration): boolean {
  return entry.teamSize > 1 && entry.members.length < entry.teamSize;
}

export interface StatusChip {
  label: string;
  /** Semantic tone. Never the only signal: the label always carries the meaning too (§34A). */
  tone: 'action' | 'waiting' | 'done' | 'closed';
}

/**
 * One chip per entry, chosen by what the ORGANIZER must do next rather than by raw status. A list of
 * database enums is a list an organizer has to translate; this is the translation.
 *
 * §2AO A6: driven by `paymentSummary` (team receipt combined with every attached seat) rather than
 * only the team-scope `paymentStatus`, so a seat-only receipt or a partially paid doubles team reads
 * correctly too.
 */
export function statusChip(entry: OrganizerRegistration): StatusChip {
  if (isClosed(entry)) return { label: entry.status.replace(/_/g, ' '), tone: 'closed' };
  if (entry.cancellationRequest) return { label: 'Cancellation asked', tone: 'action' };
  const summary = entry.paymentSummary;
  if (summary.submittedSeats > 0 || summary.teamReceipt === 'submitted') {
    return { label: 'Check payment', tone: 'action' };
  }
  if (entry.status === 'confirmed') return { label: 'Confirmed', tone: 'done' };
  if (entry.status === 'waitlisted') return { label: 'Waitlisted', tone: 'waiting' };
  if (summary.state === 'partial') {
    return summary.topupDue > 0
      ? { label: 'Top-up needed', tone: 'action' }
      : { label: `Partially paid ${summary.paidSeats}/${summary.totalSeats}`, tone: 'waiting' };
  }
  if (summary.state === 'paid') return { label: 'Paid', tone: 'done' };
  if (summary.state === 'declined') return { label: 'Payment rejected', tone: 'action' };
  return { label: 'Awaiting payment', tone: 'waiting' };
}

/** Money as one short string, or null when the division is free. */
export function amountLabel(entry: OrganizerRegistration): string | null {
  if (entry.amountDue == null || entry.amountDue <= 0) return null;
  return `${entry.currency ?? 'PHP'} ${entry.amountDue.toLocaleString('en-US')}`;
}

export interface EntryCounts {
  open: number;
  closed: number;
  needsPaymentReview: number;
  cancellationRequested: number;
  needsEligibilityReview: number;
}

export function countEntries(entries: readonly OrganizerRegistration[]): EntryCounts {
  const counts: EntryCounts = {
    open: 0,
    closed: 0,
    needsPaymentReview: 0,
    cancellationRequested: 0,
    needsEligibilityReview: 0,
  };
  for (const e of entries) {
    if (isClosed(e)) {
      counts.closed += 1;
      continue;
    }
    counts.open += 1;
    const queues = queuesFor(e);
    if (queues.includes('needs_payment_review')) counts.needsPaymentReview += 1;
    if (queues.includes('cancellation_requested')) counts.cancellationRequested += 1;
    if (queues.includes('needs_eligibility_review')) counts.needsEligibilityReview += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Filters (master_plan §2AG/A5) - combinable: AND across groups, OR within a group.
// ---------------------------------------------------------------------------

/**
 * COMPAT NOTE: the previous shape was `{ divisionName: string; queue: 'all' | EntryQueue;
 * includeClosed: boolean; search: string }` - one queue, one division, both single-select. Only
 * this module and `organizer-registrations.tsx` ever read/wrote it (grepped, confirmed), so it is
 * renamed rather than aliased: every field is now an array of the values that group ADMITS (empty =
 * no constraint, i.e. "Any"). `queue` (a derived work-bucket) is dropped in favour of the raw
 * `statuses`/`eligibility`/`payment`/`partner` groups the handover asks for, which an organizer can
 * combine directly instead of picking one precomputed bucket; a cancellation request still surfaces
 * via the row's own chip and still sorts to the top under the default "needs me" order.
 */
/** §2AO A6: receipt-presence (unchanged) plus the two payment-summary states an organizer can now
 *  filter to directly. */
export type PaymentFilterValue = 'has_proof' | 'no_proof' | 'partial' | 'paid';

export interface EntryFilters {
  /** Division ids (not names - two divisions can share a display name). Empty = every division. */
  divisions: string[];
  statuses: RegStatus[];
  eligibility: EligKind[];
  /** §2AO A6: 'partial'/'paid' read from `paymentSummary.state` alongside the existing receipt-
   *  presence values - an entry matches if it satisfies ANY selected value (OR within the group). */
  payment: PaymentFilterValue[];
  partner: ('confirmed' | 'unconfirmed' | 'none')[];
  /** Legacy single toggle, kept alongside the Status group (handover A5). Only decides visibility
   *  when `statuses` is empty - an explicit Status pick is a more specific ask and wins outright. */
  includeClosed: boolean;
  search: string;
}

export const DEFAULT_FILTERS: EntryFilters = {
  divisions: [],
  statuses: [],
  eligibility: [],
  payment: [],
  partner: [],
  includeClosed: false,
  search: '',
};

/**
 * Filtering, in one place. AND across the groups below, OR within each group (an empty group applies
 * no constraint - "Any"). Search matches a player's name so an organizer can answer "did Maria get
 * in?" - which is the question they are actually asked, and which a status filter cannot answer.
 */
export function filterEntries(
  entries: readonly OrganizerRegistration[],
  filters: EntryFilters,
): OrganizerRegistration[] {
  const needle = filters.search.trim().toLowerCase();
  return entries.filter((e) => {
    // Closed-visibility gate. An explicit Status selection is the more specific ask and decides
    // visibility on its own, closed statuses included (so picking "Withdrawn" shows withdrawn
    // entries even with "Show closed" off). With no Status picked, the legacy switch applies: closed
    // hidden unless "Show closed" is on - not appended to the open list, exactly as before (§2O).
    if (filters.statuses.length > 0) {
      if (!filters.statuses.includes(e.status as RegStatus)) return false;
    } else if (filters.includeClosed ? !isClosed(e) : isClosed(e)) {
      return false;
    }

    if (filters.divisions.length > 0 && !filters.divisions.includes(e.divisionId)) return false;

    if (
      filters.eligibility.length > 0 &&
      !filters.eligibility.includes(e.eligibilityStatus as EligKind)
    )
      return false;

    if (filters.payment.length > 0) {
      const keys: PaymentFilterValue[] = [e.hasProof ? 'has_proof' : 'no_proof'];
      if (e.paymentSummary.state === 'partial') keys.push('partial');
      if (e.paymentSummary.state === 'paid') keys.push('paid');
      if (!keys.some((k) => filters.payment.includes(k))) return false;
    }

    if (filters.partner.length > 0) {
      const key: 'confirmed' | 'unconfirmed' | 'none' = hasOpenSeat(e)
        ? 'none'
        : hasUnconfirmedPartner(e)
          ? 'unconfirmed'
          : 'confirmed';
      if (!filters.partner.includes(key)) return false;
    }

    if (needle) {
      const haystack = `${teamLabel(e)} ${e.divisionName}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}

/** One removable chip for an active filter, plus enough to clear it again. */
export type EntryFilterGroup =
  'divisions' | 'statuses' | 'eligibility' | 'payment' | 'partner' | 'includeClosed' | 'search';

export interface EntryFilterChip {
  group: EntryFilterGroup;
  /** The array value this chip represents; empty string for the two non-array groups. */
  value: string;
  label: string;
}

const PAYMENT_LABELS: Record<PaymentFilterValue, string> = {
  has_proof: 'Has receipt',
  no_proof: 'No receipt',
  partial: 'Partially paid',
  paid: 'Fully paid',
};
const PARTNER_LABELS: Record<'confirmed' | 'unconfirmed' | 'none', string> = {
  confirmed: 'Partner confirmed',
  unconfirmed: 'Partner not confirmed',
  none: 'No partner yet',
};

/**
 * Every active filter as a removable chip, in one place so the list and the "click to remove" logic
 * cannot disagree about what is currently applied.
 */
export function describeEntryChips(
  filters: EntryFilters,
  divisions: readonly { id: string; name: string }[],
): EntryFilterChip[] {
  const divisionName = new Map(divisions.map((d) => [d.id, d.name]));
  const chips: EntryFilterChip[] = [];
  for (const id of filters.divisions) {
    chips.push({ group: 'divisions', value: id, label: divisionName.get(id) ?? 'Division' });
  }
  for (const s of filters.statuses) {
    chips.push({ group: 'statuses', value: s, label: STATUS_LABELS[s] });
  }
  for (const k of filters.eligibility) {
    chips.push({ group: 'eligibility', value: k, label: ELIGIBILITY_LABELS[k] });
  }
  for (const p of filters.payment) {
    chips.push({ group: 'payment', value: p, label: PAYMENT_LABELS[p] });
  }
  for (const p of filters.partner) {
    chips.push({ group: 'partner', value: p, label: PARTNER_LABELS[p] });
  }
  if (filters.includeClosed) {
    chips.push({ group: 'includeClosed', value: '', label: 'Showing closed' });
  }
  if (filters.search.trim()) {
    chips.push({ group: 'search', value: '', label: `"${filters.search.trim()}"` });
  }
  return chips;
}

/** Removes one value from one filter group (or clears the group entirely for the two scalar ones). */
export function clearEntryFilter(
  filters: EntryFilters,
  group: EntryFilterGroup,
  value: string,
): EntryFilters {
  switch (group) {
    case 'divisions':
      return { ...filters, divisions: filters.divisions.filter((v) => v !== value) };
    case 'statuses':
      return { ...filters, statuses: filters.statuses.filter((v) => v !== value) };
    case 'eligibility':
      return { ...filters, eligibility: filters.eligibility.filter((v) => v !== value) };
    case 'payment':
      return { ...filters, payment: filters.payment.filter((v) => v !== value) };
    case 'partner':
      return { ...filters, partner: filters.partner.filter((v) => v !== value) };
    case 'includeClosed':
      return { ...filters, includeClosed: false };
    case 'search':
      return { ...filters, search: '' };
  }
}

/** Back to "Any" everywhere. */
export function clearAllEntryFilters(): EntryFilters {
  return { ...DEFAULT_FILTERS };
}

// ---------------------------------------------------------------------------
// Sort (master_plan §2AG/A5) - an Excel-like column sort over the already-loaded list.
// ---------------------------------------------------------------------------

export type EntrySortKey =
  | 'needs_me'
  | 'name'
  | 'division'
  | 'status'
  | 'registered_at'
  | 'amount'
  | 'eligibility'
  | 'payment';

export interface EntrySort {
  key: EntrySortKey;
  dir: 'asc' | 'desc';
}

/** Entries needing a decision first, then the rest, newest first - the screen an organizer opens
 *  should land on work, not on a chronological archive. Unchanged from before this batch. */
export const DEFAULT_SORT: EntrySort = { key: 'needs_me', dir: 'asc' };

function primaryCompare(
  a: OrganizerRegistration,
  b: OrganizerRegistration,
  key: EntrySortKey,
): number {
  switch (key) {
    case 'needs_me': {
      const aWork = queuesFor(a).length > 0 ? 0 : 1;
      const bWork = queuesFor(b).length > 0 ? 0 : 1;
      return aWork - bWork;
    }
    case 'name':
      return teamLabel(a).localeCompare(teamLabel(b));
    case 'division':
      return a.divisionName.localeCompare(b.divisionName);
    case 'status':
      // Sorted by the label the organizer actually sees in the column, not the raw enum.
      return statusChip(a).label.localeCompare(statusChip(b).label);
    case 'registered_at':
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    case 'amount':
      return (a.amountDue ?? 0) - (b.amountDue ?? 0);
    case 'eligibility':
      return a.eligibilityStatus.localeCompare(b.eligibilityStatus);
    case 'payment':
      return (a.paymentStatus ?? '').localeCompare(b.paymentStatus ?? '');
  }
}

/**
 * `sortEntries(entries)` with no second argument is the unchanged default: needs-a-decision first,
 * newest first inside each group. Every other key is a deterministic column sort with a stable
 * secondary sort by registration date, so two entries that tie on the chosen column never reorder
 * between renders.
 */
export function sortEntries(
  entries: readonly OrganizerRegistration[],
  sort: EntrySort = DEFAULT_SORT,
): OrganizerRegistration[] {
  const dirMul = sort.dir === 'desc' ? -1 : 1;
  return [...entries].sort((a, b) => {
    const primary = primaryCompare(a, b, sort.key) * dirMul;
    if (primary !== 0) return primary;
    // Stable secondary: newest first, matching the pre-A5 tie-break exactly.
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}
