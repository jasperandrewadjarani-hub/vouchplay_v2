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
  moneyTag,
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

describe('moneyTag - a money-only tag straight off paymentSummary (§2AP I)', () => {
  it('shows "Team paid" when the team receipt is verified', () => {
    expect(
      moneyTag(
        entry({
          paymentSummary: {
            state: 'paid',
            fullyPaid: true,
            anyReceipt: true,
            paidSeats: 2,
            submittedSeats: 0,
            totalSeats: 2,
            seats: [],
            teamReceipt: 'verified',
            topupDue: 0,
          },
        }),
      ),
    ).toEqual({ label: 'Team paid', tone: 'done' });
  });

  it('shows "X of Y slots paid" when every seat is paid individually (no team receipt)', () => {
    expect(
      moneyTag(
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
      ),
    ).toEqual({ label: '2 of 2 slots paid', tone: 'done' });
  });

  it('shows "X of Y slots paid" for a partial team with every seat filled', () => {
    expect(
      moneyTag(
        entry({
          paymentSummary: {
            state: 'partial',
            fullyPaid: false,
            anyReceipt: true,
            paidSeats: 1,
            submittedSeats: 0,
            totalSeats: 2,
            seats: [
              { playerId: 'p1', state: 'paid', amountDue: 500, amountSubmitted: 500 },
              { playerId: 'p2', state: 'unpaid', amountDue: 500, amountSubmitted: 0 },
            ],
            teamReceipt: 'none',
            topupDue: 0,
          },
        }),
      ),
    ).toEqual({ label: '1 of 2 slots paid', tone: 'waiting' });
  });

  it('shows "Slot paid - no partner yet" when the partial team has an empty seat', () => {
    expect(
      moneyTag(
        entry({
          members: [{ id: 'p1', name: 'Maria Cruz', slug: 'maria', avatarUrl: null }],
          paymentSummary: {
            state: 'partial',
            fullyPaid: false,
            anyReceipt: true,
            paidSeats: 1,
            submittedSeats: 0,
            totalSeats: 2,
            seats: [
              { playerId: 'p1', state: 'paid', amountDue: 500, amountSubmitted: 500 },
              { playerId: null, state: 'empty', amountDue: 0, amountSubmitted: 0 },
            ],
            teamReceipt: 'none',
            topupDue: 0,
          },
        }),
      ),
    ).toEqual({ label: 'Slot paid · no partner yet', tone: 'waiting' });
  });

  it('surfaces a CONFIRMED entry with a partial summary as an action (§2AP C4), not a routine wait', () => {
    expect(
      moneyTag(
        entry({
          status: 'confirmed',
          paymentSummary: {
            state: 'partial',
            fullyPaid: false,
            anyReceipt: true,
            paidSeats: 1,
            submittedSeats: 0,
            totalSeats: 2,
            seats: [
              { playerId: 'p1', state: 'paid', amountDue: 500, amountSubmitted: 500 },
              { playerId: 'p2', state: 'unpaid', amountDue: 500, amountSubmitted: 0 },
            ],
            teamReceipt: 'none',
            topupDue: 0,
          },
        }),
      ),
    ).toEqual({ label: '1 of 2 slots paid', tone: 'action' });
  });

  it('shows "Under review" when a seat is submitted and none is paid', () => {
    expect(
      moneyTag(
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
      ),
    ).toEqual({ label: 'Under review', tone: 'waiting' });
  });

  it('shows "Top-up needed" whenever topupDue is outstanding, ahead of the partial label', () => {
    expect(
      moneyTag(
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
      ),
    ).toEqual({ label: 'Top-up needed', tone: 'action' });
  });

  it('shows "Declined" for a declined summary', () => {
    expect(
      moneyTag(
        entry({
          paymentSummary: {
            state: 'declined',
            fullyPaid: false,
            anyReceipt: false,
            paidSeats: 0,
            submittedSeats: 0,
            totalSeats: 2,
            seats: [],
            teamReceipt: 'rejected',
            topupDue: 0,
          },
        }),
      ),
    ).toEqual({ label: 'Declined', tone: 'action' });
  });

  it('shows "No receipt" when nothing has happened yet', () => {
    expect(moneyTag(entry())).toEqual({ label: 'No receipt', tone: 'waiting' });
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
      wantsToCancel: 1,
      unverifiedAccounts: 0,
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

  it('DEFAULT_FILTERS shows only entries with a receipt, closed still hidden (§2AP I)', () => {
    // §2AP I: the organizer's default view is receipts, so DEFAULT_FILTERS is no longer "no
    // constraint" - only 'd' has a receipt (hasProof: true) among the open, non-closed rows.
    expect(filterEntries(rows, DEFAULT_FILTERS).map((r) => r.id)).toEqual(['d']);
  });

  it('the legacy "show closed" switch shows ONLY closed when no Status is picked (§2O, unchanged)', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, payment: [], includeClosed: true }).map(
        (r) => r.id,
      ),
    ).toEqual(['b', 'e']);
  });

  it('an explicit Status pick shows a closed status even with "show closed" off', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, payment: [], statuses: ['withdrawn'] }).map(
        (r) => r.id,
      ),
    ).toEqual(['b']);
  });

  it('an explicit Status pick is authoritative even with "show closed" on - only that status shows', () => {
    expect(
      filterEntries(rows, {
        ...DEFAULT_FILTERS,
        payment: [],
        statuses: ['confirmed'],
        includeClosed: true,
      }).map((r) => r.id),
    ).toEqual(['d']);
  });

  it('Status is OR within the group: two picked statuses both show', () => {
    expect(
      filterEntries(rows, {
        ...DEFAULT_FILTERS,
        payment: [],
        statuses: ['withdrawn', 'rejected'],
      }).map((r) => r.id),
    ).toEqual(['b', 'e']);
  });

  it('Division is OR within the group', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, payment: [], divisions: ['d2', 'd3'] }).map(
        (r) => r.id,
      ),
    ).toEqual(['c', 'd']); // 'e' is closed and hidden by the default closed-gate
  });

  it('Eligibility filters to the picked kinds', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, payment: [], eligibility: ['review'] }).map(
        (r) => r.id,
      ),
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
      filterEntries(rows, { ...DEFAULT_FILTERS, payment: [], partner: ['unconfirmed'] }).map(
        (r) => r.id,
      ),
    ).toEqual(['d']);
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, payment: [], partner: ['confirmed'] }).map(
        (r) => r.id,
      ),
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
      filterEntries(withOpenSeat, { ...DEFAULT_FILTERS, payment: [], partner: ['none'] }).map(
        (r) => r.id,
      ),
    ).toEqual(['f']);
  });

  it('Requests filters to entries with an open cancellation request (§2AQ D)', () => {
    const withRequest = [
      ...rows,
      entry({
        id: 'j',
        divisionId: 'd1',
        divisionName: "Men's Doubles",
        cancellationRequest: { reason: 'injured', requestedAt: '2026-09-09T00:00:00Z' },
      }),
    ];
    expect(
      filterEntries(withRequest, {
        ...DEFAULT_FILTERS,
        payment: [],
        requests: ['wants_to_cancel'],
      }).map((r) => r.id),
    ).toEqual(['j']);
  });

  it('an empty Requests group applies no constraint', () => {
    expect(filterEntries(rows, { ...DEFAULT_FILTERS, payment: [], requests: [] })).toEqual(
      filterEntries(rows, { ...DEFAULT_FILTERS, payment: [] }),
    );
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
      filterEntries(rows, {
        ...DEFAULT_FILTERS,
        payment: [],
        divisions: ['d2'],
        search: 'lyn',
      }).map((r) => r.id),
    ).toEqual(['c']);
    // 'd' also has the default "Maria Cruz & Ana Reyes" members, so the un-scoped search matches both.
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, payment: [], search: 'MARIA' }).map((r) => r.id),
    ).toEqual(['a', 'd']);
  });

  it('search matches a nickname and an email, not only the legal name (§2BG)', () => {
    const nickRows = [
      entry({
        id: 'n1',
        members: [
          {
            id: 'p1',
            name: 'Rene Villanueva Jr',
            slug: 'rene',
            avatarUrl: null,
            nickname: 'Bogart',
          },
        ],
      }),
      entry({
        id: 'n2',
        members: [
          {
            id: 'p2',
            name: 'Teej Panganiban',
            slug: 'teej',
            avatarUrl: null,
            email: 'teej@example.com',
          } as never,
        ],
      }),
    ];
    const base = { ...DEFAULT_FILTERS, payment: [] };
    expect(filterEntries(nickRows, { ...base, search: 'bogart' }).map((r) => r.id)).toEqual(['n1']);
    expect(filterEntries(nickRows, { ...base, search: 'TEEJ@EX' }).map((r) => r.id)).toEqual([
      'n2',
    ]);
  });

  it('every group empty means every group applies no constraint, one at a time', () => {
    // A fully-open base, independent of DEFAULT_FILTERS' own receipts-only starting point (§2AP I) -
    // this test is about the general "empty group = Any" property, not about what ships as default.
    const base: EntryFilters = { ...DEFAULT_FILTERS, payment: [] };
    expect(filterEntries(rows, { ...base, divisions: [] })).toEqual(filterEntries(rows, base));
    expect(filterEntries(rows, { ...base, eligibility: [] })).toEqual(filterEntries(rows, base));
    expect(filterEntries(rows, { ...base, payment: [] })).toEqual(filterEntries(rows, base));
    expect(filterEntries(rows, { ...base, partner: [] })).toEqual(filterEntries(rows, base));
    expect(filterEntries(rows, { ...base, requests: [] })).toEqual(filterEntries(rows, base));
  });

  it('§2AP I: payment "partial" also matches a CONFIRMED entry whose summary is only partial', () => {
    // §2AP C4: an accepted partner release can detach a seat without downgrading a confirmed entry -
    // the organizer's "partial" filter must still surface it, not just the pre-confirmation ones.
    const confirmedPartial = entry({
      id: 'i',
      status: 'confirmed',
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
    });
    expect(
      filterEntries([confirmedPartial], { ...DEFAULT_FILTERS, payment: ['partial'] }).map(
        (r) => r.id,
      ),
    ).toEqual(['i']);
  });
});

describe('chip description + clearing', () => {
  const divisions = [
    { id: 'd1', name: "Men's Doubles" },
    { id: 'd2', name: "Women's Doubles" },
  ];

  it('describes every active filter as a removable chip, including the §2AP I default receipts chip', () => {
    // DEFAULT_FILTERS now starts with payment: ['has_proof'] (§2AP I) - it is shown as a removable
    // chip, not silently applied, so "show me everything" is one tap.
    expect(describeEntryChips(DEFAULT_FILTERS, divisions)).toEqual([
      { group: 'payment', value: 'has_proof', label: 'Has receipt' },
    ]);
    expect(describeEntryChips({ ...DEFAULT_FILTERS, payment: [] }, divisions)).toEqual([]);
    const filters: EntryFilters = {
      divisions: ['d1'],
      statuses: ['confirmed'],
      eligibility: ['review'],
      payment: ['has_proof'],
      partner: ['unconfirmed'],
      requests: ['wants_to_cancel'],
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
      { group: 'requests', value: 'wants_to_cancel', label: 'Wants to cancel' },
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

  it('clears one value from the requests group without touching the others (§2AQ D)', () => {
    const filters: EntryFilters = {
      ...DEFAULT_FILTERS,
      requests: ['wants_to_cancel'],
      statuses: ['confirmed'],
    };
    const next = clearEntryFilter(filters, 'requests', 'wants_to_cancel');
    expect(next.requests).toEqual([]);
    expect(next.statuses).toEqual(['confirmed']);
  });

  it('clears the two scalar groups outright', () => {
    const filters: EntryFilters = { ...DEFAULT_FILTERS, includeClosed: true, search: 'x' };
    expect(clearEntryFilter(filters, 'includeClosed', '').includeClosed).toBe(false);
    expect(clearEntryFilter(filters, 'search', '').search).toBe('');
  });

  it('clearAllEntryFilters returns TRULY empty filters, not DEFAULT_FILTERS (§2AQ D, Findings 3)', () => {
    // §2AP had made DEFAULT_FILTERS.payment = ['has_proof'] - a prior "Clear all" that reset to
    // DEFAULT_FILTERS therefore looked like a no-op on first open of Manage. "Clear all" must mean
    // "show me everything", so it returns a wholly empty filter set instead.
    const empty = clearAllEntryFilters();
    expect(empty).toEqual({
      divisions: [],
      statuses: [],
      eligibility: [],
      payment: [],
      partner: [],
      requests: [],
      includeClosed: false,
      search: '',
    });
    expect(empty).not.toEqual(DEFAULT_FILTERS);
    // DEFAULT_FILTERS keeps its removable receipts chip unchanged (§2AP I still applies on load).
    expect(DEFAULT_FILTERS.payment).toEqual(['has_proof']);
    expect(describeEntryChips(empty, [])).toEqual([]);
  });
});

describe('sorting - default unchanged, every column key deterministic', () => {
  it('with no sort argument, newest submission first (default, 2026-09-13)', () => {
    const older = entry({
      id: 'older',
      paymentStatus: 'submitted',
      createdAt: '2026-09-01T00:00:00Z',
    });
    const newer = entry({
      id: 'newer',
      status: 'confirmed',
      createdAt: '2026-09-08T00:00:00Z',
    });
    expect(sortEntries([older, newer]).map((r) => r.id)).toEqual(['newer', 'older']);
    expect(DEFAULT_SORT).toEqual({ key: 'registered_at', dir: 'desc' });
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
