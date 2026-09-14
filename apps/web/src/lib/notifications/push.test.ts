import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Web Push channel behaviour (master_plan §2AY D). The three collaborators are mocked: `web-push`
 * (no network), `@/lib/settings` (the Admin kill switch) and `@/lib/supabase/service` (the service
 * client). The service-client mock is a tiny hand-rolled query builder that records what each chain
 * asked for, so the tests can assert on the update that retires a dead endpoint.
 */
const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
const loadSettingFlag = vi.fn();

interface UpdateCall {
  table: string;
  values: Record<string, unknown>;
  id: string | null;
}
const updateCalls: UpdateCall[] = [];
let subscriptionRows: {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}[] = [];

vi.mock('web-push', () => ({
  setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
  sendNotification: (...args: unknown[]) => sendNotification(...args),
}));

vi.mock('@/lib/settings', () => ({
  loadSettingFlag: (...args: unknown[]) => loadSettingFlag(...args),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from(table: string) {
      const chain = {
        // select(...).in(...).is(...).limit(...) -> the active-subscription read
        select() {
          return chain;
        },
        in() {
          return chain;
        },
        is() {
          return chain;
        },
        eq(_column: string, value: string) {
          chain._id = value;
          return chain;
        },
        limit() {
          return Promise.resolve({ data: subscriptionRows, error: null });
        },
        update(values: Record<string, unknown>) {
          chain._update = values;
          return chain;
        },
        then(resolve: (value: { data: null; error: null }) => unknown) {
          if (chain._update) {
            updateCalls.push({ table, values: chain._update, id: chain._id });
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
        _update: null as Record<string, unknown> | null,
        _id: null as string | null,
      };
      return chain;
    },
  }),
}));

const ROW = {
  recipient_id: 'user-1',
  title: 'You were vouched',
  body: 'Tane vouched for you.',
  link: '/me/notifications',
  type: 'vouch.received',
};

async function importPush() {
  return import('./push');
}

beforeEach(() => {
  vi.resetModules();
  sendNotification.mockReset();
  setVapidDetails.mockReset();
  loadSettingFlag.mockReset();
  updateCalls.length = 0;
  loadSettingFlag.mockResolvedValue(true);
  subscriptionRows = [
    {
      id: 'sub-1',
      user_id: 'user-1',
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    },
  ];
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'public-key';
  process.env.VAPID_PRIVATE_KEY = 'private-key';
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
});

describe('sendPushForRows (master_plan §2AY D)', () => {
  it('sends nothing when the Admin kill switch is off', async () => {
    loadSettingFlag.mockResolvedValue(false);
    const { sendPushForRows, pushChannelReady } = await importPush();

    expect(await pushChannelReady()).toBe(false);
    expect(await sendPushForRows([ROW])).toEqual({ attempted: 0, delivered: 0, disabled: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('sends nothing when the VAPID env is missing (inert, never throws)', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const { sendPushForRows, pushChannelReady } = await importPush();

    expect(await pushChannelReady()).toBe(false);
    expect(await sendPushForRows([ROW])).toEqual({ attempted: 0, delivered: 0, disabled: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('counts a successful send as delivered and ships the agreed payload', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const { sendPushForRows } = await importPush();

    expect(await sendPushForRows([ROW])).toEqual({ attempted: 1, delivered: 1, disabled: 0 });
    expect(setVapidDetails).toHaveBeenCalledWith(
      'mailto:vouchplay@gmail.com',
      'public-key',
      'private-key',
    );

    const [subscription, payload, options] = sendNotification.mock.calls[0] as [
      { endpoint: string; keys: { p256dh: string; auth: string } },
      string,
      { TTL: number; urgency: string },
    ];
    expect(subscription).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    });
    expect(JSON.parse(payload)).toEqual({
      title: 'You were vouched',
      body: 'Tane vouched for you.',
      url: '/me/notifications',
      type: 'vouch.received',
    });
    expect(options).toEqual({ TTL: 86400, urgency: 'normal' });
    expect(updateCalls).toHaveLength(0);
  });

  it('retires the row on a 410 Gone and counts it as disabled', async () => {
    sendNotification.mockRejectedValue(
      Object.assign(new Error('Gone'), { statusCode: 410, endpoint: 'x' }),
    );
    const { sendPushForRows } = await importPush();

    expect(await sendPushForRows([ROW])).toEqual({ attempted: 1, delivered: 0, disabled: 1 });
    expect(updateCalls).toHaveLength(1);
    const retired = updateCalls[0];
    expect(retired?.table).toBe('push_subscriptions');
    expect(retired?.id).toBe('sub-1');
    expect(typeof retired?.values.disabled_at).toBe('string');
  });

  it('swallows a transient push-service error without disabling the device', async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error('Too many'), { statusCode: 429 }));
    const { sendPushForRows } = await importPush();

    expect(await sendPushForRows([ROW])).toEqual({ attempted: 1, delivered: 0, disabled: 0 });
    expect(updateCalls).toHaveLength(0);
  });

  it('does nothing when the recipient has no active device', async () => {
    subscriptionRows = [];
    const { sendPushForRows } = await importPush();

    expect(await sendPushForRows([ROW])).toEqual({ attempted: 0, delivered: 0, disabled: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe('schedulePush (master_plan §2AY D)', () => {
  it('falls back to an awaited send outside a request scope, and never throws', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const { schedulePush } = await importPush();

    await expect(schedulePush([ROW])).resolves.toBeUndefined();
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});
