/**
 * The one honest description of a registration's real state, from the applicant's point of view
 * (master_plan §2G).
 *
 * A single pure function so three surfaces cannot describe the same entry three different ways: the
 * chip in the division browser, the notice on the My-registrations card, and the badge on the
 * tournament card. It is the same discipline §1Z applied to the organizer's queues.
 *
 * THE RULE: only a `confirmed` registration is SECURED. Every other active state -
 * payment_pending, payment_submitted, under_review, waitlisted - is PROVISIONAL, and the applicant's
 * own view of it must say so plainly and say what is still outstanding. The pay-first flow (§1U)
 * depends on that urgency: telling someone they are "Registered" before they have paid removes the
 * very reason to pay.
 */

import { formatMonthDay } from '@/lib/format-date';

export type SlotTone = 'action' | 'waiting' | 'done';

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
}

export interface RegistrationStatusView {
  tone: SlotTone;
  /** True only for a confirmed entry. Drives every "you're in" vs "not secured" decision. */
  secured: boolean;
  /** The single most important state word, for a compact chip. */
  shortLabel: string;
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

/**
 * Describe a registration honestly. Order matters: the most action-forcing truth wins the headline,
 * but every outstanding step is still listed so nothing is hidden.
 */
export function describeRegistrationStatus(facts: RegistrationFacts): RegistrationStatusView {
  const { regStatus, paymentStatus, fee } = facts;
  const partnerUnconfirmed = Boolean(facts.partnerUnconfirmed);
  // General truth: the team is short a player, for any reason (§2AM decision 2/3). `seatVacantAfterDecline`
  // is kept as the fallback so a caller that has not been updated yet still gets the old behaviour.
  const seatOpen = Boolean(facts.seatOpen ?? facts.seatVacantAfterDecline);
  const feeOwed = fee > 0;

  // Confirmed is the ONLY secured state.
  if (regStatus === 'confirmed') {
    return {
      tone: 'done',
      secured: true,
      shortLabel: 'Confirmed',
      title: "You're in",
      steps: [],
      assurance: 'Your slot is confirmed.',
      needsPayment: false,
    };
  }

  // Everything below is provisional. Collect the outstanding steps first, then choose the headline.
  const steps: string[] = [];

  const paymentRejected = paymentStatus === 'rejected';
  const paymentUnderReview =
    regStatus === 'payment_submitted' ||
    regStatus === 'under_review' ||
    paymentStatus === 'pending';
  const paymentNotStarted = regStatus === 'payment_pending' && !paymentUnderReview;

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

  // Waitlist is its own honest state - the entry is not taking a slot at all, and no amount of
  // paying changes that until a slot opens.
  if (regStatus === 'waitlisted') {
    return {
      tone: 'waiting',
      secured: false,
      shortLabel: 'Waitlisted',
      title: "You're on the waitlist",
      steps: steps.length > 0 ? steps : ['You will be notified if a slot opens up.'],
      assurance: 'This division is full, so you are on the waitlist, not holding a slot.',
      needsPayment: false,
    };
  }

  // The applicant can act now when money is owed (not started, or declined).
  const needsPayment = feeOwed && (paymentNotStarted || paymentRejected);

  if (paymentRejected) {
    return {
      tone: 'action',
      secured: false,
      shortLabel: 'Payment declined',
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + '.',
      needsPayment: true,
    };
  }

  if (needsPayment) {
    return {
      tone: 'action',
      secured: false,
      shortLabel: 'Payment pending',
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + ' - pay to secure it.',
      needsPayment: true,
    };
  }

  // Payment is in and being reviewed, and/or the partner has not confirmed. The applicant has done
  // their part; the slot is still not secured until the organizer confirms.
  if (paymentUnderReview && feeOwed) {
    return {
      tone: 'waiting',
      secured: false,
      // Payment still wins the headline over "Under review" when neither partner fact applies; an
      // open seat is the more actionable of the two partner states, so it takes priority (§2AM).
      shortLabel: seatOpen
        ? 'No partner yet'
        : partnerUnconfirmed
          ? 'Partner not confirmed'
          : 'Under review',
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + ' until the organizer confirms it.',
      needsPayment: false,
    };
  }

  if (seatOpen) {
    return {
      tone: 'waiting',
      secured: false,
      shortLabel: 'No partner yet',
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + ' until you choose a partner.',
      needsPayment: false,
    };
  }

  if (partnerUnconfirmed) {
    return {
      tone: 'waiting',
      secured: false,
      shortLabel: 'Partner not confirmed',
      title: NOT_SECURED,
      steps,
      assurance: NOT_SECURED + ' until your partner confirms.',
      needsPayment: false,
    };
  }

  // Free division, no fee, awaiting the organizer's confirmation.
  return {
    tone: 'waiting',
    secured: false,
    shortLabel: 'Awaiting confirmation',
    title: NOT_SECURED,
    steps: steps.length > 0 ? steps : ['The organizer will confirm your entry.'],
    assurance: NOT_SECURED + ' until the organizer confirms it.',
    needsPayment: false,
  };
}
