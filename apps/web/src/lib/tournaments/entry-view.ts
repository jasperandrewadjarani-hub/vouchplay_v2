import type { OrganizerRegistration } from './registration-queries';

/**
 * How one registration presents itself in the organizer's list (master_plan §2BH).
 *
 * Pure and shared so the row, the team card, the filters and the sort control cannot disagree about
 * what state an entry is in. §2BH replaces the old single-bucket model (§2BG) with two independent
 * axes so the tab counts reconcile with Overview by construction: a status split (`statusView` -
 * unconfirmed/confirmed/closed, an entry sits in exactly one) and a to-do list (`needsReasons`/
 * `isNeeds`) that can be true of an entry in ANY status, confirmed included. "Confirmed" always means
 * every `status = confirmed` entry, whether or not it also needs something from the organizer.
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
// Needs you - a to-do list independent of status (master_plan §2BH Decision C)
// ---------------------------------------------------------------------------

/** Priority order: the FIRST reason present is the one the verdict pill leads with. */
export type NeedsReason = 'cancel' | 'receipt' | 'topup' | 'rule';

export const NEEDS_REASON_LABELS: Record<NeedsReason, string> = {
  cancel: 'Wants to cancel',
  receipt: 'Check receipt',
  topup: 'Top-up due',
  rule: 'Rule check',
};

/** Short chip labels for the reason chips inside the Needs-you refine group. */
export const NEEDS_REASON_SHORT: Record<NeedsReason, string> = {
  cancel: 'Cancel',
  receipt: 'Receipts',
  topup: 'Top-up',
  rule: 'Rules',
};

/**
 * Every reason THIS entry currently needs the organizer's attention, in priority order. Empty for a
 * closed entry - closed entries never need anything from the organizer again. Unlike §2BG, "needs" is
 * independent of status: a CONFIRMED entry can still need a receipt checked or a cancellation decided
 * (master_plan §2BH Decision C), so this never excludes confirmed entries by itself.
 *
 * "rule" is deliberately narrow: only a hard eligibility problem (`skill_mismatch` /
 * `ineligible_hard_rule`) on an entry the organizer has not yet confirmed. `review` is an advisory
 * evidence gap (unrated, low confidence, few vouches, playing down one level) - never a to-do, and
 * confirming a team is the organizer's own eligibility decision, so a hard-rule flag stops being a
 * to-do once they have confirmed anyway.
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
  if (
    (entry.eligibilityStatus === 'skill_mismatch' ||
      entry.eligibilityStatus === 'ineligible_hard_rule') &&
    entry.status !== 'confirmed'
  ) {
    reasons.push('rule');
  }
  return reasons;
}

/** Whether this entry belongs on the "Needs you" to-do list at all. */
export function isNeeds(entry: OrganizerRegistration): boolean {
  return needsReasons(entry).length > 0;
}

// ---------------------------------------------------------------------------
// Status split - what Overview's "Confirmed teams" also counts (master_plan §2BH Decision B)
// ---------------------------------------------------------------------------

export type StatusView = 'all' | 'unconfirmed' | 'confirmed';

export const STATUS_VIEW_LABELS: Record<StatusView, string> = {
  all: 'All',
  unconfirmed: 'Not confirmed',
  confirmed: 'Confirmed',
};

/** One short plain-language sentence under the segmented control, so "what is Not confirmed?" is
 *  answered on screen without a tooltip (master_plan §2BH Decision B). */
export const STATUS_VIEW_CAPTIONS: Record<StatusView, string> = {
  all: 'Every active entry',
  unconfirmed: 'Registered, not yet confirmed',
  confirmed: 'Confirmed by you',
};

/** Caption shown under the amber "Needs you" button when it is active. */
export const NEEDS_CAPTION = 'Decisions waiting on you';

/** The one status this entry sits in - exclusive, unlike `needsReasons`. `confirmed` here is exactly
 *  what Overview's "Confirmed teams" tile counts: every `status = confirmed` entry, whether or not it
 *  also appears on the Needs-you list. */
export function statusView(entry: OrganizerRegistration): 'unconfirmed' | 'confirmed' | 'closed' {
  if (isClosed(entry)) return 'closed';
  if (entry.status === 'confirmed') return 'confirmed';
  return 'unconfirmed';
}

export interface Verdict {
  label: string;
  /** Semantic tone. Never the only signal: the label always carries the meaning too (§34A). */
  tone: 'action' | 'waiting' | 'done' | 'closed';
}

function capitalize(word: string): string {
  return word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word;
}

/** The single pill a row/card shows (master_plan §2BH). Closed wins first; a needs-you reason (any
 *  status, confirmed included) wins next; then the plain status/payment read. */
export function entryVerdict(entry: OrganizerRegistration): Verdict {
  if (isClosed(entry)) {
    return { label: capitalize(entry.status), tone: 'closed' };
  }

  const reasons = needsReasons(entry);
  if (reasons.length > 0) {
    return { label: NEEDS_REASON_LABELS[reasons[0]!], tone: 'action' };
  }

  if (entry.status === 'confirmed') {
    return { label: 'Confirmed', tone: 'done' };
  }

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

/** The money read on a row - "Paid" always means VERIFIED, never "a receipt exists" (master_plan
 *  §2BH Decision D). A submitted, unverified receipt now says so explicitly instead of reading
 *  "Unpaid". */
export function moneyRead(entry: OrganizerRegistration): string {
  if (isFreeEntry(entry)) return 'Free';
  const summary = entry.paymentSummary;
  if (summary.teamReceipt === 'verified' || summary.state === 'paid') return 'Paid';
  if (summary.state === 'refunded') return 'Refunded';
  if (summary.paidSeats > 0 && summary.submittedSeats > 0) {
    return `${summary.paidSeats} paid · ${summary.submittedSeats} sent`;
  }
  if (summary.paidSeats > 0) {
    return `${summary.paidSeats} of ${summary.totalSeats} paid`;
  }
  if (summary.teamReceipt === 'submitted') {
    const amount = amountLabel(entry);
    return amount ? `${amount} sent` : 'Receipt sent';
  }
  if (summary.submittedSeats > 0) {
    return `${summary.submittedSeats} of ${summary.totalSeats} sent`;
  }
  return 'Unpaid';
}

export type PaymentState = 'unpaid' | 'sent' | 'partial' | 'paid';

/** The same read as `moneyRead`, collapsed to the filter enum. `sent` is new in §2BH: a submitted,
 *  unverified receipt is not the same as no payment at all. */
export function paymentState(entry: OrganizerRegistration): PaymentState {
  if (isFreeEntry(entry)) return 'paid';
  const summary = entry.paymentSummary;
  if (summary.teamReceipt === 'verified' || summary.state === 'paid') return 'paid';
  if (summary.paidSeats > 0) return 'partial';
  if (
    summary.teamReceipt === 'submitted' ||
    summary.submittedSeats > 0 ||
    entry.paymentStatus === 'submitted'
  ) {
    return 'sent';
  }
  return 'unpaid';
}

export type EntryFlag = 'partner_pending' | 'unverified' | 'low_evidence' | 'eligibility_note';

export const ENTRY_FLAG_LABELS: Record<EntryFlag, string> = {
  partner_pending: 'Partner not confirmed',
  unverified: 'Unverified account',
  low_evidence: 'Low evidence',
  eligibility_note: 'Eligibility note',
};

/** The small muted-text flags a row's third line shows, in words - no icon-only meaning (master_plan
 *  §2BH Decision E). Order: unverified, partner pending, then EITHER a quiet "Low evidence" note
 *  (advisory `review` eligibility) OR an "Eligibility note" for a hard-rule/mismatch flag that
 *  survived onto an already-confirmed entry (the organizer confirmed it anyway - worth a note, never
 *  a to-do). Closed entries carry no flags. */
export function entryFlags(entry: OrganizerRegistration): EntryFlag[] {
  if (isClosed(entry)) return [];
  const flags: EntryFlag[] = [];
  if (entry.members.some((m) => m.unverified === true)) flags.push('unverified');
  if (hasUnconfirmedPartner(entry)) flags.push('partner_pending');
  if (entry.eligibilityStatus === 'review') {
    flags.push('low_evidence');
  } else if (
    (entry.eligibilityStatus === 'skill_mismatch' ||
      entry.eligibilityStatus === 'ineligible_hard_rule') &&
    entry.status === 'confirmed'
  ) {
    flags.push('eligibility_note');
  }
  return flags;
}

/** Lowercases and strips punctuation that changes nothing about whether a nickname repeats the name -
 *  quotes (straight and curly), dots, commas - then collapses whitespace. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”'".,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The nickname shown beside a member's name, suppressed when it says nothing new - empty, the same
 *  as the first name, or (master_plan §2BH Finding 3) already CONTAINED in the full name, however it
 *  is punctuated - "MOH “MOH NASSER” NASSER JAPALALI" must not repeat itself. */
export function memberDisplay(m: { name: string; nickname?: string | null }): {
  name: string;
  nickname: string | null;
} {
  const trimmedName = m.name.trim();
  const nickname = m.nickname?.trim() || null;
  if (!nickname) return { name: m.name, nickname: null };
  const normalizedName = normalize(trimmedName);
  const normalizedNickname = normalize(nickname);
  const firstName = trimmedName.split(/\s+/)[0] ?? '';
  if (
    !normalizedNickname ||
    normalizedName.includes(normalizedNickname) ||
    normalizedNickname === normalize(firstName)
  ) {
    return { name: m.name, nickname: null };
  }
  return { name: m.name, nickname };
}

/** The team-card header name (master_plan §2BH Decision F): each member reduced to its nickname (or
 *  first name when it has none), joined with " & ", plus "Open seat" when the team is short a player.
 *  Distinct from `teamLabel` (kept, unchanged) which always uses full legal names. */
export function teamName(entry: OrganizerRegistration): string {
  if (entry.members.length === 0) return 'Unnamed team';
  const parts = entry.members.map((m) => {
    const display = memberDisplay(m);
    if (display.nickname) return display.nickname;
    const trimmed = m.name.trim();
    return trimmed.split(/\s+/)[0] || m.name;
  });
  if (hasOpenSeat(entry)) parts.push('Open seat');
  return parts.join(' & ');
}

// ---------------------------------------------------------------------------
// Filters (master_plan §2BH Decision B) - a status split plus a "Needs you" to-do toggle, plus the
// small refine sheet.
// ---------------------------------------------------------------------------

export interface EntryFilters {
  /** The "Needs you" amber button - a to-do filter ANDed with whatever status view is selected, not a
   *  tab of its own (master_plan §2BH Decision B). */
  needsOnly: boolean;
  status: StatusView;
  /** Only applied when `needsOnly` is true and `search` is empty. OR within the group. */
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
  needsOnly: false,
  status: 'all',
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
 * Closed entries are excluded unless `includeClosed`. A non-empty search IGNORES `needsOnly`,
 * `status` and `reasons` and matches across every open (and, if included, closed) entry - "did Maria
 * get in?" should never depend on which view is selected. Otherwise `status` decides the view (`all`
 * = every open entry, `unconfirmed`/`confirmed` = that exact `statusView`), and `needsOnly` further
 * ANDs the to-do list into whichever view is selected, with `reasons` narrowing it OR-within-group.
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

    const view = statusView(entry);
    if (f.status === 'unconfirmed' && view !== 'unconfirmed') return false;
    if (f.status === 'confirmed' && view !== 'confirmed') return false;
    // f.status === 'all': every open entry reaching here passes (closed ones already excluded above
    // unless includeClosed, in which case 'all' shows them too).

    if (f.needsOnly) {
      if (!isNeeds(entry)) return false;
      if (f.reasons.length > 0) {
        const reasons = needsReasons(entry);
        if (!reasons.some((r) => f.reasons.includes(r))) return false;
      }
    }

    return true;
  });
}

export interface ViewCounts {
  needs: number;
  all: number;
  unconfirmed: number;
  confirmed: number;
  closed: number;
  reasons: Record<NeedsReason, number>;
}

/**
 * The tab/button counts, so tapping one shows exactly the number promised. Counts after applying the
 * refine filters (divisions, payment, account, partner) but NOT `status`, `needsOnly`, `reasons`,
 * `search`, or `includeClosed` - so switching views, toggling Needs-you, typing a search, or toggling
 * "show closed" never makes the badges themselves flicker. `all` = `unconfirmed` + `confirmed` (open
 * entries only); `closed` is separate and always counted regardless of `includeClosed`. `needs` and
 * `reasons`, though, are counted WITHIN the CURRENTLY SELECTED `f.status` view - they answer "what
 * will tapping Needs-you show me right now", not "across every status".
 */
export function countViews(entries: readonly OrganizerRegistration[], f: EntryFilters): ViewCounts {
  const counts: ViewCounts = {
    needs: 0,
    all: 0,
    unconfirmed: 0,
    confirmed: 0,
    closed: 0,
    reasons: { cancel: 0, receipt: 0, topup: 0, rule: 0 },
  };

  for (const entry of entries) {
    if (!passesRefineFilters(entry, f)) continue;

    const view = statusView(entry);
    if (view === 'closed') {
      counts.closed += 1;
      continue;
    }

    counts.all += 1;
    if (view === 'unconfirmed') counts.unconfirmed += 1;
    else counts.confirmed += 1;

    const inSelectedStatusView = f.status === 'all' || f.status === view;
    if (!inSelectedStatusView) continue;

    if (isNeeds(entry)) {
      counts.needs += 1;
      for (const reason of needsReasons(entry)) counts.reasons[reason] += 1;
    }
  }

  return counts;
}

/** How many refine-sheet selections are active - divisions are counted separately by the UI. */
export function activeRefineCount(f: EntryFilters): number {
  return f.payment.length + f.account.length + f.partner.length + (f.includeClosed ? 1 : 0);
}

/** Resets the refine sheet only - status, needsOnly, reasons, divisions and search are untouched. */
export function clearRefine(f: EntryFilters): EntryFilters {
  return { ...f, payment: [], account: [], partner: [], includeClosed: false };
}

// ---------------------------------------------------------------------------
// Sort (master_plan §2AG/A5, §2BH) - an Excel-like column sort over the already-loaded list.
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

/** master_plan §2BH: needs -> unconfirmed -> confirmed -> closed. A needs-you reason outranks status
 *  entirely (a confirmed entry that still needs a receipt checked sorts with the to-do list, not with
 *  the routine confirmed entries). */
function viewRank(entry: OrganizerRegistration): number {
  if (isNeeds(entry)) return 0;
  switch (statusView(entry)) {
    case 'unconfirmed':
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
      return viewRank(a) - viewRank(b);
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
