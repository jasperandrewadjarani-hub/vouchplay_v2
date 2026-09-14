import type { OrganizerRegistration } from './registration-queries';

/**
 * How one registration presents itself in the organizer's list (master_plan §2BG).
 *
 * Pure and shared so the row, the team card, the filters and the sort control cannot disagree about
 * what state an entry is in. Every open entry sits in exactly ONE bucket - `needsReasons`/
 * `entryBucket` are the one place that decision is made, so the tab counts always add up (Needs me +
 * Waiting + Confirmed = All).
 */

export type EntryQueue =
  'needs_payment_review' | 'cancellation_requested' | 'needs_eligibility_review';

/** Entries an organizer has closed. Hidden by default: they are history, not work. */
export const CLOSED_STATUSES = new Set(['withdrawn', 'cancelled', 'rejected', 'refunded']);

export function isClosed(entry: Pick<OrganizerRegistration, 'status'>): boolean {
  return CLOSED_STATUSES.has(entry.status);
}

/**
 * The queues an entry currently sits in. An entry can be in more than one - a paid entry whose player
 * has asked to cancel needs both decisions - so this returns a set rather than a single bucket. Kept
 * unchanged (master_plan §2BG "Loose ends resolved"): `lib/players/privileged.ts` relies on the same
 * shape of reasoning, and bulk-verify / other older call sites still read this set directly.
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

/** Money as one short string, or null when the division is free. */
export function amountLabel(entry: OrganizerRegistration): string | null {
  if (entry.amountDue == null || entry.amountDue <= 0) return null;
  return `${entry.currency ?? 'PHP'} ${entry.amountDue.toLocaleString('en-US')}`;
}

// ---------------------------------------------------------------------------
// One bucket per entry (master_plan §2BG Decision A)
// ---------------------------------------------------------------------------

export type EntryBucket = 'needs' | 'waiting' | 'confirmed' | 'closed';

/** Priority order: the FIRST reason present is the one the verdict pill leads with. */
export type NeedsReason = 'cancel' | 'receipt' | 'topup' | 'rule';

export const NEEDS_REASON_LABELS: Record<NeedsReason, string> = {
  cancel: 'Wants to cancel',
  receipt: 'Check receipt',
  topup: 'Top-up due',
  rule: 'Rule check',
};

/** Short chip labels for the reason chips inside the Needs-me tab. */
export const NEEDS_REASON_SHORT: Record<NeedsReason, string> = {
  cancel: 'Cancel',
  receipt: 'Receipts',
  topup: 'Top-up',
  rule: 'Rules',
};

/**
 * Every reason THIS entry currently needs the organizer's attention, in priority order. Empty for a
 * closed entry - closed entries never need anything from the organizer again.
 */
export function needsReasons(entry: OrganizerRegistration): NeedsReason[] {
  if (isClosed(entry)) return [];
  const reasons: NeedsReason[] = [];
  if (entry.cancellationRequest != null) reasons.push('cancel');
  const summary = entry.paymentSummary;
  if (
    summary.teamReceipt === 'submitted' ||
    summary.submittedSeats > 0 ||
    entry.paymentStatus === 'submitted'
  ) {
    reasons.push('receipt');
  }
  if (summary.topupDue > 0) reasons.push('topup');
  if (entry.eligibilityStatus !== 'eligible') reasons.push('rule');
  return reasons;
}

/** The one bucket this entry sits in. closed > needs > confirmed > waiting. */
export function entryBucket(entry: OrganizerRegistration): EntryBucket {
  if (isClosed(entry)) return 'closed';
  if (needsReasons(entry).length > 0) return 'needs';
  if (entry.status === 'confirmed') return 'confirmed';
  return 'waiting';
}

export interface Verdict {
  label: string;
  /** Semantic tone. Never the only signal: the label always carries the meaning too (§34A). */
  tone: 'action' | 'waiting' | 'done' | 'closed';
}

function capitalize(word: string): string {
  return word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word;
}

/** The single pill a row/card shows (master_plan §2BG Decision B). */
export function entryVerdict(entry: OrganizerRegistration): Verdict {
  const bucket = entryBucket(entry);

  if (bucket === 'closed') {
    return { label: capitalize(entry.status), tone: 'closed' };
  }

  if (bucket === 'needs') {
    const [first] = needsReasons(entry);
    return { label: NEEDS_REASON_LABELS[first!], tone: 'action' };
  }

  if (bucket === 'confirmed') {
    return { label: 'Confirmed', tone: 'done' };
  }

  // waiting
  if (entry.status === 'waitlisted') return { label: 'Waitlisted', tone: 'waiting' };
  const summary = entry.paymentSummary;
  if (summary.state === 'declined') return { label: 'Receipt declined', tone: 'waiting' };
  if (summary.state === 'partial') {
    return { label: `Partly paid ${summary.paidSeats}/${summary.totalSeats}`, tone: 'waiting' };
  }
  if (isFreeEntry(entry)) return { label: 'Not confirmed', tone: 'waiting' };
  return { label: 'Unpaid', tone: 'waiting' };
}

/** True when nothing about this entry ever involves money. The division fee is the source of truth:
 *  `amountDue` is null until a payment row exists, so an unpaid entry in a paid division with no
 *  receipt yet must NOT read as free. Falls back to the payment/slot amounts only when the fee is
 *  unknown (hand-built fixtures). */
export function isFreeEntry(entry: OrganizerRegistration): boolean {
  if (entry.divisionFee != null) return entry.divisionFee <= 0;
  return (entry.amountDue ?? 0) <= 0 && entry.slots.every((s) => (s.amountDue ?? 0) <= 0);
}

/** The money read on a row - "paid" always means VERIFIED, never "a receipt exists" (master_plan
 *  §2BG Decision B). */
export function moneyRead(entry: OrganizerRegistration): string {
  if (isFreeEntry(entry)) return 'Free';
  const summary = entry.paymentSummary;
  if (summary.teamReceipt === 'verified' || summary.state === 'paid') return 'Paid';
  if (summary.state === 'refunded') return 'Refunded';
  if (summary.totalSeats > 1 && summary.paidSeats > 0) {
    return `${summary.paidSeats} of ${summary.totalSeats} paid`;
  }
  return 'Unpaid';
}

export type PaymentState = 'unpaid' | 'partial' | 'paid';

/** The same read as `moneyRead`, collapsed to the three-value filter enum. */
export function paymentState(entry: OrganizerRegistration): PaymentState {
  if (isFreeEntry(entry)) return 'paid';
  const summary = entry.paymentSummary;
  if (summary.teamReceipt === 'verified' || summary.state === 'paid') return 'paid';
  if (summary.totalSeats > 1 && summary.paidSeats > 0) return 'partial';
  return 'unpaid';
}

export type EntryFlag = 'unverified' | 'partner_pending';

/** The at-most-two small icon flags a row carries (master_plan §2BG Decision B). */
export function entryFlags(entry: OrganizerRegistration): EntryFlag[] {
  const flags: EntryFlag[] = [];
  if (entry.members.some((m) => m.unverified === true)) flags.push('unverified');
  if (hasUnconfirmedPartner(entry)) flags.push('partner_pending');
  return flags;
}

/** The nickname shown beside a member's name, suppressed when it says nothing new - empty, or the
 *  same (case-insensitively) as the first name or the whole name. */
export function memberDisplay(m: { name: string; nickname?: string | null }): {
  name: string;
  nickname: string | null;
} {
  const trimmedName = m.name.trim();
  const nickname = m.nickname?.trim() || null;
  if (!nickname) return { name: m.name, nickname: null };
  const firstName = trimmedName.split(/\s+/)[0] ?? '';
  const lower = nickname.toLowerCase();
  if (lower === trimmedName.toLowerCase() || lower === firstName.toLowerCase()) {
    return { name: m.name, nickname: null };
  }
  return { name: m.name, nickname };
}

// ---------------------------------------------------------------------------
// Filters (master_plan §2BG Decision D) - one axis of tabs (bucket) plus a small refine sheet.
// ---------------------------------------------------------------------------

export type BucketFilter = 'needs' | 'waiting' | 'confirmed' | 'all';

export interface EntryFilters {
  bucket: BucketFilter;
  /** Only applied when `bucket === 'needs'` and `search` is empty. OR within the group. */
  reasons: NeedsReason[];
  /** Division ids (not names - two divisions can share a display name). OR within the group. */
  divisions: string[];
  payment: PaymentState[];
  /** Non-empty means "this entry must carry an unverified member" - the group has one possible value. */
  account: 'unverified'[];
  partner: ('open_seat' | 'pending')[];
  includeClosed: boolean;
  search: string;
}

export const DEFAULT_FILTERS: EntryFilters = {
  bucket: 'needs',
  reasons: [],
  divisions: [],
  payment: [],
  account: [],
  partner: [],
  includeClosed: false,
  search: '',
};

function passesRefineFilters(entry: OrganizerRegistration, f: EntryFilters): boolean {
  if (f.divisions.length > 0 && !f.divisions.includes(entry.divisionId)) return false;
  if (f.payment.length > 0 && !f.payment.includes(paymentState(entry))) return false;
  if (f.account.length > 0 && !entry.members.some((m) => m.unverified === true)) return false;
  if (f.partner.length > 0) {
    const keys: ('open_seat' | 'pending')[] = [];
    if (hasOpenSeat(entry)) keys.push('open_seat');
    if (hasUnconfirmedPartner(entry)) keys.push('pending');
    if (!keys.some((k) => f.partner.includes(k))) return false;
  }
  return true;
}

/**
 * Filtering, in one place. Refine filters (divisions, payment, account, partner) always AND in.
 * Closed entries are excluded unless `includeClosed`. A non-empty search IGNORES bucket and reasons
 * and matches across every open (and, if included, closed) entry - "did Maria get in?" should never
 * depend on which tab is selected. Otherwise the bucket tab decides, and `reasons` further narrows
 * the Needs-me tab only.
 */
export function filterEntries(
  entries: readonly OrganizerRegistration[],
  f: EntryFilters,
): OrganizerRegistration[] {
  const needle = f.search.trim().toLowerCase();

  return entries.filter((entry) => {
    const closed = isClosed(entry);
    if (closed && !f.includeClosed) return false;
    if (!passesRefineFilters(entry, f)) return false;

    if (needle) {
      // §2BG: players are known by their nickname / IGN on court, and organizers are often handed an
      // email - so search matches both, not only the legal name and division (same behaviour as the
      // §2BG hotfix search).
      const extras = entry.members
        .flatMap((m) => [m.nickname, (m as { email?: string | null }).email])
        .filter(Boolean)
        .join(' ');
      const haystack =
        `${teamLabel(entry)} ${extras} ${entry.partnerNote ?? ''} ${entry.divisionName}`.toLowerCase();
      return haystack.includes(needle);
    }

    if (f.bucket === 'all') return true;
    if (closed) return false; // closed entries never sit in needs/waiting/confirmed
    if (entryBucket(entry) !== f.bucket) return false;

    if (f.bucket === 'needs' && f.reasons.length > 0) {
      const reasons = needsReasons(entry);
      if (!reasons.some((r) => f.reasons.includes(r))) return false;
    }

    return true;
  });
}

export interface BucketCounts {
  needs: number;
  waiting: number;
  confirmed: number;
  all: number;
  closed: number;
  reasons: Record<NeedsReason, number>;
}

/**
 * The tab/chip counts, so the tabs can show numbers that match what a tap on them will show. Counts
 * after applying the refine filters (divisions, payment, account, partner) but NOT bucket, reasons,
 * search, or includeClosed - so switching tabs, typing a search, or toggling "show closed" never
 * makes the badges themselves flicker. `all` counts only open entries; `closed` is separate. An entry
 * with two Needs-me reasons counts in both reason buckets.
 */
export function countBuckets(
  entries: readonly OrganizerRegistration[],
  f: EntryFilters,
): BucketCounts {
  const counts: BucketCounts = {
    needs: 0,
    waiting: 0,
    confirmed: 0,
    all: 0,
    closed: 0,
    reasons: { cancel: 0, receipt: 0, topup: 0, rule: 0 },
  };

  for (const entry of entries) {
    if (!passesRefineFilters(entry, f)) continue;

    if (isClosed(entry)) {
      counts.closed += 1;
      continue;
    }

    counts.all += 1;
    const bucket = entryBucket(entry);
    if (bucket === 'needs') {
      counts.needs += 1;
      for (const reason of needsReasons(entry)) counts.reasons[reason] += 1;
    } else if (bucket === 'waiting') {
      counts.waiting += 1;
    } else if (bucket === 'confirmed') {
      counts.confirmed += 1;
    }
  }

  return counts;
}

/** How many refine-sheet selections are active - divisions are counted separately by the UI. */
export function activeRefineCount(f: EntryFilters): number {
  return f.payment.length + f.account.length + f.partner.length + (f.includeClosed ? 1 : 0);
}

/** Resets the refine sheet only - bucket, reasons, divisions and search are untouched. */
export function clearRefine(f: EntryFilters): EntryFilters {
  return { ...f, payment: [], account: [], partner: [], includeClosed: false };
}

// ---------------------------------------------------------------------------
// Sort (master_plan §2AG/A5, §2BG) - an Excel-like column sort over the already-loaded list.
// ---------------------------------------------------------------------------

export type EntrySortKey =
  | 'needs_me'
  | 'needs_first'
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

/** Newest submission first by default (owner request, 2026-09-13): organizers process the queue as it
 *  comes in, so the most recent entries lead. The "Needs me first" sort is still one tap away in the
 *  sort control. */
export const DEFAULT_SORT: EntrySort = { key: 'registered_at', dir: 'desc' };

/** The filter sheet's sort picker (master_plan §2BG Decision D). */
export const SORT_OPTIONS: { key: EntrySortKey; dir: 'asc' | 'desc'; label: string }[] = [
  { key: 'registered_at', dir: 'desc', label: 'Newest first' },
  { key: 'registered_at', dir: 'asc', label: 'Oldest first' },
  { key: 'needs_first', dir: 'asc', label: 'Needs me first' },
  { key: 'name', dir: 'asc', label: 'Team name A–Z' },
  { key: 'division', dir: 'asc', label: 'Division' },
];

function bucketRank(entry: OrganizerRegistration): number {
  switch (entryBucket(entry)) {
    case 'needs':
      return 0;
    case 'waiting':
      return 1;
    case 'confirmed':
      return 2;
    case 'closed':
      return 3;
  }
}

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
    case 'needs_first':
      return bucketRank(a) - bucketRank(b);
    case 'name':
      return teamLabel(a).localeCompare(teamLabel(b));
    case 'division':
      return a.divisionName.localeCompare(b.divisionName);
    case 'status':
      // Sorted by the label the organizer actually sees in the pill, not the raw enum.
      return entryVerdict(a).label.localeCompare(entryVerdict(b).label);
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
 * `sortEntries(entries)` with no second argument is the unchanged default: newest submission first.
 * Every other key is a deterministic column sort with a stable secondary sort by registration date, so
 * two entries that tie on the chosen column never reorder between renders.
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
