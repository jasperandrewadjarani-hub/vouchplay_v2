import { describe, expect, it } from 'vitest';
import type { EntryPaymentSummary, TeamReceiptState } from '@vouchplay/core';
import type { OrganizerRegistration } from './registration-queries';
import {
  activeRefineCount,
  amountLabel,
  clearRefine,
  countBuckets,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  entryBucket,
  entryFlags,
  entryVerdict,
  filterEntries,
  hasOpenSeat,
  hasUnconfirmedPartner,
  isClosed,
  isFreeEntry,
  memberDisplay,
  moneyRead,
  needsReasons,
  queuesFor,
  SORT_OPTIONS,
  sortEntries,
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

// Note: with no `amountDue` and no `slots`, `entry()` is a FREE entry by `isFreeEntry`'s definition -
// tests that need a non-free "money is owed" entry pass `amountDue` explicitly.

describe('what the organizer must do next (queuesFor - kept unchanged)', () => {
  it('puts a submitted receipt in the payment queue', () => {
    expect(queuesFor(entry({ paymentStatus: 'submitted' }))).toContain('needs_payment_review');
  });

  it('puts an entry in BOTH queues when a paid player asks to cancel', () => {
    const q = queuesFor(
      entry({
        paymentStatus: 'submitted',
        cancellationRequest: { reason: 'injured', requestedAt: '2026-09-09T01:00:00Z' },
      }),
    );
    expect(q).toEqual(expect.arrayContaining(['needs_payment_review', 'cancellation_requested']));
  });

  it('never queues a closed entry, whatever else is true of it', () => {
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

describe('needsReasons - priority order (master_plan §2BG Decision A)', () => {
  it('lists every active reason, in priority order: cancel, receipt, topup, rule', () => {
    const e = entry({
      paymentStatus: 'submitted',
      cancellationRequest: { reason: 'injured', requestedAt: '2026-09-09T00:00:00Z' },
      eligibilityStatus: 'review',
      paymentSummary: {
        state: 'partial',
        fullyPaid: false,
        anyReceipt: true,
        paidSeats: 1,
        submittedSeats: 1,
        totalSeats: 2,
        seats: [],
        teamReceipt: 'none',
        topupDue: 500,
      },
    });
    expect(needsReasons(e)).toEqual(['cancel', 'receipt', 'topup', 'rule']);
  });

  it('is empty for a closed entry no matter what else is true', () => {
    expect(
      needsReasons(
        entry({ status: 'withdrawn', paymentStatus: 'submitted', eligibilityStatus: 'review' }),
      ),
    ).toEqual([]);
  });

  it('reads "receipt" from a submitted team receipt with no attached slots', () => {
    expect(
      needsReasons(entry({ paymentSummary: summaryFromPaymentStatus('submitted', 2) })),
    ).toEqual(['receipt']);
  });

  it('reads "receipt" from a submitted seat even with no team payment (§2AO A6)', () => {
    const e = entry({
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
    });
    expect(needsReasons(e)).toEqual(['receipt']);
  });

  it('is empty for an ordinary open, unpaid, eligible entry', () => {
    expect(needsReasons(entry())).toEqual([]);
  });
});

describe('entryBucket - bucket exclusivity, closed > needs > confirmed > waiting', () => {
  it('every open entry sits in exactly one bucket, and the counts add up', () => {
    const rows = [
      entry({ id: 'a', paymentStatus: 'submitted' }), // needs (receipt)
      entry({ id: 'b', amountDue: 500 }), // waiting (unpaid, not free)
      entry({ id: 'c', status: 'confirmed' }), // confirmed
      entry({ id: 'd', status: 'withdrawn' }), // closed
    ];
    expect(entryBucket(rows[0]!)).toBe('needs');
    expect(entryBucket(rows[1]!)).toBe('waiting');
    expect(entryBucket(rows[2]!)).toBe('confirmed');
    expect(entryBucket(rows[3]!)).toBe('closed');

    const counts = countBuckets(rows, DEFAULT_FILTERS);
    expect(counts.needs + counts.waiting + counts.confirmed).toBe(counts.all);
    expect(counts.all).toBe(3);
    expect(counts.closed).toBe(1);
  });

  it('closed always wins, even over an open cancellation request or a bad receipt', () => {
    expect(
      entryBucket(
        entry({
          status: 'withdrawn',
          paymentStatus: 'submitted',
          cancellationRequest: { reason: 'x', requestedAt: '2026-09-09T00:00:00Z' },
        }),
      ),
    ).toBe('closed');
  });

  it('a confirmed entry with an outstanding reason is "needs", not "confirmed" (§2AP C4)', () => {
    expect(
      entryBucket(
        entry({
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
            topupDue: 500,
          },
        }),
      ),
    ).toBe('needs');
  });
});

describe('entryVerdict - the one pill a row shows (master_plan §2BG Decision B)', () => {
  it('needs: leads with the first reason, amber "action"', () => {
    expect(entryVerdict(entry({ paymentStatus: 'submitted' }))).toEqual({
      label: 'Check receipt',
      tone: 'action',
    });
    expect(
      entryVerdict(
        entry({ cancellationRequest: { reason: 'x', requestedAt: '2026-09-09T00:00:00Z' } }),
      ),
    ).toEqual({ label: 'Wants to cancel', tone: 'action' });
  });

  it('confirmed: green "done"', () => {
    expect(entryVerdict(entry({ status: 'confirmed' }))).toEqual({
      label: 'Confirmed',
      tone: 'done',
    });
  });

  it('closed: the capitalised status, muted', () => {
    expect(entryVerdict(entry({ status: 'withdrawn' }))).toEqual({
      label: 'Withdrawn',
      tone: 'closed',
    });
    expect(entryVerdict(entry({ status: 'refunded' }))).toEqual({
      label: 'Refunded',
      tone: 'closed',
    });
  });

  it('waiting: waitlisted', () => {
    expect(entryVerdict(entry({ status: 'waitlisted' }))).toEqual({
      label: 'Waitlisted',
      tone: 'waiting',
    });
  });

  it('waiting: a declined receipt', () => {
    const e = entry({
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
    });
    expect(entryVerdict(e)).toEqual({ label: 'Receipt declined', tone: 'waiting' });
  });

  it('waiting: a partial payment reads "Partly paid X/Y"', () => {
    const e = entry({
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
    expect(entryVerdict(e)).toEqual({ label: 'Partly paid 1/2', tone: 'waiting' });
  });

  it('waiting: a free, not-yet-confirmed entry reads "Not confirmed"', () => {
    expect(entryVerdict(entry())).toEqual({ label: 'Not confirmed', tone: 'waiting' });
  });

  it('waiting: everything else reads "Unpaid"', () => {
    expect(entryVerdict(entry({ amountDue: 500 }))).toEqual({ label: 'Unpaid', tone: 'waiting' });
  });
});

describe('isFreeEntry', () => {
  it('is free when nothing owes money anywhere', () => {
    expect(isFreeEntry(entry())).toBe(true);
    expect(isFreeEntry(entry({ amountDue: 0 }))).toBe(true);
  });

  it('is not free once the division fee is owed', () => {
    expect(isFreeEntry(entry({ amountDue: 500 }))).toBe(false);
  });

  it('reads the division fee, so an unpaid entry with no payment row is NOT free (§2BG)', () => {
    // Production shape: no payments row yet -> amountDue null, no slots, but the division charges.
    const unpaid = entry({ amountDue: null, slots: [], divisionFee: 1799 });
    expect(isFreeEntry(unpaid)).toBe(false);
    expect(moneyRead(unpaid)).toBe('Unpaid');
    expect(isFreeEntry(entry({ amountDue: null, divisionFee: 0 }))).toBe(true);
  });

  it('is not free once any attached seat owes money, even with no team amountDue', () => {
    expect(
      isFreeEntry(
        entry({
          slots: [
            {
              id: 's1',
              playerId: 'p1',
              playerName: 'Maria Cruz',
              status: 'unpaid',
              amountDue: 250,
              amountSubmitted: null,
              hasProof: false,
              rejectionReason: null,
              submittedAt: null,
            },
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe('moneyRead - "paid" always means verified (master_plan §2BG Decision B)', () => {
  it('reads "Free" for a free entry', () => {
    expect(moneyRead(entry())).toBe('Free');
  });

  it('reads "Paid" for a verified team receipt', () => {
    expect(
      moneyRead(entry({ amountDue: 500, paymentSummary: summaryFromPaymentStatus('verified', 2) })),
    ).toBe('Paid');
  });

  it('reads "Paid" when every seat is paid individually (no team receipt)', () => {
    const e = entry({
      amountDue: 500,
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
    });
    expect(moneyRead(e)).toBe('Paid');
  });

  it('reads "Refunded"', () => {
    const e = entry({
      amountDue: 500,
      paymentSummary: {
        state: 'refunded',
        fullyPaid: false,
        anyReceipt: false,
        paidSeats: 0,
        submittedSeats: 0,
        totalSeats: 2,
        seats: [],
        teamReceipt: 'refunded',
        topupDue: 0,
      },
    });
    expect(moneyRead(e)).toBe('Refunded');
  });

  it('reads "N of M paid" for a genuine partial', () => {
    const e = entry({
      amountDue: 500,
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
    expect(moneyRead(e)).toBe('1 of 2 paid');
  });

  it('a SUBMITTED (not yet verified) receipt still reads "Unpaid" - submitted is never "paid"', () => {
    expect(
      moneyRead(
        entry({ amountDue: 500, paymentSummary: summaryFromPaymentStatus('submitted', 2) }),
      ),
    ).toBe('Unpaid');
  });

  it('reads "Unpaid" for a plain unpaid entry', () => {
    expect(moneyRead(entry({ amountDue: 500 }))).toBe('Unpaid');
  });
});

describe('memberDisplay - nickname suppression', () => {
  it('shows the nickname when it says something new', () => {
    expect(memberDisplay({ name: 'Rene Villanueva Jr', nickname: 'Bogart' })).toEqual({
      name: 'Rene Villanueva Jr',
      nickname: 'Bogart',
    });
  });

  it('suppresses a nickname equal to the first name', () => {
    expect(memberDisplay({ name: 'Maria Cruz', nickname: 'Maria' })).toEqual({
      name: 'Maria Cruz',
      nickname: null,
    });
    expect(memberDisplay({ name: 'Maria Cruz', nickname: 'maria' })).toEqual({
      name: 'Maria Cruz',
      nickname: null,
    });
  });

  it('suppresses a nickname equal to the full name, case-insensitively', () => {
    expect(memberDisplay({ name: 'Ana Reyes', nickname: 'ana reyes' })).toEqual({
      name: 'Ana Reyes',
      nickname: null,
    });
  });

  it('suppresses an empty, whitespace, or missing nickname', () => {
    expect(memberDisplay({ name: 'Ana Reyes', nickname: '' })).toEqual({
      name: 'Ana Reyes',
      nickname: null,
    });
    expect(memberDisplay({ name: 'Ana Reyes', nickname: '   ' })).toEqual({
      name: 'Ana Reyes',
      nickname: null,
    });
    expect(memberDisplay({ name: 'Ana Reyes' })).toEqual({ name: 'Ana Reyes', nickname: null });
  });
});

describe('entryFlags', () => {
  it('flags an unverified member', () => {
    const e = entry({
      members: [
        { id: 'p1', name: 'Guest One', slug: null, avatarUrl: null, unverified: true },
        { id: 'p2', name: 'Ana Reyes', slug: 'ana', avatarUrl: null },
      ],
    });
    expect(entryFlags(e)).toContain('unverified');
  });

  it('flags a pending partner', () => {
    expect(entryFlags(entry({ unconfirmedMemberIds: ['p2'] }))).toContain('partner_pending');
  });

  it('is empty for an ordinary entry', () => {
    expect(entryFlags(entry())).toEqual([]);
  });
});

describe('filterEntries - bucket tabs (master_plan §2BG Decision A/C)', () => {
  const rows = [
    entry({ id: 'a', paymentStatus: 'submitted' }), // needs
    entry({ id: 'b', amountDue: 500 }), // waiting
    entry({ id: 'c', status: 'confirmed' }), // confirmed
    entry({ id: 'd', status: 'withdrawn' }), // closed
  ];

  it('DEFAULT_FILTERS opens on the needs bucket', () => {
    expect(DEFAULT_FILTERS.bucket).toBe('needs');
    expect(filterEntries(rows, DEFAULT_FILTERS).map((r) => r.id)).toEqual(['a']);
  });

  it('each bucket shows exactly its own entries', () => {
    expect(filterEntries(rows, { ...DEFAULT_FILTERS, bucket: 'waiting' }).map((r) => r.id)).toEqual(
      ['b'],
    );
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, bucket: 'confirmed' }).map((r) => r.id),
    ).toEqual(['c']);
  });

  it('"all" shows every open entry, closed only when includeClosed', () => {
    expect(filterEntries(rows, { ...DEFAULT_FILTERS, bucket: 'all' }).map((r) => r.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, bucket: 'all', includeClosed: true }).map(
        (r) => r.id,
      ),
    ).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a specific bucket NEVER shows a closed entry, even with includeClosed on', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, bucket: 'needs', includeClosed: true }).map(
        (r) => r.id,
      ),
    ).toEqual(['a']);
  });

  it('reasons narrow the needs bucket only, and OR within the group', () => {
    const topup = entry({
      id: 'e',
      paymentSummary: {
        state: 'partial',
        fullyPaid: false,
        anyReceipt: true,
        paidSeats: 0,
        submittedSeats: 0,
        totalSeats: 2,
        seats: [],
        teamReceipt: 'none',
        topupDue: 500,
      },
    });
    expect(
      filterEntries([...rows, topup], {
        ...DEFAULT_FILTERS,
        bucket: 'needs',
        reasons: ['topup'],
      }).map((r) => r.id),
    ).toEqual(['e']);
    expect(
      filterEntries([...rows, topup], {
        ...DEFAULT_FILTERS,
        bucket: 'needs',
        reasons: ['receipt', 'topup'],
      }).map((r) => r.id),
    ).toEqual(['a', 'e']);
  });

  it('reasons are ignored outside the needs bucket', () => {
    expect(
      filterEntries(rows, { ...DEFAULT_FILTERS, bucket: 'waiting', reasons: ['topup'] }).map(
        (r) => r.id,
      ),
    ).toEqual(['b']);
  });
});

describe('filterEntries - search ignores bucket and reasons, matches nickname + email (§2BG)', () => {
  const nickRows = [
    entry({
      id: 'n1',
      status: 'confirmed',
      members: [
        { id: 'p1', name: 'Rene Villanueva Jr', slug: 'rene', avatarUrl: null, nickname: 'Bogart' },
      ],
    }),
    entry({
      id: 'n2',
      paymentStatus: 'submitted',
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

  it('matches a nickname even when the selected bucket would otherwise exclude it', () => {
    // bucket is 'needs' (default), which would normally exclude n1 (confirmed) - search overrides.
    expect(
      filterEntries(nickRows, { ...DEFAULT_FILTERS, bucket: 'needs', search: 'bogart' }).map(
        (r) => r.id,
      ),
    ).toEqual(['n1']);
  });

  it('matches an email, case-insensitively', () => {
    expect(
      filterEntries(nickRows, { ...DEFAULT_FILTERS, bucket: 'confirmed', search: 'TEEJ@EX' }).map(
        (r) => r.id,
      ),
    ).toEqual(['n2']);
  });

  it('search still ANDs with the refine filters', () => {
    const a = entry({ id: 'a', divisionId: 'd1' });
    const b = entry({ id: 'b', divisionId: 'd2' });
    expect(
      filterEntries([a, b], {
        ...DEFAULT_FILTERS,
        bucket: 'all',
        divisions: ['d2'],
        search: 'maria',
      }).map((r) => r.id),
    ).toEqual(['b']);
  });
});

describe('filterEntries - refine filters AND across groups, OR within a group', () => {
  const refineRows = [
    entry({ id: 'unpaid', amountDue: 500 }),
    entry({
      id: 'partial',
      amountDue: 500,
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
      id: 'paid',
      amountDue: 500,
      paymentSummary: summaryFromPaymentStatus('verified', 2),
    }),
    entry({
      id: 'unverified-member',
      amountDue: 500,
      members: [
        { id: 'p1', name: 'Guest One', slug: null, avatarUrl: null, unverified: true },
        { id: 'p2', name: 'Ana Reyes', slug: 'ana', avatarUrl: null },
      ],
    }),
    entry({
      id: 'open-seat',
      amountDue: 500,
      members: [{ id: 'p1', name: 'Solo Player', slug: 'solo', avatarUrl: null }],
    }),
    entry({ id: 'pending-partner', amountDue: 500, unconfirmedMemberIds: ['p2'] }),
  ];

  it('payment: OR within the group', () => {
    // 'unverified-member', 'open-seat' and 'pending-partner' never override paymentSummary, so they
    // are 'unpaid' too - this checks the payment filter itself, not those other entries' identities.
    expect(
      filterEntries(refineRows, { ...DEFAULT_FILTERS, bucket: 'all', payment: ['unpaid'] }).map(
        (r) => r.id,
      ),
    ).toEqual(['unpaid', 'unverified-member', 'open-seat', 'pending-partner']);
    expect(
      filterEntries(refineRows, {
        ...DEFAULT_FILTERS,
        bucket: 'all',
        payment: ['partial', 'paid'],
      }).map((r) => r.id),
    ).toEqual(['partial', 'paid']);
  });

  it('account: unverified matches an entry with any unverified member', () => {
    expect(
      filterEntries(refineRows, { ...DEFAULT_FILTERS, bucket: 'all', account: ['unverified'] }).map(
        (r) => r.id,
      ),
    ).toEqual(['unverified-member']);
  });

  it('partner: OR within the group', () => {
    expect(
      filterEntries(refineRows, { ...DEFAULT_FILTERS, bucket: 'all', partner: ['open_seat'] }).map(
        (r) => r.id,
      ),
    ).toEqual(['open-seat']);
    expect(
      filterEntries(refineRows, { ...DEFAULT_FILTERS, bucket: 'all', partner: ['pending'] }).map(
        (r) => r.id,
      ),
    ).toEqual(['pending-partner']);
    expect(
      filterEntries(refineRows, {
        ...DEFAULT_FILTERS,
        bucket: 'all',
        partner: ['open_seat', 'pending'],
      }).map((r) => r.id),
    ).toEqual(['open-seat', 'pending-partner']);
  });

  it('AND across groups: division AND payment both narrow the result', () => {
    const a = entry({ id: 'a', divisionId: 'd1', amountDue: 500 });
    const b = entry({ id: 'b', divisionId: 'd2', amountDue: 500 });
    expect(
      filterEntries([a, b], {
        ...DEFAULT_FILTERS,
        bucket: 'all',
        divisions: ['d1'],
        payment: ['unpaid'],
      }).map((r) => r.id),
    ).toEqual(['a']);
  });

  it('every empty refine group applies no constraint', () => {
    expect(filterEntries(refineRows, { ...DEFAULT_FILTERS, bucket: 'all' })).toEqual(
      filterEntries(refineRows, {
        ...DEFAULT_FILTERS,
        bucket: 'all',
        payment: [],
        account: [],
        partner: [],
      }),
    );
  });
});

describe('countBuckets - ignores bucket/reasons/search/includeClosed, honours refine filters', () => {
  const rows = [
    entry({ id: 'a', paymentStatus: 'submitted' }), // needs (receipt)
    entry({ id: 'b', amountDue: 500 }), // waiting
    entry({ id: 'c', status: 'confirmed' }), // confirmed
    entry({ id: 'd', status: 'withdrawn' }), // closed
  ];

  it('counts every open bucket plus closed, regardless of the current bucket/search/includeClosed', () => {
    const counts = countBuckets(rows, {
      ...DEFAULT_FILTERS,
      bucket: 'confirmed',
      search: 'nomatch',
      includeClosed: false,
    });
    expect(counts).toEqual({
      needs: 1,
      waiting: 1,
      confirmed: 1,
      all: 3,
      closed: 1,
      reasons: { cancel: 0, receipt: 1, topup: 0, rule: 0 },
    });
  });

  it('an entry with two needs reasons counts in both reason buckets', () => {
    const both = entry({ id: 'e', paymentStatus: 'submitted', eligibilityStatus: 'review' });
    const counts = countBuckets([both], DEFAULT_FILTERS);
    expect(counts.reasons.receipt).toBe(1);
    expect(counts.reasons.rule).toBe(1);
    expect(counts.needs).toBe(1);
  });

  it('honours the refine filters (division/payment/account/partner)', () => {
    const withDivision = [
      entry({ id: 'x', divisionId: 'd1', amountDue: 500 }),
      entry({ id: 'y', divisionId: 'd2', amountDue: 500 }),
    ];
    const counts = countBuckets(withDivision, { ...DEFAULT_FILTERS, divisions: ['d1'] });
    expect(counts.all).toBe(1);
    expect(counts.waiting).toBe(1);
  });
});

describe('activeRefineCount + clearRefine', () => {
  it('counts payment + account + partner + includeClosed, never divisions', () => {
    expect(activeRefineCount(DEFAULT_FILTERS)).toBe(0);
    expect(
      activeRefineCount({
        ...DEFAULT_FILTERS,
        divisions: ['d1', 'd2'],
        payment: ['unpaid', 'paid'],
        account: ['unverified'],
        partner: ['open_seat'],
        includeClosed: true,
      }),
    ).toBe(5);
  });

  it('clearRefine resets only payment, account, partner and includeClosed', () => {
    const f: EntryFilters = {
      bucket: 'needs',
      reasons: ['topup'],
      divisions: ['d1'],
      payment: ['unpaid'],
      account: ['unverified'],
      partner: ['pending'],
      includeClosed: true,
      search: 'maria',
    };
    expect(clearRefine(f)).toEqual({
      bucket: 'needs',
      reasons: ['topup'],
      divisions: ['d1'],
      payment: [],
      account: [],
      partner: [],
      includeClosed: false,
      search: 'maria',
    });
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

  it('needs_me desc flips routine entries first (kept unchanged)', () => {
    const needsWork = entry({ id: 'work', paymentStatus: 'submitted' });
    const routine = entry({ id: 'routine', status: 'confirmed' });
    expect(
      sortEntries([needsWork, routine], { key: 'needs_me', dir: 'desc' }).map((r) => r.id),
    ).toEqual(['routine', 'work']);
  });

  it('needs_first orders needs, then waiting, then confirmed, then closed', () => {
    const rows = [
      entry({ id: 'confirmed', status: 'confirmed' }),
      entry({ id: 'closed', status: 'withdrawn' }),
      entry({ id: 'needs', paymentStatus: 'submitted' }),
      entry({ id: 'waiting', amountDue: 500 }),
    ];
    expect(sortEntries(rows, { key: 'needs_first', dir: 'asc' }).map((r) => r.id)).toEqual([
      'needs',
      'waiting',
      'confirmed',
      'closed',
    ]);
    expect(sortEntries(rows, { key: 'needs_first', dir: 'desc' }).map((r) => r.id)).toEqual([
      'closed',
      'confirmed',
      'waiting',
      'needs',
    ]);
  });

  it('SORT_OPTIONS exposes exactly the five filter-sheet choices, in order', () => {
    expect(SORT_OPTIONS.map((o) => o.label)).toEqual([
      'Newest first',
      'Oldest first',
      'Needs me first',
      'Team name A–Z',
      'Division',
    ]);
    expect(SORT_OPTIONS.find((o) => o.label === 'Needs me first')).toEqual({
      key: 'needs_first',
      dir: 'asc',
      label: 'Needs me first',
    });
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

  it('status asc/desc sorts by the verdict label the organizer sees, not the raw enum', () => {
    const rows = [
      entry({ id: 'confirmed', status: 'confirmed' }),
      entry({ id: 'awaiting', amountDue: 500 }),
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
