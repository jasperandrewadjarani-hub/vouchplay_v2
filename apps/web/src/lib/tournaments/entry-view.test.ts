import { describe, expect, it } from 'vitest';
import type { EntryPaymentSummary, TeamReceiptState } from '@vouchplay/core';
import type { OrganizerRegistration } from './registration-queries';
import {
  amountLabel,
  clearAllEntryFilters,
  clearEntryFilter,
  countEntries,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  describeEntryChips,
  filterEntries,
  hasOpenSeat,
  hasUnconfirmedPartner,
  isClosed,
  queuesFor,
  sortEntries,
  statusChip,
  teamLabel,
  type EntryFilters,
} from './entry-view';

/** master_plan §2AO A2/A6: the fixture derives a sensible `paymentSummary` from `paymentStatus` (so
 *  every pre-existing test below - written before slots existed - still describes the same money
 *  state), while a test that needs a slot-driven state (partial/topup/declined-by-seat) can still pass
 *  `paymentSummary` explicitly and have it win outright. */
function summaryFromPaymentStatus(
  paymentStatus: string | null,
  teamSize: number,
): EntryPaymentSummary {
  const totalSeats = Math.max(1, teamSize);
  const teamReceipt: TeamReceiptState =
    paymentStatus === 'verified'
      ? 'verified'
      : paymentStatus === 'submitted'
        ? 'submitted'
        : paymentStatus === 'rejected'
          ? 'rejected'
          : 'none';
  if (teamReceipt === 'verified') {
    return {
      state: 'paid',
      fullyPaid: true,
      anyReceipt: true,
      paidSeats: totalSeats,
      submittedSeats: 0,
      totalSeats,
      seats: [],
      teamReceipt,
      topupDue: 0,
    };
  }
  if (teamReceipt === 'submitted') {
    return {
      state: 'submitted',
      fullyPaid: false,
      anyReceipt: true,
      paidSeats: 0,
      submittedSeats: totalSeats,
      totalSeats,
      seats: [],
      teamReceipt,
      topupDue: 0,
    };
  }
  if (teamReceipt === 'rejected') {
    return {
      state: 'declined',
      fullyPaid: false,
      anyReceipt: false,
      paidSeats: 0,
      submittedSeats: 0,
      totalSeats,
      seats: [],
      teamReceipt,
      topupDue: 0,
    };
  }
  return {
    state: 'unpaid',
    fullyPaid: false,
    anyReceipt: false,
    paidSeats: 0,
    submittedSeats: 0,
    totalSeats,
    seats: [],
    teamReceipt,
    topupDue: 0,
  };
}

function entry(over: Partial<OrganizerRegistration> = {}): OrganizerRegistration {
  const teamSize = over.teamSize ?? 2;
  const paymentStatus = over.paymentStatus ?? null;
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
    teamSize: 2,
    cancellationRequest: null,
    paymentId: null,
    paymentStatus: null,
    amountDue: null,
    currency: null,
    hasProof: false,
    paymentSummary: summaryFromPaymentStatus(paymentStatus, teamSize),
    slots: [],
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

  it('shows "Partially paid X/Y" when one seat is paid and there is no top-up owed (§2AO A6)', () => {
    const chip = statusChip(
      entry({
        paymentSummary: {
          state: 'partial',
          fullyPaid: false,
          anyReceipt: true,
          paidSeats: 1,
          submittedSeats: 0,
          totalSeats: 2,
          seats: [],
          teamReceipt: 'none',
          topupDue: 0,
        },
      }),
    );
    expect(chip).toEqual({ label: 'Partially paid 1/2', tone: 'waiting' });
  });

  it('shows "Top-up needed" instead when a partial state carries a topupDue (§2AO A6)', () => {
    const chip = statusChip(
      entry({
        paymentSummary: {
          state: 'partial',
          fullyPaid: false,
          anyReceipt: true,
          paidSeats: 1,
          submittedSeats: 0,
          totalSeats: 2,
          seats: [],
          teamReceipt: 'none',
          topupDue: 500,
        },
      }),
    );
    expect(chip).toEqual({ label: 'Top-up needed', tone: 'action' });
  });

  it('shows "Paid" when every seat is paid via slots but settlement has not confirmed yet (§2AO A6)', () => {
    const chip = statusChip(
      entry({
        paymentSummary: {
          state: 'paid',
          fullyPaid: true,
          anyReceipt: true,
          paidSeats: 2,
          submittedSeats: 0,
          totalSeats: 2,
          seats: [],
          teamReceipt: 'none',
          topupDue: 0,
        },
      }),
    );
    expect(chip).toEqual({ label: 'Paid', tone: 'done' });
  });

  it('flags a submitted attached seat receipt as "Check payment" even with no team payment', () => {
    const chip = statusChip(
      entry({
        paymentSummary: {
          state: 'submitted',
          fullyPaid: false,
          anyReceipt: true,
          paidSeats: 0,
          submittedSeats: 1,
          totalSeats: 2,
          seats: [],
          teamReceipt: 'none',
          topupDue: 0,
        },
      }),
    );
    expect(chip).toEqual({ label: 'Check payment', tone: 'action' });
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

  it('flags a genuinely open seat - short a player against the division team size', () => {
    expect(
      hasOpenSeat(
        entry({ members: [{ id: 'p1', name: 'Maria Cruz', slug: 'maria', avatarUrl: null }] }),
      ),
    ).toBe(true);
    expect(hasOpenSeat(entry())).toBe(false);
  });

  it('a singles team (team size 1) never has an open seat', () => {
    expect(
      hasOpenSeat(
        entry({
          teamSize: 1,
          members: [{ id: 'p1', name: 'Maria Cruz', slug: 'maria', avatarUrl: null }],
        }),
      ),
    ).toBe(false);
  });

  it('shows money only when there is money', () => {
    expect(amountLabel(entry({ amountDue: 3000, currency: 'PHP' }))).toBe('PHP 3,000');
    expect(amountLabel(entry({ amountDue: 0, currency: 'PHP' }))).toBeNull();
    expect(amountLabel(entry())).toBeNull();
  });
});

describe('counts', () => {
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

describe('combinable filters - AND across groups, OR within a group', () => {
  const rows = [
    entry({ id: 'a', divisionId: 'd1', divisionName: "Men's Doubles", paymentStatus: 'submitted' }),
    entry({ id: 'b', divisionId: 'd1', divisionName: "Men's Doubles", status: 'withdrawn' }),
    entry({
      id: 'c',
      divisionId: 'd2',
      divisionName: "Women's Doubles",
      members: [
        { id: 'p9', name: 'Lyn Uy', slug: 'lyn', avatarUrl: null },
        { id: 'p10', name: 'Rica Santos', slug: 'rica', avatarUrl: null },
      ],
    }),
    entry({
      id: 'd',
      divisionId: 'd2',
      divisionName: "Women's Doubles",
      status: 'confirmed',
      eligibilityStatus: 'review',
      hasProof: true,
      unconfirmedMemberIds: ['p2'],
    }),
    entry({ id: 'e', divisionId: 'd3', divisionName: 'Mixed Doubles', status: 'rejected' }),
  ];

  it('DEFAULT_FILTERS applies no constraint (every group empty = "Any") except hiding closed', () => {
    expect(filterEntries(rows, DEFAULT_FILTERS).map((r) => r.id)).toEqual(['a', 'c', 'd']);
  });

  it('the legacy "show closed" switch shows ONLY closed when no Status is picked (§2O, unchanged)', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, includeClosed: true }).map((r) => r.id),
    ).toEqual(['b', 'e']);
  });

  it('an explicit Status pick shows a closed status even with "show closed" off', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, statuses: ['withdrawn'] }).map((r) => r.id),
    ).toEqual(['b']);
  });

  it('an explicit Status pick is authoritative even with "show closed" on - only that status shows', () => {
    expect(
      filterEntries(rows, {
        ...DEFAULT_FILTERS,
        statuses: ['confirmed'],
        includeClosed: true,
      }).map((r) => r.id),
    ).toEqual(['d']);
  });

  it('Status is OR within the group: two picked statuses both show', () => {
    expect(
      filterEntries(rows, {
        ...DEFAULT_FILTERS,
        statuses: ['withdrawn', 'rejected'],
      }).map((r) => r.id),
    ).toEqual(['b', 'e']);
  });

  it('Division is OR within the group', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, divisions: ['d2', 'd3'] }).map((r) => r.id),
    ).toEqual(['c', 'd']); // 'e' is closed and hidden by the default closed-gate
  });

  it('Eligibility filters to the picked kinds', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, eligibility: ['review'] }).map((r) => r.id),
    ).toEqual(['d']);
  });

  it('Payment filters to has/no receipt', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, payment: ['has_proof'] }).map((r) => r.id),
    ).toEqual(['d']);
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, payment: ['no_proof'] }).map((r) => r.id),
    ).toEqual(['a', 'c']);
  });

  it('Payment also filters to the paymentSummary state "partial"/"paid" (§2AO A6)', () => {
    const withSeatStates = [
      ...rows,
      entry({
        id: 'g',
        divisionId: 'd1',
        divisionName: "Men's Doubles",
        paymentSummary: {
          state: 'partial',
          fullyPaid: false,
          anyReceipt: true,
          paidSeats: 1,
          submittedSeats: 0,
          totalSeats: 2,
          seats: [],
          teamReceipt: 'none',
          topupDue: 0,
        },
      }),
      entry({
        id: 'h',
        divisionId: 'd1',
        divisionName: "Men's Doubles",
        paymentSummary: {
          state: 'paid',
          fullyPaid: true,
          anyReceipt: true,
          paidSeats: 2,
          submittedSeats: 0,
          totalSeats: 2,
          seats: [],
          teamReceipt: 'none',
          topupDue: 0,
        },
      }),
    ];
    expect(
      filterEntries(withSeatStates, { ...DEFAULT_FILTERS, payment: ['partial'] }).map((r) => r.id),
    ).toEqual(['g']);
    expect(
      filterEntries(withSeatStates, { ...DEFAULT_FILTERS, payment: ['paid'] }).map((r) => r.id),
    ).toEqual(['h']);
  });

  it('Partner filters to confirmed/unconfirmed', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, partner: ['unconfirmed'] }).map((r) => r.id),
    ).toEqual(['d']);
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, partner: ['confirmed'] }).map((r) => r.id),
    ).toEqual(['a', 'c']);
  });

  it('Partner filters to "no partner yet" - an open seat wins over unconfirmed/confirmed', () => {
    const withOpenSeat = [
      ...rows,
      entry({
        id: 'f',
        divisionId: 'd1',
        divisionName: "Men's Doubles",
        members: [{ id: 'p1', name: 'Maria Cruz', slug: 'maria', avatarUrl: null }],
      }),
    ];
    expect(
      filterEntries(withOpenSeat, { ...DEFAULT_FILTERS, partner: ['none'] }).map((r) => r.id),
    ).toEqual(['f']);
  });

  it('AND across groups: Division AND Payment both narrow the result', () => {
    expect(
      filterEntries(rows, {
        ...DEFAULT_FILTERS,
        divisions: ['d2'],
        payment: ['has_proof'],
      }).map((r) => r.id),
    ).toEqual(['d']);
  });

  it('search still ANDs with the other groups', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, divisions: ['d2'], search: 'lyn' }).map(
        (r) => r.id,
      ),
    ).toEqual(['c']);
    // 'd' also has the default "Maria Cruz & Ana Reyes" members, so the un-scoped search matches both.
    expect(filterEntries(rows, { ...DEFAULT_FILTERS, search: 'MARIA' }).map((r) => r.id)).toEqual([
      'a',
      'd',
    ]);
  });

  it('every group empty means every group applies no constraint, one at a time', () => {
    const base: EntryFilters = { ...DEFAULT_FILTERS };
    expect(filterEntries(rows, { ...base, divisions: [] })).toEqual(filterEntries(rows, base));
    expect(filterEntries(rows, { ...base, eligibility: [] })).toEqual(filterEntries(rows, base));
    expect(filterEntries(rows, { ...base, payment: [] })).toEqual(filterEntries(rows, base));
    expect(filterEntries(rows, { ...base, partner: [] })).toEqual(filterEntries(rows, base));
  });
});

describe('chip description + clearing', () => {
  const divisions = [
    { id: 'd1', name: "Men's Doubles" },
    { id: 'd2', name: "Women's Doubles" },
  ];

  it('describes every active filter as a removable chip, and none when defaults', () => {
    expect(describeEntryChips(DEFAULT_FILTERS, divisions)).toEqual([]);
    const filters: EntryFilters = {
      divisions: ['d1'],
      statuses: ['confirmed'],
      eligibility: ['review'],
      payment: ['has_proof'],
      partner: ['unconfirmed'],
      includeClosed: true,
      search: 'maria',
    };
    const chips = describeEntryChips(filters, divisions);
    expect(chips).toEqual([
      { group: 'divisions', value: 'd1', label: "Men's Doubles" },
      { group: 'statuses', value: 'confirmed', label: 'Confirmed' },
      { group: 'eligibility', value: 'review', label: 'Needs review' },
      { group: 'payment', value: 'has_proof', label: 'Has receipt' },
      { group: 'partner', value: 'unconfirmed', label: 'Partner not confirmed' },
      { group: 'includeClosed', value: '', label: 'Showing closed' },
      { group: 'search', value: '', label: '"maria"' },
    ]);
  });

  it('clears one value from an array group without touching the others', () => {
    const filters: EntryFilters = {
      ...DEFAULT_FILTERS,
      divisions: ['d1', 'd2'],
      statuses: ['confirmed'],
    };
    const next = clearEntryFilter(filters, 'divisions', 'd1');
    expect(next.divisions).toEqual(['d2']);
    expect(next.statuses).toEqual(['confirmed']);
  });

  it('clears the two scalar groups outright', () => {
    const filters: EntryFilters = { ...DEFAULT_FILTERS, includeClosed: true, search: 'x' };
    expect(clearEntryFilter(filters, 'includeClosed', '').includeClosed).toBe(false);
    expect(clearEntryFilter(filters, 'search', '').search).toBe('');
  });

  it('clearAllEntryFilters resets to defaults', () => {
    const filters: EntryFilters = {
      divisions: ['d1'],
      statuses: ['confirmed'],
      eligibility: ['review'],
      payment: ['has_proof'],
      partner: ['unconfirmed'],
      includeClosed: true,
      search: 'x',
    };
    expect(clearAllEntryFilters()).toEqual(DEFAULT_FILTERS);
    expect(filterEntries([entry()], clearAllEntryFilters())).toEqual(
      filterEntries([entry()], DEFAULT_FILTERS),
    );
    void filters;
  });
});

describe('sorting - default unchanged, every column key deterministic', () => {
  it('with no sort argument, still needs-a-decision first then newest (unchanged default)', () => {
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
    expect(DEFAULT_SORT).toEqual({ key: 'needs_me', dir: 'asc' });
  });

  it('needs_me desc flips routine entries first', () => {
    const needsWork = entry({ id: 'work', paymentStatus: 'submitted' });
    const routine = entry({ id: 'routine', status: 'confirmed' });
    expect(
      sortEntries([needsWork, routine], { key: 'needs_me', dir: 'desc' }).map((r) => r.id),
    ).toEqual(['routine', 'work']);
  });

  it('name asc/desc', () => {
    const rows = [
      entry({ id: 'z', members: [{ id: 'p1', name: 'Zed Cruz', slug: 'z', avatarUrl: null }] }),
      entry({ id: 'a', members: [{ id: 'p2', name: 'Ana Reyes', slug: 'a', avatarUrl: null }] }),
    ];
    expect(sortEntries(rows, { key: 'name', dir: 'asc' }).map((r) => r.id)).toEqual(['a', 'z']);
    expect(sortEntries(rows, { key: 'name', dir: 'desc' }).map((r) => r.id)).toEqual(['z', 'a']);
  });

  it('division asc/desc', () => {
    const rows = [
      entry({ id: 'w', divisionName: "Women's Doubles" }),
      entry({ id: 'm', divisionName: "Men's Doubles" }),
    ];
    expect(sortEntries(rows, { key: 'division', dir: 'asc' }).map((r) => r.id)).toEqual(['m', 'w']);
    expect(sortEntries(rows, { key: 'division', dir: 'desc' }).map((r) => r.id)).toEqual([
      'w',
      'm',
    ]);
  });

  it('status asc/desc sorts by the label the organizer sees, not the raw enum', () => {
    const rows = [
      entry({ id: 'confirmed', status: 'confirmed' }),
      entry({ id: 'awaiting', status: 'payment_pending' }),
    ];
    const asc = sortEntries(rows, { key: 'status', dir: 'asc' }).map((r) => r.id);
    const desc = sortEntries(rows, { key: 'status', dir: 'desc' }).map((r) => r.id);
    expect(asc).toEqual([...desc].reverse());
    expect(asc.length).toBe(2);
  });

  it('registered_at asc/desc', () => {
    const rows = [
      entry({ id: 'old', createdAt: '2026-09-01T00:00:00Z' }),
      entry({ id: 'new', createdAt: '2026-09-08T00:00:00Z' }),
    ];
    expect(sortEntries(rows, { key: 'registered_at', dir: 'asc' }).map((r) => r.id)).toEqual([
      'old',
      'new',
    ]);
    expect(sortEntries(rows, { key: 'registered_at', dir: 'desc' }).map((r) => r.id)).toEqual([
      'new',
      'old',
    ]);
  });

  it('amount asc/desc, with a free entry (null) sorting as zero', () => {
    const rows = [
      entry({ id: 'free', amountDue: null }),
      entry({ id: 'cheap', amountDue: 500 }),
      entry({ id: 'pricey', amountDue: 3000 }),
    ];
    expect(sortEntries(rows, { key: 'amount', dir: 'asc' }).map((r) => r.id)).toEqual([
      'free',
      'cheap',
      'pricey',
    ]);
    expect(sortEntries(rows, { key: 'amount', dir: 'desc' }).map((r) => r.id)).toEqual([
      'pricey',
      'cheap',
      'free',
    ]);
  });

  it('eligibility asc/desc', () => {
    const rows = [
      entry({ id: 'eligible', eligibilityStatus: 'eligible' }),
      entry({ id: 'review', eligibilityStatus: 'review' }),
    ];
    const asc = sortEntries(rows, { key: 'eligibility', dir: 'asc' }).map((r) => r.id);
    const desc = sortEntries(rows, { key: 'eligibility', dir: 'desc' }).map((r) => r.id);
    expect(asc).toEqual([...desc].reverse());
  });

  it('payment asc/desc, with no payment row (null) sorting first ascending', () => {
    const rows = [
      entry({ id: 'none', paymentId: null, paymentStatus: null }),
      entry({ id: 'verified', paymentId: 'p1', paymentStatus: 'verified' }),
    ];
    expect(sortEntries(rows, { key: 'payment', dir: 'asc' }).map((r) => r.id)).toEqual([
      'none',
      'verified',
    ]);
  });

  it('ties on the chosen column keep a stable, deterministic secondary order by registration date', () => {
    const rows = [
      entry({ id: 'newer', status: 'confirmed', createdAt: '2026-09-08T00:00:00Z' }),
      entry({ id: 'older', status: 'confirmed', createdAt: '2026-09-01T00:00:00Z' }),
    ];
    // Both tie on `status`; the secondary tie-break is always newest-first, regardless of dir.
    expect(sortEntries(rows, { key: 'status', dir: 'asc' }).map((r) => r.id)).toEqual([
      'newer',
      'older',
    ]);
    expect(sortEntries(rows, { key: 'status', dir: 'desc' }).map((r) => r.id)).toEqual([
      'newer',
      'older',
    ]);
  });
});
