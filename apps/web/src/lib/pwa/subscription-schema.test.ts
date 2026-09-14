import { describe, expect, it } from 'vitest';
import { pushSubscriptionInputSchema } from './subscription-schema';

const valid = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'BPk-key-material', auth: 'auth-secret' },
  userAgent: 'Mozilla/5.0 (Linux; Android 14)',
};

describe('pushSubscriptionInputSchema (master_plan §2AY D)', () => {
  it('accepts a real subscription, with userAgent optional and trimmed', () => {
    const parsed = pushSubscriptionInputSchema.parse(valid);
    expect(parsed.endpoint).toBe(valid.endpoint);
    expect(parsed.keys.auth).toBe('auth-secret');

    const trimmed = pushSubscriptionInputSchema.parse({ ...valid, userAgent: '  Safari/17  ' });
    expect(trimmed.userAgent).toBe('Safari/17');

    expect(
      pushSubscriptionInputSchema.safeParse({ endpoint: valid.endpoint, keys: valid.keys }).success,
    ).toBe(true);
  });

  it('rejects a non-https endpoint', () => {
    expect(
      pushSubscriptionInputSchema.safeParse({ ...valid, endpoint: 'http://push.example.com/x' })
        .success,
    ).toBe(false);
    expect(pushSubscriptionInputSchema.safeParse({ ...valid, endpoint: 'not-a-url' }).success).toBe(
      false,
    );
  });

  it('rejects oversize fields', () => {
    const longEndpoint = `https://push.example.com/${'a'.repeat(2048)}`;
    expect(
      pushSubscriptionInputSchema.safeParse({ ...valid, endpoint: longEndpoint }).success,
    ).toBe(false);
    expect(
      pushSubscriptionInputSchema.safeParse({
        ...valid,
        keys: { p256dh: 'a'.repeat(513), auth: 'auth-secret' },
      }).success,
    ).toBe(false);
    expect(
      pushSubscriptionInputSchema.safeParse({ ...valid, userAgent: 'u'.repeat(513) }).success,
    ).toBe(false);
  });

  it('rejects empty key material', () => {
    expect(
      pushSubscriptionInputSchema.safeParse({ ...valid, keys: { p256dh: '', auth: 'x' } }).success,
    ).toBe(false);
  });
});
