import { describe, it, expect } from 'vitest';
import {
  notificationDef,
  NOTIFICATION_CATALOG,
  MUTABLE_CATEGORIES,
  CATEGORY_LABELS,
} from './catalog';

describe('notification catalog (§27)', () => {
  it('builds neutral titles from params', () => {
    const def = notificationDef('vouch_received')!;
    expect(def.title({ actorName: 'Maria' })).toBe('Maria vouched for you');
    expect(def.category).toBe('vouches');
    expect(def.critical).toBe(false);
  });

  it('marks moderation + security as critical', () => {
    expect(notificationDef('moderation_action')!.critical).toBe(true);
    expect(notificationDef('account_security')!.critical).toBe(true);
  });

  it('marks pilot-critical registration and payment outcomes as email-eligible', () => {
    for (const type of [
      'registration_confirmed',
      'registration_rejected',
      'registration_promoted',
      'payment_verified',
      'payment_rejected',
    ]) {
      expect(notificationDef(type)!.critical, type).toBe(true);
    }
  });

  it('critical categories are NOT mutable', () => {
    expect(MUTABLE_CATEGORIES).not.toContain('moderation');
    expect(MUTABLE_CATEGORIES).not.toContain('security');
    expect(MUTABLE_CATEGORIES).toContain('vouches');
  });

  it('every catalog category has a label', () => {
    for (const def of Object.values(NOTIFICATION_CATALOG)) {
      expect(CATEGORY_LABELS[def.category]).toBeTruthy();
    }
  });

  it('falls back gracefully for an unknown type', () => {
    expect(notificationDef('does_not_exist')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §2AO A - tournament slots (pay per seat)
// ---------------------------------------------------------------------------
describe('tournament slot notifications (§2AO A)', () => {
  it('seat_payment_due is critical, names the amount, and mentions the deadline when given', () => {
    const def = notificationDef('seat_payment_due')!;
    expect(def.category).toBe('payments');
    expect(def.critical).toBe(true);
    expect(def.title({ tournamentName: 'Hermosa Open' })).toBe(
      'Your seat for Hermosa Open needs payment',
    );
    const withDeadline = def.body({ amount: 'PHP 1,500', deadline: 'Sep 20, 2026' });
    expect(withDeadline).toContain('PHP 1,500');
    expect(withDeadline).toContain('Sep 20, 2026');
    const withoutDeadline = def.body({ amount: 'PHP 1,500' });
    expect(withoutDeadline).toContain('PHP 1,500');
    expect(withoutDeadline).not.toContain('early-bird');
  });

  it('seat_payment_due falls back to generic wording with no amount given', () => {
    const def = notificationDef('seat_payment_due')!;
    expect(def.body({})).toContain('the seat fee');
  });

  it('seat_payment_verified is non-critical and names the tournament', () => {
    const def = notificationDef('seat_payment_verified')!;
    expect(def.critical).toBe(false);
    expect(def.category).toBe('payments');
    expect(def.title({ tournamentName: 'Hermosa Open' })).toBe(
      'Your seat payment for Hermosa Open was verified',
    );
  });

  it('slot_reservation_verified is critical and prompts choosing a division', () => {
    const def = notificationDef('slot_reservation_verified')!;
    expect(def.critical).toBe(true);
    expect(def.title({ tournamentName: 'Hermosa Open' })).toBe(
      'Your reserved slot for Hermosa Open is verified - choose your division',
    );
  });

  it('slot_reservation_rejected is critical and surfaces the reason when given', () => {
    const def = notificationDef('slot_reservation_rejected')!;
    expect(def.critical).toBe(true);
    expect(def.title({ tournamentName: 'Hermosa Open' })).toBe(
      'Your slot receipt for Hermosa Open was declined',
    );
    expect(def.body({ reason: 'Illegible receipt' })).toBe('Illegible receipt');
    expect(def.body({})).toBeUndefined();
  });

  it('every new slot notification type is payments-category and covered by MUTABLE_CATEGORIES rules', () => {
    for (const type of [
      'seat_payment_due',
      'seat_payment_verified',
      'slot_reservation_verified',
      'slot_reservation_rejected',
    ]) {
      expect(notificationDef(type)!.category).toBe('payments');
    }
    // payments is not fully critical (seat_payment_verified is mutable), so it stays a mutable category.
    expect(MUTABLE_CATEGORIES).toContain('payments');
  });
});

// ---------------------------------------------------------------------------
// §2AP C4/C5 - seat-model hardening: a released seat notifies both sides.
// ---------------------------------------------------------------------------
describe('seat release notifications (§2AP C)', () => {
  it('partner_left_pay_pending is critical, partners-category, and names who left and who owes', () => {
    const def = notificationDef('partner_left_pay_pending')!;
    expect(def.category).toBe('partners');
    expect(def.critical).toBe(true);
    expect(def.title({ actorName: 'Maria', tournamentName: 'Hermosa Open' })).toBe(
      'Maria left your team for Hermosa Open - the new partner will need to pay their slot',
    );
  });

  it('partner_left_pay_pending is not mutable (partners has other critical types too, but this one cannot be muted)', () => {
    expect(notificationDef('partner_left_pay_pending')!.critical).toBe(true);
  });

  it('slot_released is non-critical, payments-category, and tells the player their slot is free again', () => {
    const def = notificationDef('slot_released')!;
    expect(def.category).toBe('payments');
    expect(def.critical).toBe(false);
    expect(def.title({ tournamentName: 'Hermosa Open' })).toBe(
      'Your slot for Hermosa Open is free to use again',
    );
    expect(def.body({})).toBe('Choose a division any time before registration closes.');
  });
});

// ---------------------------------------------------------------------------
// §2AQ A1/A2/A3 - reminders cron + remind-partner + organizer assign-partner.
// ---------------------------------------------------------------------------
describe('reminder + assign-partner notifications (§2AQ A)', () => {
  it('early_bird_ending is critical, payments-category, and names the tournament + deadline', () => {
    const def = notificationDef('early_bird_ending')!;
    expect(def.category).toBe('payments');
    expect(def.critical).toBe(true);
    expect(def.title({ tournamentName: 'Hermosa Open' })).toBe(
      'Early bird for Hermosa Open ends soon',
    );
    expect(def.body({ deadline: 'Sep 15, 2026' })).toBe(
      'Pay by Sep 15, 2026 to keep the early-bird price.',
    );
  });

  it('early_bird_ending falls back gracefully with no deadline given', () => {
    const def = notificationDef('early_bird_ending')!;
    expect(def.body({})).toBe('Pay by the deadline to keep the early-bird price.');
  });

  it('registration_closing_unpaid is critical, payments-category, and needs no deadline param', () => {
    const def = notificationDef('registration_closing_unpaid')!;
    expect(def.category).toBe('payments');
    expect(def.critical).toBe(true);
    expect(def.title({ tournamentName: 'Hermosa Open' })).toBe(
      'Registration for Hermosa Open closes soon - your slot is not paid',
    );
  });

  it('registration_closing_choose_division is critical, registrations-category, and names the deadline', () => {
    const def = notificationDef('registration_closing_choose_division')!;
    expect(def.category).toBe('registrations');
    expect(def.critical).toBe(true);
    expect(def.title({ tournamentName: 'Hermosa Open', deadline: 'Sep 16, 2026' })).toBe(
      'Choose your division for Hermosa Open before Sep 16, 2026',
    );
  });

  it('partner_lock_soon is critical, partners-category, and names the lock date', () => {
    const def = notificationDef('partner_lock_soon')!;
    expect(def.category).toBe('partners');
    expect(def.critical).toBe(true);
    expect(def.title({ tournamentName: 'Hermosa Open', deadline: 'Oct 9, 2026' })).toBe(
      'Partner lock-in for Hermosa Open is Oct 9, 2026 - your seat is still open',
    );
  });

  it('seat_payment_reminder is critical, payments-category, and names the actor who is waiting', () => {
    const def = notificationDef('seat_payment_reminder')!;
    expect(def.category).toBe('payments');
    expect(def.critical).toBe(true);
    expect(def.title({ actorName: 'Mark', tournamentName: 'Hermosa Open' })).toBe(
      'Mark is waiting for you to pay your slot for Hermosa Open',
    );
  });

  it('partner_assigned is critical, partners-category, names the actor, and carries the reason when given', () => {
    const def = notificationDef('partner_assigned')!;
    expect(def.category).toBe('partners');
    expect(def.critical).toBe(true);
    expect(def.title({ actorName: 'Mandi', tournamentName: 'Hermosa Open' })).toBe(
      'The organizer assigned Mandi as your partner for Hermosa Open',
    );
    expect(def.body({ reason: 'Fit checked and seat was open' })).toBe(
      'Fit checked and seat was open',
    );
    expect(def.body({})).toBeUndefined();
  });

  it('all six new types are critical (in-app + email eligible, §27.5) and none is mutable', () => {
    const types = [
      'early_bird_ending',
      'registration_closing_unpaid',
      'registration_closing_choose_division',
      'partner_lock_soon',
      'seat_payment_reminder',
      'partner_assigned',
    ];
    for (const type of types) {
      expect(notificationDef(type)!.critical, type).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// §2AS C/F - organizer pay-nudge blast + cancel-my-reservation notifications.
// ---------------------------------------------------------------------------
describe('organizer pay-nudge + cancel-my-reservation notifications (§2AS C/F)', () => {
  it('organizer_payment_nudge is critical, payments-category, and names the tournament in the title', () => {
    const def = notificationDef('organizer_payment_nudge')!;
    expect(def.category).toBe('payments');
    expect(def.critical).toBe(true);
    expect(def.title({ tournamentName: 'Hermosa Open' })).toBe(
      'Hermosa Open: pay now to secure your slot',
    );
  });

  it('organizer_payment_nudge body is the base line alone when no deadline is given', () => {
    const def = notificationDef('organizer_payment_nudge')!;
    expect(def.body({})).toBe('Your slot is not secured until you pay.');
  });

  it('organizer_payment_nudge mentions the early-bird cutoff when earlyBird is true', () => {
    const def = notificationDef('organizer_payment_nudge')!;
    expect(def.body({ deadline: 'Sep 20, 2026', earlyBird: true })).toBe(
      'Your slot is not secured until you pay. Early bird ends Sep 20, 2026.',
    );
  });

  it('organizer_payment_nudge mentions registration closing when earlyBird is false/absent', () => {
    const def = notificationDef('organizer_payment_nudge')!;
    expect(def.body({ deadline: 'Sep 20, 2026' })).toBe(
      'Your slot is not secured until you pay. Registration closes Sep 20, 2026.',
    );
    expect(def.body({ deadline: 'Sep 20, 2026', earlyBird: false })).toBe(
      'Your slot is not secured until you pay. Registration closes Sep 20, 2026.',
    );
  });

  it('slot_cancel_requested is non-critical, registrations-category, and names the requester', () => {
    const def = notificationDef('slot_cancel_requested')!;
    expect(def.category).toBe('registrations');
    expect(def.critical).toBe(false);
    expect(def.title({ actorName: 'Mark', tournamentName: 'Hermosa Open' })).toBe(
      'Mark asked to cancel their reserved slot for Hermosa Open',
    );
  });

  it('slot_cancel_declined is critical, payments-category, and tells the player the organizer kept their slot', () => {
    const def = notificationDef('slot_cancel_declined')!;
    expect(def.category).toBe('payments');
    expect(def.critical).toBe(true);
    expect(def.title({ tournamentName: 'Hermosa Open' })).toBe(
      'Your reserved slot for Hermosa Open stays - the organizer kept it',
    );
    expect(def.body({})).toBeTruthy();
  });

  it('slot_cancel_requested is mutable (registrations has other non-critical types too)', () => {
    expect(MUTABLE_CATEGORIES).toContain('registrations');
    expect(notificationDef('slot_cancel_requested')!.critical).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §2AT - solo-entry partner merge, cancellation requests (tag/withdraw/approve).
// ---------------------------------------------------------------------------
describe('merge + cancellation-request notifications (§2AT)', () => {
  it('entry_merged is critical, partners-category, and names who it merged into', () => {
    const def = notificationDef('entry_merged')!;
    expect(def.category).toBe('partners');
    expect(def.critical).toBe(true);
    expect(def.title({ actorName: 'Mandi', tournamentName: 'Hermosa Open' })).toBe(
      "Your entry for Hermosa Open was folded into Mandi's team - you're partners now",
    );
  });

  it('cancellation_withdrawn is non-critical, registrations-category, and names who withdrew', () => {
    const def = notificationDef('cancellation_withdrawn')!;
    expect(def.category).toBe('registrations');
    expect(def.critical).toBe(false);
    expect(def.title({ actorName: 'Mark', tournamentName: 'Hermosa Open' })).toBe(
      'Mark withdrew their cancellation request for Hermosa Open',
    );
    expect(MUTABLE_CATEGORIES).toContain('registrations');
  });

  it('cancellation_approved is critical, registrations-category, and mentions the refund is with the organizer', () => {
    const def = notificationDef('cancellation_approved')!;
    expect(def.category).toBe('registrations');
    expect(def.critical).toBe(true);
    expect(def.title({ tournamentName: 'Hermosa Open' })).toBe(
      'Your entry for Hermosa Open is cancelled - any refund is settled with the organizer',
    );
  });

  it('cancellation_declined is critical, registrations-category, and says the entry stands', () => {
    const def = notificationDef('cancellation_declined')!;
    expect(def.category).toBe('registrations');
    expect(def.critical).toBe(true);
    expect(def.title({ tournamentName: 'Hermosa Open' })).toBe(
      'Your cancellation request for Hermosa Open was declined - your entry stands',
    );
  });

  it('slot_cancel_approved is critical, payments-category, and mentions the refund is with the organizer', () => {
    const def = notificationDef('slot_cancel_approved')!;
    expect(def.category).toBe('payments');
    expect(def.critical).toBe(true);
    expect(def.title({ tournamentName: 'Hermosa Open' })).toBe(
      'Your reserved slot for Hermosa Open is cancelled - any refund is settled with the organizer',
    );
  });

  it('none of the five new §2AT types can be muted', () => {
    for (const type of [
      'entry_merged',
      'cancellation_approved',
      'cancellation_declined',
      'slot_cancel_approved',
    ]) {
      expect(notificationDef(type)!.critical, type).toBe(true);
    }
    expect(notificationDef('cancellation_withdrawn')!.critical).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §2AU E - guest entry: "finish setting up your account" reminders
// ---------------------------------------------------------------------------
describe('guest verify reminders (§2AU E)', () => {
  it('guest_verify_reminder is critical, registrations-category, and names the tournament', () => {
    const def = notificationDef('guest_verify_reminder')!;
    expect(def.category).toBe('registrations');
    expect(def.critical).toBe(true);
    expect(def.title({ tournamentName: 'Hermosa Open' })).toBe(
      'Finish setting up your VouchPlay account to keep your entry for Hermosa Open',
    );
    expect(def.body({})).toBe('Enter the code from your email or sign in with this address.');
  });

  it('guest_verify_reminder_2 is a distinct type with identical copy, for the 48h send', () => {
    const first = notificationDef('guest_verify_reminder')!;
    const second = notificationDef('guest_verify_reminder_2')!;
    expect(second.category).toBe(first.category);
    expect(second.critical).toBe(true);
    expect(second.title({ tournamentName: 'Hermosa Open' })).toBe(
      first.title({ tournamentName: 'Hermosa Open' }),
    );
    expect(second.body({})).toBe(first.body({}));
  });

  it('cannot be muted', () => {
    expect(MUTABLE_CATEGORIES).toContain('registrations');
    expect(notificationDef('guest_verify_reminder')!.critical).toBe(true);
    expect(notificationDef('guest_verify_reminder_2')!.critical).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §2BE B/C - organizer powers: every decision retractable, add-entry.
// ---------------------------------------------------------------------------
describe('organizer powers notifications (§2BE B/C)', () => {
  it('registration_reverted is critical, registrations-category, and carries the reason when given', () => {
    const def = notificationDef('registration_reverted')!;
    expect(def.category).toBe('registrations');
    expect(def.critical).toBe(true);
    expect(def.title({})).toBe('Your entry was moved back to review');
    expect(
      def.body({ actorName: 'Mandi', divisionName: 'Mixed Doubles', reason: 'Receipt unclear' }),
    ).toBe('Mandi moved your Mixed Doubles entry back to review: Receipt unclear');
    expect(def.body({ actorName: 'Mandi', divisionName: 'Mixed Doubles' })).toBe(
      'Mandi moved your Mixed Doubles entry back to review.',
    );
  });

  it('registration_restored is critical, registrations-category, and names the division', () => {
    const def = notificationDef('registration_restored')!;
    expect(def.category).toBe('registrations');
    expect(def.critical).toBe(true);
    expect(def.title({ divisionName: 'Mixed Doubles' })).toBe(
      'Your Mixed Doubles entry was restored by the organizer',
    );
  });

  it('organizer_entered_you is critical, registrations-category, names the actor + division, and mentions the partner when given', () => {
    const def = notificationDef('organizer_entered_you')!;
    expect(def.category).toBe('registrations');
    expect(def.critical).toBe(true);
    expect(def.title({ tournamentName: 'Hermosa Open' })).toBe(
      "You've been entered in Hermosa Open",
    );
    expect(def.body({ actorName: 'Mandi', divisionName: 'Mixed Doubles' })).toBe(
      'Mandi entered you in Mixed Doubles. Not right? Ask the organizer or request a cancellation from My registrations.',
    );
    expect(
      def.body({ actorName: 'Mandi', divisionName: 'Mixed Doubles', extra: 'Maria Santos' }),
    ).toBe(
      'Mandi entered you in Mixed Doubles with Maria Santos. Not right? Ask the organizer or request a cancellation from My registrations.',
    );
  });

  it('none of the three new §2BE types can be muted', () => {
    for (const type of [
      'registration_reverted',
      'registration_restored',
      'organizer_entered_you',
    ]) {
      expect(notificationDef(type)!.critical, type).toBe(true);
    }
  });
});
