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

describe('describeRegistrationStatus - alias equality (§2AP E)', () => {
  it('shortLabel is always exactly the headlineLabel, for every headline', () => {
    const confirmed = describeRegistrationStatus({ ...base, regStatus: 'confirmed' });
    expect(confirmed.shortLabel).toBe(confirmed.headlineLabel);

    const verifying = describeRegistrationStatus({
      ...base,
      regStatus: 'payment_submitted',
      paymentStatus: 'pending',
    });
    expect(verifying.shortLabel).toBe(verifying.headlineLabel);

    const unsecured = describeRegistrationStatus(base);
    expect(unsecured.shortLabel).toBe(unsecured.headlineLabel);
  });

  it('the three headline labels are exactly the three prescribed strings', () => {
    expect(describeRegistrationStatus({ ...base, regStatus: 'confirmed' }).headlineLabel).toBe(
      'Confirmed',
    );
    expect(
      describeRegistrationStatus({
        ...base,
        regStatus: 'payment_submitted',
        paymentStatus: 'pending',
      }).headlineLabel,
    ).toBe('Payment for verification');
    expect(describeRegistrationStatus(base).headlineLabel).toBe('Slot not secured');
  });
});

describe('describeRegistrationStatus - headline: confirmed', () => {
  it('confirmed is the only secured state', () => {
    const v = describeRegistrationStatus({ ...base, regStatus: 'confirmed' });
    expect(v.headline).toBe('confirmed');
    expect(v.secured).toBe(true);
    expect(v.tone).toBe('done');
    expect(v.shortLabel).toBe('Confirmed');
    expect(v.steps).toEqual([]);
    expect(v.notes).toEqual([]);
  });

  it('a partner who has not confirmed does not make a confirmed entry unsecured, and adds no note', () => {
    // confirmed means the organizer already resolved everything; a merely-unconfirmed partner (not
    // an open seat, not a partial summary) is not one of the §2AP C4 cases, so no note is added.
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'confirmed',
      partnerUnconfirmed: true,
    });
    expect(v.secured).toBe(true);
    expect(v.headline).toBe('confirmed');
    expect(v.notes).toEqual([]);
  });

  it('§2AP C4: a confirmed entry with an open seat stays confirmed but notes the new partner will owe', () => {
    const v = describeRegistrationStatus({ ...base, regStatus: 'confirmed', seatOpen: true });
    expect(v.headline).toBe('confirmed');
    expect(v.secured).toBe(true);
    expect(v.notes).toEqual(['Slot open - the new partner will need to pay their slot']);
  });

  it('§2AP C4: a confirmed entry with a partial summary notes the named partner still owes', () => {
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'confirmed',
      partnerName: 'Maria',
      paymentSummary: summary({ state: 'partial', paidSeats: 1 }),
    });
    expect(v.headline).toBe('confirmed');
    expect(v.secured).toBe(true);
    expect(v.notes).toEqual(['Maria still needs to pay their slot']);
  });

  it('a fully paid team summary never reaches this branch as unsecured once confirmed', () => {
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'confirmed',
      mySeat: 'paid' as SeatState,
      paymentSummary: summary({ state: 'paid', fullyPaid: true, paidSeats: 2 }),
    });
    expect(v.secured).toBe(true);
    expect(v.headline).toBe('confirmed');
    expect(v.notes).toEqual([]);
  });
});

describe('describeRegistrationStatus - headline: unsecured (legacy, fee-only)', () => {
  it('unpaid entry with a fee is an action, not a done state', () => {
    const v = describeRegistrationStatus(base);
    expect(v.headline).toBe('unsecured');
    expect(v.secured).toBe(false);
    expect(v.tone).toBe('action');
    expect(v.needsPayment).toBe(true);
    expect(v.shortLabel).toBe('Slot not secured');
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

  it('a declined payment is unsecured, and notes the decline', () => {
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'payment_pending',
      paymentStatus: 'rejected',
    });
    expect(v.headline).toBe('unsecured');
    expect(v.tone).toBe('action');
    expect(v.needsPayment).toBe(true);
    expect(v.shortLabel).toBe('Slot not secured');
    expect(v.steps[0]).toMatch(/declined|new/i);
    expect(v.notes).toEqual(['Last receipt declined - send a new one']);
  });

  it('an unpaid doubles entry lists both the payment and the partner step, payment first, no notes yet needed beyond the partner note', () => {
    const v = describeRegistrationStatus({ ...base, partnerUnconfirmed: true });
    expect(v.headline).toBe('unsecured');
    expect(v.steps.length).toBe(2);
    expect(v.steps[0]).toMatch(/pay/i);
    expect(v.steps[1]).toMatch(/partner/i);
    expect(v.notes).toEqual(['Partner has not confirmed yet']);
  });

  it('a vacant seat after a decline asks for a new partner when no lock date is known', () => {
    const v = describeRegistrationStatus({
      regStatus: 'payment_pending',
      paymentStatus: null,
      fee: 0,
      seatVacantAfterDecline: true,
    });
    expect(v.headline).toBe('unsecured');
    expect(v.steps.some((s) => /new partner/i.test(s))).toBe(true);
    expect(v.notes).toEqual(['Name a partner to fill the empty seat']);
  });

  it('an open seat with a known lock date asks to choose a partner before it (§2AM), noted with the date', () => {
    const v = describeRegistrationStatus({
      regStatus: 'payment_pending',
      paymentStatus: null,
      fee: 0,
      seatOpen: true,
      partnerLockAt: '2026-10-09T16:00:00.000Z',
      partnerLockPassed: false,
    });
    expect(v.headline).toBe('unsecured');
    expect(v.steps.some((s) => /choose your partner before/i.test(s))).toBe(true);
    expect(v.notes[0]).toMatch(/no partner yet - choose one before/i);
  });

  it('an open seat past the lock points the applicant at the organizer, in both steps and notes', () => {
    const v = describeRegistrationStatus({
      regStatus: 'payment_pending',
      paymentStatus: null,
      fee: 0,
      seatOpen: true,
      partnerLockPassed: true,
    });
    expect(v.headline).toBe('unsecured');
    expect(v.steps.some((s) => /lock-in has passed/i.test(s))).toBe(true);
    expect(v.notes.some((s) => /lock-in has passed/i.test(s))).toBe(true);
  });

  it('an open seat on a free division is unsecured with a "name a partner" note', () => {
    const v = describeRegistrationStatus({
      regStatus: 'payment_pending',
      paymentStatus: null,
      fee: 0,
      seatOpen: true,
    });
    expect(v.headline).toBe('unsecured');
    expect(v.secured).toBe(false);
    expect(v.notes).toEqual(['Name a partner to fill the empty seat']);
  });

  it('waitlisted is unsecured (§2AP E) but keeps its own distinct title/assurance copy, with a waitlist note first', () => {
    const v = describeRegistrationStatus({ ...base, regStatus: 'waitlisted' });
    expect(v.headline).toBe('unsecured');
    expect(v.shortLabel).toBe('Slot not secured');
    expect(v.title).toBe("You're on the waitlist");
    expect(v.tone).toBe('action');
    expect(v.secured).toBe(false);
    expect(v.assurance).toMatch(/waitlist/i);
    expect(v.notes[0]).toBe('On the waitlist - no slot held yet');
  });

  it('a waitlisted doubles entry with an open seat lists the waitlist note first, then the partner note', () => {
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'waitlisted',
      seatOpen: true,
    });
    expect(v.notes).toEqual([
      'On the waitlist - no slot held yet',
      'Name a partner to fill the empty seat',
    ]);
  });

  it('a free division awaits confirmation without asking for money, noted as awaiting the organizer', () => {
    const v = describeRegistrationStatus({
      regStatus: 'payment_pending',
      paymentStatus: null,
      fee: 0,
    });
    expect(v.headline).toBe('unsecured');
    expect(v.needsPayment).toBe(false);
    expect(v.shortLabel).toBe('Slot not secured');
    expect(v.steps.some((s) => /pay/i.test(s))).toBe(false);
    expect(v.notes).toEqual(["Awaiting the organizer's confirmation"]);
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

describe('describeRegistrationStatus - headline: verifying (legacy, fee-only)', () => {
  it('a submitted receipt awaiting review is verifying, not action - the applicant has done their part', () => {
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'payment_submitted',
      paymentStatus: 'pending',
    });
    expect(v.headline).toBe('verifying');
    expect(v.tone).toBe('waiting');
    expect(v.needsPayment).toBe(false);
    expect(v.secured).toBe(false);
    expect(v.shortLabel).toBe('Payment for verification');
    expect(v.steps.some((s) => /verify/i.test(s))).toBe(true);
    expect(v.notes).toEqual([]);
  });

  it('a paid-and-under-review doubles entry with an unconfirmed partner notes the partner', () => {
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'payment_submitted',
      paymentStatus: 'pending',
      partnerUnconfirmed: true,
    });
    expect(v.headline).toBe('verifying');
    expect(v.shortLabel).toBe('Payment for verification');
    expect(v.tone).toBe('waiting');
    expect(v.secured).toBe(false);
    expect(v.steps.some((s) => /partner/i.test(s))).toBe(true);
    expect(v.notes).toEqual(['Partner has not confirmed yet']);
  });

  it('an under_review regStatus alone (no explicit paymentStatus) is still verifying', () => {
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'under_review',
      paymentStatus: null,
    });
    expect(v.headline).toBe('verifying');
  });
});

describe('describeRegistrationStatus - seat-aware (paymentSummary supplied, master_plan §2AO/§2AP)', () => {
  it('my own unpaid seat is unsecured with the seat-specific step', () => {
    const v = describeRegistrationStatus({
      ...base,
      mySeat: 'unpaid' as SeatState,
      paymentSummary: summary({ state: 'unpaid' }),
    });
    expect(v.headline).toBe('unsecured');
    expect(v.secured).toBe(false);
    expect(v.tone).toBe('action');
    expect(v.needsPayment).toBe(true);
    expect(v.shortLabel).toBe('Slot not secured');
    expect(v.steps[0]).toMatch(/pay for your seat/i);
    expect(v.notes).toEqual([]);
  });

  it('a declined seat is unsecured, distinct from a merely unpaid one, and notes the decline', () => {
    const v = describeRegistrationStatus({
      ...base,
      mySeat: 'declined' as SeatState,
      paymentSummary: summary({ state: 'declined' }),
    });
    expect(v.headline).toBe('unsecured');
    expect(v.tone).toBe('action');
    expect(v.needsPayment).toBe(true);
    expect(v.shortLabel).toBe('Slot not secured');
    expect(v.steps[0]).toMatch(/declined/i);
    expect(v.notes).toEqual(['Last receipt declined - send a new one']);
  });

  it('a topup seat is unsecured, asking for the difference, and notes the top-up', () => {
    const v = describeRegistrationStatus({
      ...base,
      mySeat: 'topup' as SeatState,
      paymentSummary: summary({ state: 'partial', paidSeats: 1 }),
    });
    expect(v.headline).toBe('unsecured');
    expect(v.tone).toBe('action');
    expect(v.needsPayment).toBe(true);
    expect(v.steps[0]).toMatch(/top-up/i);
    expect(v.notes).toEqual(['Top-up needed for your slot']);
  });

  it('my seat paid but the team only partial is verifying, not an action for me, and notes the partner', () => {
    const v = describeRegistrationStatus({
      ...base,
      mySeat: 'paid' as SeatState,
      partnerName: 'Maria',
      paymentSummary: summary({ state: 'partial', paidSeats: 1 }),
    });
    expect(v.headline).toBe('verifying');
    expect(v.secured).toBe(false);
    expect(v.tone).toBe('waiting');
    expect(v.needsPayment).toBe(false);
    expect(v.shortLabel).toBe('Payment for verification');
    expect(v.steps.some((s) => /Maria still needs to pay/i.test(s))).toBe(true);
    expect(v.notes).toEqual(['Maria still needs to pay their slot']);
  });

  it('both seats submitted (team fully submitted) is verifying, under review', () => {
    const v = describeRegistrationStatus({
      ...base,
      mySeat: 'submitted' as SeatState,
      paymentSummary: summary({ state: 'submitted', submittedSeats: 2 }),
    });
    expect(v.headline).toBe('verifying');
    expect(v.tone).toBe('waiting');
    expect(v.needsPayment).toBe(false);
    expect(v.shortLabel).toBe('Payment for verification');
    expect(v.steps[0]).toMatch(/wait for the organizer/i);
  });

  it('a team receipt submitted (no per-seat mySeat) is verifying via the team-covered path', () => {
    const v = describeRegistrationStatus({
      ...base,
      mySeat: null,
      paymentSummary: summary({ state: 'submitted', submittedSeats: 2, teamReceipt: 'submitted' }),
    });
    expect(v.headline).toBe('verifying');
  });

  it('a bare (singles-shaped, one seat) declined summary never mentions a partner step or note', () => {
    const v = describeRegistrationStatus({
      ...base,
      mySeat: 'declined' as SeatState,
      paymentSummary: summary({ state: 'declined', totalSeats: 1 }),
    });
    expect(v.steps.some((s) => /still needs to pay/i.test(s))).toBe(false);
    expect(v.notes.some((s) => /still needs to pay/i.test(s))).toBe(false);
  });

  it('legacy callers without paymentSummary are completely unaffected in wording, just the new labels', () => {
    const v = describeRegistrationStatus(base);
    expect(v.shortLabel).toBe('Slot not secured');
    expect(v.headline).toBe('unsecured');
    expect(v.steps[0]).toMatch(/pay the fee/i);
  });

  it('a seat-aware waitlisted entry is unsecured with the waitlist note', () => {
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'waitlisted',
      mySeat: 'paid' as SeatState,
      paymentSummary: summary({ state: 'paid', fullyPaid: true, paidSeats: 2 }),
    });
    expect(v.headline).toBe('unsecured');
    expect(v.title).toBe("You're on the waitlist");
    expect(v.notes).toEqual(['On the waitlist - no slot held yet']);
  });
});

describe('describeRegistrationStatus - notes ordering (§2AP E)', () => {
  it('waitlist note always leads, ahead of any partner note', () => {
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'waitlisted',
      partnerUnconfirmed: true,
    });
    expect(v.notes[0]).toBe('On the waitlist - no slot held yet');
    expect(v.notes[1]).toBe('Partner has not confirmed yet');
  });

  it('the decline note comes after the partner note', () => {
    const v = describeRegistrationStatus({
      ...base,
      regStatus: 'payment_pending',
      paymentStatus: 'rejected',
      partnerUnconfirmed: true,
    });
    expect(v.notes).toEqual([
      'Partner has not confirmed yet',
      'Last receipt declined - send a new one',
    ]);
  });
});
