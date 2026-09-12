import { describe, it, expect } from 'vitest';
import { describeRegistrationStatus, type RegistrationFacts } from './registration-status';
import type { EntryPaymentSummary, SeatState } from '@vouchplay/core';

const base: RegistrationFacts = {
  regStatus: 'payment_pending',
  paymentStatus: null,
  fee: 1500,
};

/** A minimal EntryPaymentSummary for the seat-aware tests - only the fields the status view reads. */
function summary(over: Partial<EntryPaymentSummary> = {}): EntryPaymentSummary {
  return {
    state: 'unpaid',
    fullyPaid: false,
    anyReceipt: false,
    paidSeats: 0,
    submittedSeats: 0,
    totalSeats: 2,
    seats: [],
    teamReceipt: 'none',
    topupDue: 0,
    ...over,
  };
}

describe('describeRegistrationStatus', () => {
  it('confirmed is the only secured state', () => {
    const v = describeRegistrationStatus({ ...base, regStatus: 'confirmed' });
    expect(v.secured).toBe(true);
    expect(v.tone).toBe('done');
    expect(v.shortLabel).toBe('Confirmed');
    expect(v.steps).toEqual([]);
  });

  it('a partner who has not confirmed does not make a confirmed entry unsecured', () => {
    // confirmed means the organizer already resolved everything; partner flags are moot.
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'confirmed',
      partnerUnconfirmed: true,
    });
    expect(v.secured).toBe(true);
  });

  it('unpaid entry with a fee is an action, not a done state', () => {
    const v = describeRegistrationStatus(base);
    expect(v.secured).toBe(false);
    expect(v.tone).toBe('action');
    expect(v.needsPayment).toBe(true);
    expect(v.shortLabel).toBe('Payment pending');
    expect(v.title).toBe('Your slot is not secured yet');
    expect(v.steps[0]).toMatch(/pay/i);
  });

  it('never says "Registered" for any provisional state', () => {
    for (const regStatus of [
      'payment_pending',
      'payment_submitted',
      'under_review',
      'waitlisted',
    ]) {
      const v = describeRegistrationStatus({ ...base, regStatus });
      expect(v.secured).toBe(false);
      expect(v.shortLabel.toLowerCase()).not.toContain('registered');
      expect(v.title.toLowerCase()).not.toContain('registered');
    }
  });

  it('a submitted receipt awaiting review is waiting, not action - the applicant has done their part', () => {
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'payment_submitted',
      paymentStatus: 'pending',
    });
    expect(v.tone).toBe('waiting');
    expect(v.needsPayment).toBe(false);
    expect(v.secured).toBe(false);
    expect(v.shortLabel).toBe('Under review');
    expect(v.steps.some((s) => /verify/i.test(s))).toBe(true);
  });

  it('a declined payment is an action again', () => {
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'payment_pending',
      paymentStatus: 'rejected',
    });
    expect(v.tone).toBe('action');
    expect(v.needsPayment).toBe(true);
    expect(v.shortLabel).toBe('Payment declined');
    expect(v.steps[0]).toMatch(/declined|new/i);
  });

  it('an unpaid doubles entry lists both the payment and the partner step, payment first', () => {
    const v = describeRegistrationStatus({ ...base, partnerUnconfirmed: true });
    expect(v.steps.length).toBe(2);
    expect(v.steps[0]).toMatch(/pay/i);
    expect(v.steps[1]).toMatch(/partner/i);
  });

  it('a paid-and-under-review doubles entry with an unconfirmed partner labels the partner', () => {
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'payment_submitted',
      paymentStatus: 'pending',
      partnerUnconfirmed: true,
    });
    expect(v.shortLabel).toBe('Partner not confirmed');
    expect(v.tone).toBe('waiting');
    expect(v.secured).toBe(false);
    expect(v.steps.some((s) => /partner/i.test(s))).toBe(true);
  });

  it('a vacant seat after a decline asks for a new partner when no lock date is known', () => {
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'payment_submitted',
      paymentStatus: 'pending',
      seatVacantAfterDecline: true,
    });
    expect(v.steps.some((s) => /new partner/i.test(s))).toBe(true);
  });

  it('an open seat with a known lock date asks to choose a partner before it (§2AM)', () => {
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'payment_submitted',
      paymentStatus: 'pending',
      seatOpen: true,
      partnerLockAt: '2026-10-09T16:00:00.000Z',
      partnerLockPassed: false,
    });
    expect(v.steps.some((s) => /choose your partner before/i.test(s))).toBe(true);
    expect(v.shortLabel).toBe('No partner yet');
  });

  it('an open seat past the lock points the applicant at the organizer', () => {
    const v = describeRegistrationStatus({
      regStatus: 'payment_pending',
      paymentStatus: null,
      fee: 0,
      seatOpen: true,
      partnerLockPassed: true,
    });
    expect(v.steps.some((s) => /lock-in has passed/i.test(s))).toBe(true);
  });

  it('an open seat gives the free-division "awaiting confirmation" state a "No partner yet" label', () => {
    const v = describeRegistrationStatus({
      regStatus: 'payment_pending',
      paymentStatus: null,
      fee: 0,
      seatOpen: true,
    });
    expect(v.shortLabel).toBe('No partner yet');
    expect(v.secured).toBe(false);
  });

  it('waitlisted is its own honest state - not holding a slot', () => {
    const v = describeRegistrationStatus({ ...base, regStatus: 'waitlisted' });
    expect(v.shortLabel).toBe('Waitlisted');
    expect(v.tone).toBe('waiting');
    expect(v.secured).toBe(false);
    expect(v.assurance).toMatch(/waitlist/i);
  });

  it('a free division awaits confirmation without asking for money', () => {
    const v = describeRegistrationStatus({
      regStatus: 'payment_pending',
      paymentStatus: null,
      fee: 0,
    });
    expect(v.needsPayment).toBe(false);
    expect(v.shortLabel).toBe('Awaiting confirmation');
    expect(v.steps.some((s) => /pay/i.test(s))).toBe(false);
  });

  describe('seat-aware (paymentSummary supplied, master_plan §2AO)', () => {
    it('my own unpaid seat is an action state with the seat-specific step', () => {
      const v = describeRegistrationStatus({
        ...base,
        mySeat: 'unpaid' as SeatState,
        paymentSummary: summary({ state: 'unpaid' }),
      });
      expect(v.secured).toBe(false);
      expect(v.tone).toBe('action');
      expect(v.needsPayment).toBe(true);
      expect(v.shortLabel).toBe('Payment pending');
      expect(v.steps[0]).toMatch(/pay for your seat/i);
    });

    it('a declined seat is an action state, distinct from a merely unpaid one', () => {
      const v = describeRegistrationStatus({
        ...base,
        mySeat: 'declined' as SeatState,
        paymentSummary: summary({ state: 'declined' }),
      });
      expect(v.tone).toBe('action');
      expect(v.needsPayment).toBe(true);
      expect(v.shortLabel).toBe('Payment declined');
      expect(v.steps[0]).toMatch(/declined/i);
    });

    it('a topup seat is an action state asking for the difference', () => {
      const v = describeRegistrationStatus({
        ...base,
        mySeat: 'topup' as SeatState,
        paymentSummary: summary({ state: 'partial', paidSeats: 1 }),
      });
      expect(v.tone).toBe('action');
      expect(v.needsPayment).toBe(true);
      expect(v.steps[0]).toMatch(/top-up/i);
    });

    it('my seat paid but the team only partial is a waiting state, not an action for me', () => {
      const v = describeRegistrationStatus({
        ...base,
        mySeat: 'paid' as SeatState,
        partnerName: 'Maria',
        paymentSummary: summary({ state: 'partial', paidSeats: 1 }),
      });
      expect(v.secured).toBe(false);
      expect(v.tone).toBe('waiting');
      expect(v.needsPayment).toBe(false);
      expect(v.shortLabel).toBe('Partially paid');
      expect(v.steps.some((s) => /Maria still needs to pay/i.test(s))).toBe(true);
    });

    it('both seats submitted (team fully submitted) is waiting, under review', () => {
      const v = describeRegistrationStatus({
        ...base,
        mySeat: 'submitted' as SeatState,
        paymentSummary: summary({ state: 'submitted', submittedSeats: 2 }),
      });
      expect(v.tone).toBe('waiting');
      expect(v.needsPayment).toBe(false);
      expect(v.shortLabel).toBe('Under review');
      expect(v.steps[0]).toMatch(/wait for the organizer/i);
    });

    it('a fully paid team summary never reaches this branch as unsecured once confirmed', () => {
      // Confirmed is decided before paymentSummary is ever consulted (the top-level early return).
      const v = describeRegistrationStatus({
        ...base,
        regStatus: 'confirmed',
        mySeat: 'paid' as SeatState,
        paymentSummary: summary({ state: 'paid', fullyPaid: true, paidSeats: 2 }),
      });
      expect(v.secured).toBe(true);
      expect(v.shortLabel).toBe('Confirmed');
    });

    it('a bare (singles-shaped, one seat) declined summary never mentions a partner step', () => {
      const v = describeRegistrationStatus({
        ...base,
        mySeat: 'declined' as SeatState,
        paymentSummary: summary({ state: 'declined', totalSeats: 1 }),
      });
      expect(v.steps.some((s) => /still needs to pay/i.test(s))).toBe(false);
    });

    it('legacy callers without paymentSummary are completely unaffected', () => {
      const v = describeRegistrationStatus(base);
      expect(v.shortLabel).toBe('Payment pending');
      expect(v.steps[0]).toMatch(/pay the fee/i);
    });
  });

  it('every provisional state carries a non-empty title and at least one step', () => {
    for (const regStatus of [
      'payment_pending',
      'payment_submitted',
      'under_review',
      'waitlisted',
    ]) {
      const v = describeRegistrationStatus({ ...base, regStatus });
      expect(v.title.length).toBeGreaterThan(0);
      expect(v.steps.length).toBeGreaterThan(0);
      expect(v.assurance.length).toBeGreaterThan(0);
    }
  });
});
