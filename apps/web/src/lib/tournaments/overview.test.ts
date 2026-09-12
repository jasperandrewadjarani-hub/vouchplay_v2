import { describe, it, expect } from 'vitest';
import { computeOverview, type OverviewRegInput, type OverviewSlotInput } from './overview';

const reg = (over: Partial<OverviewRegInput>): OverviewRegInput => ({
  divisionId: 'd1',
  status: 'confirmed',
  eligibilityStatus: 'eligible',
  paymentStatus: null,
  amountDue: null,
  currency: null,
  ...over,
});

describe('computeOverview (§26.1)', () => {
  it('counts totals, confirmed, waitlist, and excludes terminal from totals', () => {
    const o = computeOverview(
      [
        reg({ status: 'confirmed' }),
        reg({ status: 'waitlisted' }),
        reg({ status: 'withdrawn' }),
        reg({ status: 'payment_pending' }),
      ],
      [{ id: 'd1', name: 'A', capacityTeams: 0 }],
    );
    expect(o.totalRegistrations).toBe(3); // withdrawn excluded
    expect(o.confirmedTeams).toBe(1);
    expect(o.waitlistCount).toBe(1);
  });

  it('sums verified payments as revenue and flags proofs to review', () => {
    const o = computeOverview(
      [
        reg({ paymentStatus: 'verified', amountDue: 500, currency: 'PHP' }),
        reg({ paymentStatus: 'verified', amountDue: 800, currency: 'PHP' }),
        reg({ paymentStatus: 'submitted', amountDue: 500, currency: 'PHP' }),
      ],
      [],
    );
    expect(o.revenueCollected).toBe(1300);
    expect(o.currency).toBe('PHP');
    expect(o.paymentsToReview).toBe(1);
  });

  it('counts eligibility review states but not terminal ones', () => {
    const o = computeOverview(
      [
        reg({ eligibilityStatus: 'review' }),
        reg({ eligibilityStatus: 'skill_mismatch' }),
        reg({ eligibilityStatus: 'ineligible_hard_rule' }),
        reg({ eligibilityStatus: 'review', status: 'withdrawn' }),
        reg({ eligibilityStatus: 'eligible' }),
      ],
      [],
    );
    expect(o.eligibilityReviewCount).toBe(3);
  });

  it('flags divisions at or above 80% of capacity', () => {
    const o = computeOverview(
      [
        reg({ divisionId: 'd1', status: 'confirmed' }),
        reg({ divisionId: 'd1', status: 'payment_submitted' }),
        reg({ divisionId: 'd1', status: 'under_review' }),
        reg({ divisionId: 'd1', status: 'payment_pending' }),
        reg({ divisionId: 'd2', status: 'confirmed' }),
      ],
      [
        { id: 'd1', name: 'Near', capacityTeams: 5 }, // 4/5 = 80% -> flagged
        { id: 'd2', name: 'Empty', capacityTeams: 10 }, // 1/10 -> not
      ],
    );
    expect(o.nearingCapacity.map((n) => n.name)).toEqual(['Near']);
    expect(o.nearingCapacity[0]).toMatchObject({ active: 4, capacity: 5 });
  });

  it('counts active entries with an open seat or an unconfirmed partner as incomplete teams (§2AM)', () => {
    const o = computeOverview(
      [
        reg({ hasOpenSeat: true }),
        reg({ partnerUnconfirmed: true }),
        reg({ hasOpenSeat: true, status: 'withdrawn' }), // terminal - excluded
        reg({}), // neither flag - complete
      ],
      [],
    );
    expect(o.incompleteTeams).toBe(2);
  });

  it('counts active entries whose paymentSummary.fullyPaid is true as fully paid teams, excluding terminal (§2AO A6)', () => {
    const o = computeOverview(
      [
        reg({ fullyPaid: true }),
        reg({ fullyPaid: true, status: 'withdrawn' }), // terminal - excluded
        reg({ fullyPaid: false }),
        reg({}), // no flag - not fully paid
      ],
      [],
    );
    expect(o.fullyPaidTeams).toBe(1);
  });

  it('adds verified slot amounts (attached and bare) to revenueCollected (§2AO A6)', () => {
    const slot = (over: Partial<OverviewSlotInput>): OverviewSlotInput => ({
      status: 'verified',
      amountDue: 400,
      currency: 'PHP',
      ...over,
    });
    const o = computeOverview(
      [reg({ paymentStatus: 'verified', amountDue: 1000, currency: 'PHP' })],
      [],
      [
        slot({}), // attached seat, verified
        slot({}), // bare reservation, verified
        slot({ status: 'submitted' }), // not yet verified - excluded
      ],
    );
    expect(o.revenueCollected).toBe(1800);
  });

  it('defaults revenueCollected to team-payments-only when no slots are passed', () => {
    const o = computeOverview(
      [reg({ paymentStatus: 'verified', amountDue: 1000, currency: 'PHP' })],
      [],
    );
    expect(o.revenueCollected).toBe(1000);
  });
});
