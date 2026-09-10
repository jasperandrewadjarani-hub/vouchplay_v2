import type { OrganizerRegistration } from './registration-queries';

/**
 * How one registration presents itself in the organizer's list (master_plan §1Z).
 *
 * Pure and shared so the row, the detail sheet and the queue counts cannot disagree about what state
 * an entry is in. Everything here answers one question: what does this organizer need to decide?
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
 * has asked to cancel needs both decisions - so this returns a set rather than a single bucket.
 */
export function queuesFor(entry: OrganizerRegistration): EntryQueue[] {
  if (isClosed(entry)) return [];
  const queues: EntryQueue[] = [];
  if (entry.paymentStatus === 'submitted') queues.push('needs_payment_review');
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

export interface StatusChip {
  label: string;
  /** Semantic tone. Never the only signal: the label always carries the meaning too (§34A). */
  tone: 'action' | 'waiting' | 'done' | 'closed';
}

/**
 * One chip per entry, chosen by what the ORGANIZER must do next rather than by raw status. A list of
 * database enums is a list an organizer has to translate; this is the translation.
 */
export function statusChip(entry: OrganizerRegistration): StatusChip {
  if (isClosed(entry)) return { label: entry.status.replace(/_/g, ' '), tone: 'closed' };
  if (entry.cancellationRequest) return { label: 'Cancellation asked', tone: 'action' };
  if (entry.paymentStatus === 'submitted') return { label: 'Check payment', tone: 'action' };
  if (entry.status === 'confirmed') return { label: 'Confirmed', tone: 'done' };
  if (entry.status === 'waitlisted') return { label: 'Waitlisted', tone: 'waiting' };
  if (entry.paymentStatus === 'verified') return { label: 'Paid', tone: 'done' };
  if (entry.paymentStatus === 'rejected') return { label: 'Payment rejected', tone: 'action' };
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

export interface EntryFilters {
  divisionName: string;
  queue: 'all' | EntryQueue;
  /** Closed entries are history and stay hidden unless explicitly asked for. */
  includeClosed: boolean;
  search: string;
}

export const DEFAULT_FILTERS: EntryFilters = {
  divisionName: 'all',
  queue: 'all',
  includeClosed: false,
  search: '',
};

/**
 * Filtering, in one place. Search matches a player's name so an organizer can answer "did Maria get
 * in?" - which is the question they are actually asked, and which a status filter cannot answer.
 */
export function filterEntries(
  entries: readonly OrganizerRegistration[],
  filters: EntryFilters,
): OrganizerRegistration[] {
  const needle = filters.search.trim().toLowerCase();
  return entries.filter((e) => {
    // "Show cancelled and withdrawn" is a switch between two views, not an append: checked shows ONLY
    // closed entries (the organizer wants to look at them), unchecked shows only open ones (§2O).
    if (filters.includeClosed ? !isClosed(e) : isClosed(e)) return false;
    if (filters.divisionName !== 'all' && e.divisionName !== filters.divisionName) return false;
    if (filters.queue !== 'all' && !queuesFor(e).includes(filters.queue)) return false;
    if (needle) {
      const haystack = `${teamLabel(e)} ${e.divisionName}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/**
 * Entries needing a decision come first, then the rest, newest first inside each group. An organizer
 * opening this screen should land on work, not on a chronological archive.
 */
export function sortEntries(entries: readonly OrganizerRegistration[]): OrganizerRegistration[] {
  return [...entries].sort((a, b) => {
    const aWork = queuesFor(a).length > 0 ? 0 : 1;
    const bWork = queuesFor(b).length > 0 ? 0 : 1;
    if (aWork !== bWork) return aWork - bWork;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}
