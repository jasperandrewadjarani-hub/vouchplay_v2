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
