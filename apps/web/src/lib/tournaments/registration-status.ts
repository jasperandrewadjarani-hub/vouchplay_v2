/**
 * The one honest description of a registration's real state, from the applicant's point of view
 * (master_plan §2G, amended to a three-state headline by §2AP E).
 *
 * A single pure function so three surfaces cannot describe the same entry three different ways: the
 * chip in the division browser, the notice on the My-registrations card, and the badge on the
 * tournament card. It is the same discipline §1Z applied to the organizer's queues.
 *
 * THE RULE (§2AP E): the applicant sees exactly one of three headlines everywhere a chip appears -
 * **Confirmed** (done, green), **Payment for verification** (waiting - a receipt covering the
 * viewer's own slot, or the whole team, is in), or **Slot not secured** (action, amber - nothing
 * covering the viewer's slot yet, a decline, a top-up, the waitlist, or a free entry still awaiting
 * the organizer). Every other truth - no partner yet, partner not confirmed, top-up needed, the
 * waitlist, a declined receipt, an organizer confirmation still pending on a free entry - moves to
 * `notes[]`, rendered only inside the My-registrations card, under the headline. `shortLabel` is kept
 * as a plain alias of `headlineLabel` so a caller that has not been touched for §2AP still renders a
 * single, sensible chip.
 */

import { formatMonthDay } from '@/lib/format-date';
import type { EntryPaymentSummary, SeatState } from '@vouchplay/core';

export type SlotTone = 'action' | 'waiting' | 'done';

export type RegistrationHeadline = 'confirmed' | 'verifying' | 'unsecured';

export interface RegistrationFacts {
  /** registrations.status */
  regStatus: string;
  /** payments.status, or null when no payment row exists yet. */
  paymentStatus: string | null;
  /** The per-player fee. 0 (or less) means the division is free and no payment is owed. */
  fee: number;
  /** Doubles: a named partner has not accepted yet. */
  partnerUnconfirmed?: boolean;
  /** Doubles: the seat is empty because the last named partner declined (§1U). Kept for
   *  compatibility - treated as an alias for `seatOpen` when that is not supplied (§2AM). */
  seatVacantAfterDecline?: boolean;
  /** Doubles: the team is short a player, for any reason - never named, declined, expired, or the
   *  invite cancelled (master_plan §2AM decision 2/3). */
  seatOpen?: boolean;
  /** The effective partner lock-in, ISO, or null/undefined when there is none to show. */
  partnerLockAt?: string | null;
  /** Whether the partner lock-in has already passed. */
  partnerLockPassed?: boolean;
  /** The seat-summary of this entry's money state (master_plan §2AO A2), or null/undefined for a
   *  caller that has not been updated for slots yet - falls back to the legacy fee-only steps below. */
  paymentSummary?: EntryPaymentSummary | null;
  /** The viewer's own seat state, read off `paymentSummary.seats` by the caller. Only meaningful
   *  alongside `paymentSummary`. */
  mySeat?: SeatState | null;
  /** The other team member's first name, for the seat-aware "{partner} still needs to pay" step. */
  partnerName?: string | null;
}

export interface RegistrationStatusView {
  tone: SlotTone;
  /** True only for a confirmed entry. Drives every "you're in" vs "not secured" decision. */
  secured: boolean;
  /** Kept as a plain alias of `headlineLabel` (§2AP E) so an untouched caller still renders one
   *  sensible chip. Do not read this for anything more specific than the headline itself. */
  shortLabel: string;
  /** The one headline word shown EVERYWHERE a chip appears - division rows, tournament cards, the
   *  My-registrations card (master_plan §2AP E). */
  headline: RegistrationHeadline;
  /** 'Confirmed' | 'Payment for verification' | 'Slot not secured'. */
  headlineLabel: string;
  /** Every secondary truth the headline does not carry, short, applicant-facing, in priority order.
   *  Rendered only inside the My-registrations card, under the headline. Empty when there is nothing
   *  more to say. */
  notes: string[];
  /** The heading of the notice on the applicant's own card. */
  title: string;
  /** What is still outstanding, in plain language, in the order the applicant should act. Empty
   *  when the entry is secured. */
  steps: string[];
  /** One line naming the slot's safety, for placing beside the chip. */
  assurance: string;
  /** The applicant themselves can still act (pay) - drives the amber "action" treatment. */
  needsPayment: boolean;
}

const NOT_SECURED = 'Your slot is not secured yet';

const HEADLINE_LABEL: Record<RegistrationHeadline, string> = {
  confirmed: 'Confirmed',
  verifying: 'Payment for verification',
  unsecured: 'Slot not secured',
};

const HEADLINE_TONE: Record<RegistrationHeadline, SlotTone> = {
  confirmed: 'done',
  verifying: 'waiting',
  unsecured: 'action',
};

/**
 * The ONE decision behind the headline (§2AP E), computed once up front from the raw facts so every
 * branch below just describes the same verdict in different words - it can never disagree with itself.
 *
 * Confirmed and waitlisted are terminal. Otherwise: a receipt is "in" when it covers the viewer's own
 * slot (`mySeat` submitted or paid) or the whole team (a legacy `paymentStatus`/`regStatus` still
 * mid-review, or a seat-aware `teamReceipt` submitted/verified) - and a receipt covering the viewer's
 * own slot only counts while that slot is not itself declined or short a top-up.
 */
function computeHeadline(facts: RegistrationFacts): RegistrationHeadline {
  if (facts.regStatus === 'confirmed') return 'confirmed';
  if (facts.regStatus === 'waitlisted') return 'unsecured';

  const mySeat = facts.mySeat ?? null;
  if (mySeat === 'declined' || mySeat === 'topup') return 'unsecured';

  const ownSlotCovered = mySeat === 'submitted' || mySeat === 'paid';
  const teamCovered =
    facts.paymentStatus === 'submitted' ||
    facts.paymentStatus === 'pending' ||
    facts.regStatus === 'payment_submitted' ||
    facts.regStatus === 'under_review' ||
    facts.paymentSummary?.teamReceipt === 'submitted' ||
    facts.paymentSummary?.teamReceipt === 'verified';

  return ownSlotCovered || teamCovered ? 'verifying' : 'unsecured';
}

function finish(
  headline: RegistrationHeadline,
  notes: string[],
  rest: { title: string; steps: string[]; assurance: string; needsPayment: boolean },
): RegistrationStatusView {
  const headlineLabel = HEADLINE_LABEL[headline];
  return {
    tone: HEADLINE_TONE[headline],
    secured: headline === 'confirmed',
    shortLabel: headlineLabel,
    headline,
    headlineLabel,
    notes,
    ...rest,
  };
}

/** The shared "no partner" note/step reasoning - identical wording logic on both the fee-only and
 *  seat-aware paths, so a doubles entry never describes an empty seat two different ways. */
function partnerNote(
  seatOpen: boolean,
  partnerUnconfirmed: boolean,
  partnerLockAt: string | null | undefined,
  partnerLockPassed: boolean | undefined,
): string | null {
  if (seatOpen) {
    if (partnerLockPassed) {
      return 'The partner lock-in has passed - contact the organizer about your partner';
    }
    if (partnerLockAt) {
      return `No partner yet - choose one before ${formatMonthDay(partnerLockAt)}`;
    }
    return 'Name a partner to fill the empty seat';
  }
  if (partnerUnconfirmed) return 'Partner has not confirmed yet';
  return null;
}

/**
 * Describe a registration honestly. Order matters: the headline is decided once (`computeHeadline`),
 * then each path below fills in the applicant-facing detail - `title`/`steps`/`assurance` for the
 * primary action, `notes` for everything secondary.
 */
export function describeRegistrationStatus(facts: RegistrationFacts): RegistrationStatusView {
  const headline = computeHeadline(facts);
  const partnerUnconfirmed = Boolean(facts.partnerUnconfirmed);
  const seatOpen = Boolean(facts.seatOpen ?? facts.seatVacantAfterDecline);
  const feeOwed = facts.fee > 0;

  if (headline === 'confirmed') {
    // §2AP C4: a confirmed entry that becomes partial (an accepted release detaches the seat) keeps
    // its status - but the remaining player needs to know the new partner will owe money.
    const notes: string[] = [];
    if (seatOpen) {
      notes.push('Slot open - the new partner will need to pay their slot');
    } else if (facts.paymentSummary?.state === 'partial') {
      const partnerName = facts.partnerName?.trim() || 'Your partner';
      notes.push(`${partnerName} still needs to pay their slot`);
    }
    return finish('confirmed', notes, {
      title: "You're in",
      steps: [],
      assurance: 'Your slot is confirmed.',
      needsPayment: false,
    });
  }

  if (facts.paymentSummary) {
    return describeSeatAwareStatus(facts, facts.paymentSummary, headline, {
      partnerUnconfirmed,
      seatOpen,
    });
  }

  return describeLegacyStatus(facts, headline, { partnerUnconfirmed, seatOpen, feeOwed });
}

function describeLegacyStatus(
  facts: RegistrationFacts,
  headline: RegistrationHeadline,
  ctx: { partnerUnconfirmed: boolean; seatOpen: boolean; feeOwed: boolean },
): RegistrationStatusView {
  const { regStatus, paymentStatus } = facts;
  const { partnerUnconfirmed, seatOpen, feeOwed } = ctx;

  const paymentRejected = paymentStatus === 'rejected';
  const paymentUnderReview =
    regStatus === 'payment_submitted' ||
    regStatus === 'under_review' ||
    paymentStatus === 'pending';
  const paymentNotStarted = regStatus === 'payment_pending' && !paymentUnderReview;

  const steps: string[] = [];
  if (feeOwed) {
    if (paymentRejected) {
      steps.push('Your last receipt was declined. Upload a new payment receipt.');
    } else if (paymentNotStarted) {
      steps.push('Pay the fee and upload your receipt.');
    } else if (paymentUnderReview) {
      steps.push('Wait for the organizer to verify your payment.');
    }
  }

  // §2AM decision 5: the deadline replaces the generic "name a new partner" line once it is known,
  // so the applicant sees the same date the organizer set rather than an open-ended ask.
  if (seatOpen) {
    if (facts.partnerLockPassed) {
      steps.push('The partner lock-in has passed - contact the organizer about your partner.');
    } else if (facts.partnerLockAt) {
      steps.push(`Choose your partner before ${formatMonthDay(facts.partnerLockAt)}.`);
    } else {
      steps.push('Name a new partner to fill the empty seat.');
    }
  } else if (partnerUnconfirmed) {
    steps.push('Your partner still needs to confirm the team.');
  }

  const pn = partnerNote(
    seatOpen,
    partnerUnconfirmed,
    facts.partnerLockAt,
    facts.partnerLockPassed,
  );

  // Waitlist is its own honest state - the entry is not taking a slot at all, and no amount of
  // paying changes that until a slot opens.
  if (regStatus === 'waitlisted') {
    return finish(headline, ['On the waitlist - no slot held yet', ...(pn ? [pn] : [])], {
      title: "You're on the waitlist",
      steps: steps.length > 0 ? steps : ['You will be notified if a slot opens up.'],
      assurance: 'This division is full, so you are on the waitlist, not holding a slot.',
      needsPayment: false,
    });
  }

  // The applicant can act now when money is owed (not started, or declined).
  const needsPayment = feeOwed && (paymentNotStarted || paymentRejected);

  if (paymentRejected) {
    return finish(headline, [...(pn ? [pn] : []), 'Last receipt declined - send a new one'], {
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + '.',
      needsPayment: true,
    });
  }

  if (needsPayment) {
    return finish(headline, pn ? [pn] : [], {
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + ' - pay to secure it.',
      needsPayment: true,
    });
  }

  // Payment is in and being reviewed, and/or the partner has not confirmed. The applicant has done
  // their part; the slot is still not secured until the organizer confirms.
  if (paymentUnderReview && feeOwed) {
    return finish(headline, pn ? [pn] : [], {
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + ' until the organizer confirms it.',
      needsPayment: false,
    });
  }

  if (seatOpen) {
    return finish(headline, pn ? [pn] : [], {
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + ' until you choose a partner.',
      needsPayment: false,
    });
  }

  if (partnerUnconfirmed) {
    return finish(headline, pn ? [pn] : [], {
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + ' until your partner confirms.',
      needsPayment: false,
    });
  }

  // Free division, no fee, awaiting the organizer's confirmation.
  return finish(headline, ["Awaiting the organizer's confirmation"], {
    title: NOT_SECURED,
    steps: steps.length > 0 ? steps : ['The organizer will confirm your entry.'],
    assurance: NOT_SECURED + ' until the organizer confirms it.',
    needsPayment: false,
  });
}

/** The plain-language step for the viewer's OWN seat, or null when it needs nothing. */
function mySeatStep(seat: SeatState): string | null {
  switch (seat) {
    case 'unpaid':
      return 'Pay for your seat and upload your receipt.';
    case 'submitted':
      return 'Wait for the organizer to verify your payment.';
    case 'declined':
      return 'Send a new receipt for your seat - the last one was declined.';
    case 'topup':
      return 'Top-up needed: pay the difference for your seat.';
    case 'paid':
    case 'empty':
    default:
      return null;
  }
}

/**
 * The seat-aware twin of the fee-only logic above (master_plan §2AO A2/A7, F). Called only when the
 * caller supplies `paymentSummary` - a legacy caller (organizer surfaces not yet touched by §2AO, or
 * a pre-migration deploy) gets exactly the fee-only behaviour above, unchanged.
 */
function describeSeatAwareStatus(
  facts: RegistrationFacts,
  summary: EntryPaymentSummary,
  headline: RegistrationHeadline,
  ctx: { partnerUnconfirmed: boolean; seatOpen: boolean },
): RegistrationStatusView {
  const mySeat = facts.mySeat ?? null;
  const partnerName = facts.partnerName?.trim() || 'Your partner';
  const { partnerUnconfirmed, seatOpen } = ctx;

  const steps: string[] = [];
  const mine = mySeat ? mySeatStep(mySeat) : null;
  if (mine) steps.push(mine);

  // Doubles only: my own seat is settled but the team is not fully paid, so the other seat is the
  // reason. This does not need the partner's exact seat state - only that they are the one holding
  // the team back, which "not fully paid while mine is settled" already establishes for a two-seat team.
  const partnerNeedsToPay =
    summary.totalSeats > 1 && !summary.fullyPaid && (mySeat === 'paid' || mySeat === 'topup');
  if (partnerNeedsToPay) {
    steps.push(`${partnerName} still needs to pay their seat.`);
  }

  if (seatOpen) {
    if (facts.partnerLockPassed) {
      steps.push('The partner lock-in has passed - contact the organizer about your partner.');
    } else if (facts.partnerLockAt) {
      steps.push(`Choose your partner before ${formatMonthDay(facts.partnerLockAt)}.`);
    } else {
      steps.push('Name a new partner to fill the empty seat.');
    }
  } else if (partnerUnconfirmed) {
    steps.push('Your partner still needs to confirm the team.');
  }

  const pn = partnerNote(
    seatOpen,
    partnerUnconfirmed,
    facts.partnerLockAt,
    facts.partnerLockPassed,
  );
  const partnerPayNote = partnerNeedsToPay ? [`${partnerName} still needs to pay their slot`] : [];

  if (facts.regStatus === 'waitlisted') {
    return finish(
      headline,
      ['On the waitlist - no slot held yet', ...(pn ? [pn] : []), ...partnerPayNote],
      {
        title: "You're on the waitlist",
        steps: steps.length > 0 ? steps : ['You will be notified if a slot opens up.'],
        assurance: 'This division is full, so you are on the waitlist, not holding a slot.',
        needsPayment: false,
      },
    );
  }

  // The viewer themselves can act now: their own seat needs money.
  const needsPayment = mySeat === 'unpaid' || mySeat === 'declined' || mySeat === 'topup';

  if (mySeat === 'declined') {
    return finish(headline, [...(pn ? [pn] : []), 'Last receipt declined - send a new one'], {
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + '.',
      needsPayment: true,
    });
  }

  if (mySeat === 'unpaid' || mySeat === 'topup') {
    const topupNote = mySeat === 'topup' ? ['Top-up needed for your slot'] : [];
    return finish(headline, [...(pn ? [pn] : []), ...topupNote], {
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + ' - pay to secure it.',
      needsPayment: true,
    });
  }

  // My seat is settled (paid or submitted, or there is no seat of mine to speak of - a free
  // division would never reach here since summarizeEntryPayment marks it fully paid). The team as a
  // whole may still be short.
  if (summary.state === 'partial') {
    return finish(headline, [...(pn ? [pn] : []), ...partnerPayNote], {
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + ' until everyone has paid.',
      needsPayment,
    });
  }

  if (mySeat === 'submitted' || summary.state === 'submitted') {
    return finish(headline, pn ? [pn] : [], {
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + ' until the organizer confirms it.',
      needsPayment,
    });
  }

  if (seatOpen) {
    return finish(headline, pn ? [pn] : [], {
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + ' until you choose a partner.',
      needsPayment,
    });
  }

  if (partnerUnconfirmed) {
    return finish(headline, pn ? [pn] : [], {
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + ' until your partner confirms.',
      needsPayment,
    });
  }

  return finish(headline, ["Awaiting the organizer's confirmation"], {
    title: NOT_SECURED,
    steps: steps.length > 0 ? steps : ['The organizer will confirm your entry.'],
    assurance: NOT_SECURED + ' until the organizer confirms it.',
    needsPayment,
  });
}
