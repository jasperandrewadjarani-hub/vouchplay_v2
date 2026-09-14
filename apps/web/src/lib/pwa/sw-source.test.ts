import { describe, expect, it } from 'vitest';
import { buildServiceWorker } from './sw-source';

const VERSION = 'test-deploy-abc123';
const VAPID_KEY = 'BSomeFakeVapidPublicKeyForTestingPurposesOnly1234567890';

describe('buildServiceWorker - enabled', () => {
  const src = buildServiceWorker({ version: VERSION, vapidPublicKey: VAPID_KEY, enabled: true });

  it('bakes the version into the cache name', () => {
    expect(src).toContain(`'vp-' + ${JSON.stringify(VERSION)}`);
  });

  it('registers every required listener', () => {
    for (const type of [
      'install',
      'activate',
      'fetch',
      'push',
      'notificationclick',
      'pushsubscriptionchange',
    ]) {
      expect(src).toContain(`addEventListener('${type}'`);
    }
  });

  it('bakes the VAPID public key', () => {
    expect(src).toContain(JSON.stringify(VAPID_KEY));
  });

  it('never caches HTML in the navigate branch', () => {
    const start = src.indexOf("request.mode === 'navigate'");
    expect(start).toBeGreaterThan(-1);
    const nextBranch = src.indexOf("indexOf('/_next/static/')", start);
    expect(nextBranch).toBeGreaterThan(start);
    const navigateBranch = src.slice(start, nextBranch);
    expect(navigateBranch).not.toContain('cache.put');
    expect(navigateBranch).not.toContain('caches.put');
    // The navigate branch's only cache read is the /offline fallback.
    expect(navigateBranch).toContain("caches.match('/offline')");
  });

  it('is syntactically valid JavaScript (parses without executing)', () => {
    expect(() => new Function(src)).not.toThrow();
  });
});

describe('buildServiceWorker - disabled', () => {
  const src = buildServiceWorker({ version: VERSION, vapidPublicKey: VAPID_KEY, enabled: false });

  it('unregisters itself', () => {
    expect(src).toContain('self.registration.unregister()');
  });

  it('registers no push handler', () => {
    expect(src).not.toContain("addEventListener('push'");
    expect(src).not.toContain("addEventListener('notificationclick'");
    expect(src).not.toContain("addEventListener('pushsubscriptionchange'");
  });

  it('still clears every vp- cache on install and activate', () => {
    expect(src).toContain("addEventListener('install'");
    expect(src).toContain("addEventListener('activate'");
    expect(src.match(/k\.indexOf\('vp-'\) === 0/g)?.length).toBe(2);
  });

  it('is syntactically valid JavaScript (parses without executing)', () => {
    expect(() => new Function(src)).not.toThrow();
  });
});
