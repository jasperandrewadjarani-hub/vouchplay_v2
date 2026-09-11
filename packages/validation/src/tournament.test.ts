import { describe, expect, it } from 'vitest';
import { tournamentCreateSchema } from './tournament';

const base = { name: 'Test Cup' };

describe('tournamentCreateSchema - paymentNotificationEmail (master_plan §2AK)', () => {
  it('treats a blank value as off (undefined)', () => {
    const parsed = tournamentCreateSchema.parse({ ...base, paymentNotificationEmail: '' });
    expect(parsed.paymentNotificationEmail).toBeUndefined();
  });

  it('treats a whitespace-only value as off (undefined)', () => {
    const parsed = tournamentCreateSchema.parse({ ...base, paymentNotificationEmail: '   ' });
    expect(parsed.paymentNotificationEmail).toBeUndefined();
  });

  it('defaults to undefined when omitted entirely', () => {
    const parsed = tournamentCreateSchema.parse({ ...base });
    expect(parsed.paymentNotificationEmail).toBeUndefined();
  });

  it('accepts and trims a valid email address', () => {
    const parsed = tournamentCreateSchema.parse({
      ...base,
      paymentNotificationEmail: '  kathrina.malinao@gmail.com  ',
    });
    expect(parsed.paymentNotificationEmail).toBe('kathrina.malinao@gmail.com');
  });

  it('rejects garbage with the exact non-technical message', () => {
    const result = tournamentCreateSchema.safeParse({
      ...base,
      paymentNotificationEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues.find(
        (i) => i.path[0] === 'paymentNotificationEmail',
      )?.message;
      expect(message).toBe('Enter a valid email address.');
    }
  });

  it('rejects an address over 254 characters', () => {
    const result = tournamentCreateSchema.safeParse({
      ...base,
      paymentNotificationEmail: `${'a'.repeat(250)}@example.com`,
    });
    expect(result.success).toBe(false);
  });
});
