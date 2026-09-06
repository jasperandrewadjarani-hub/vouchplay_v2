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
