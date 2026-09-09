import { describe, expect, it } from 'vitest';
import type { OrganizerRegistration } from './registration-queries';
import {
  amountLabel,
  countEntries,
  DEFAULT_FILTERS,
  filterEntries,
  hasUnconfirmedPartner,
  isClosed,
  queuesFor,
  sortEntries,
  statusChip,
  teamLabel,
} from './entry-view';

function entry(over: Partial<OrganizerRegistration> = {}): OrganizerRegistration {
  return {
    id: 'r1',
    teamId: 't1',
    divisionId: 'd1',
    divisionName: "Men's Doubles Low Intermediate",
    status: 'payment_pending',
    eligibilityStatus: 'eligible',
    eligibilitySnapshot: {},
    slotHoldExpiresAt: null,
    createdAt: '2026-09-09T00:00:00Z',
    members: [
      { id: 'p1', name: 'Maria Cruz', slug: 'maria', avatarUrl: null },
      { id: 'p2', name: 'Ana Reyes', slug: 'ana', avatarUrl: null },
    ],
    unconfirmedMemberIds: [],
    cancellationRequest: null,
    paymentId: null,
    paymentStatus: null,
    amountDue: null,
    currency: null,
    hasProof: false,
    ...over,
  };
}

describe('what the organizer must do next', () => {
  it('puts a submitted receipt in the payment queue', () => {
    expect(queuesFor(entry({ paymentStatus: 'submitted' }))).toContain('needs_payment_review');
  });

  it('puts an entry in BOTH queues when a paid player asks to cancel', () => {
    // A paid entry whose player wants out needs two decisions, not one.
    const q = queuesFor(
      entry({
        paymentStatus: 'submitted',
        cancellationRequest: { reason: 'injured', requestedAt: '2026-09-09T01:00:00Z' },
      }),
    );
    expect(q).toEqual(expect.arrayContaining(['needs_payment_review', 'cancellation_requested']));
  });

  it('never queues a closed entry, whatever else is true of it', () => {
    // Closed entries are history. Leaving them in a work queue is how a queue stops being trusted.
    expect(
      queuesFor(
        entry({ status: 'withdrawn', paymentStatus: 'submitted', eligibilityStatus: 'review' }),
      ),
    ).toEqual([]);
  });

  it('treats every closed status as closed', () => {
    for (const status of ['withdrawn', 'cancelled', 'rejected', 'refunded']) {
      expect(isClosed(entry({ status }))).toBe(true);
    }
    expect(isClosed(entry({ status: 'confirmed' }))).toBe(false);
  });
});

describe('the chip says what to do, not what the column holds', () => {
  it('leads with a cancellation request over a payment', () => {
    expect(
      statusChip(
        entry({
          paymentStatus: 'submitted',
          cancellationRequest: { reason: 'x', requestedAt: '2026-09-09T00:00:00Z' },
        }),
      ),
    ).toEqual({ label: 'Cancellation asked', tone: 'action' });
  });

  it('asks for a payment check before anything routine', () => {
    expect(statusChip(entry({ paymentStatus: 'submitted' })).tone).toBe('action');
  });

  it('marks a confirmed entry done', () => {
    expect(statusChip(entry({ status: 'confirmed' })).tone).toBe('done');
  });

  it('shows a closed entry as closed, in plain words', () => {
    expect(statusChip(entry({ status: 'withdrawn' }))).toEqual({
      label: 'withdrawn',
      tone: 'closed',
    });
  });
});

describe('scanning', () => {
  it('labels a team by the people in it', () => {
    expect(teamLabel(entry())).toBe('Maria Cruz & Ana Reyes');
  });

  it('never shows an id when a team has no members', () => {
    expect(teamLabel(entry({ members: [] }))).toBe('Unnamed team');
  });

  it('flags a partner who has not confirmed', () => {
    expect(hasUnconfirmedPartner(entry({ unconfirmedMemberIds: ['p2'] }))).toBe(true);
    expect(hasUnconfirmedPartner(entry())).toBe(false);
  });

  it('shows money only when there is money', () => {
    expect(amountLabel(entry({ amountDue: 3000, currency: 'PHP' }))).toBe('PHP 3,000');
    expect(amountLabel(entry({ amountDue: 0, currency: 'PHP' }))).toBeNull();
    expect(amountLabel(entry())).toBeNull();
  });
});

describe('filtering', () => {
  const rows = [
    entry({ id: 'a', paymentStatus: 'submitted' }),
    entry({ id: 'b', status: 'withdrawn' }),
    entry({
      id: 'c',
      divisionName: "Women's Doubles",
      members: [{ id: 'p9', name: 'Lyn Uy', slug: 'lyn', avatarUrl: null }],
    }),
  ];

  it('hides closed entries by default', () => {
    // The reported complaint: withdrawn entries filled the screen.
    expect(filterEntries(rows, DEFAULT_FILTERS).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('shows them only when asked', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, includeClosed: true }).map((r) => r.id),
    ).toEqual(['a', 'b', 'c']);
  });

  it('filters to one queue', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, queue: 'needs_payment_review' }).map((r) => r.id),
    ).toEqual(['a']);
  });

  it('searches by player name, which is the question organizers are actually asked', () => {
    expect(filterEntries(rows, { ...DEFAULT_FILTERS, search: 'lyn' }).map((r) => r.id)).toEqual([
      'c',
    ]);
    expect(filterEntries(rows, { ...DEFAULT_FILTERS, search: 'MARIA' }).map((r) => r.id)).toEqual([
      'a',
    ]);
  });

  it('filters by division', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, divisionName: "Women's Doubles" }).map((r) => r.id),
    ).toEqual(['c']);
  });
});

describe('ordering and counts', () => {
  it('puts entries needing a decision first', () => {
    const needsWork = entry({
      id: 'work',
      paymentStatus: 'submitted',
      createdAt: '2026-09-01T00:00:00Z',
    });
    const routine = entry({
      id: 'routine',
      status: 'confirmed',
      createdAt: '2026-09-08T00:00:00Z',
    });
    expect(sortEntries([routine, needsWork]).map((r) => r.id)).toEqual(['work', 'routine']);
  });

  it('counts each queue, and excludes closed entries from all of them', () => {
    const counts = countEntries([
      entry({ paymentStatus: 'submitted' }),
      entry({ cancellationRequest: { reason: 'x', requestedAt: '2026-09-09T00:00:00Z' } }),
      entry({ eligibilityStatus: 'skill_mismatch' }),
      entry({ status: 'cancelled', paymentStatus: 'submitted' }),
    ]);
    expect(counts).toEqual({
      open: 3,
      closed: 1,
      needsPaymentReview: 1,
      cancellationRequested: 1,
      needsEligibilityReview: 1,
    });
  });
});
