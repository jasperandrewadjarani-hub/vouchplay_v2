import { describe, it, expect } from 'vitest';
import { isAuthStaleError, buildErrorTelemetry } from './error-telemetry';

describe('isAuthStaleError', () => {
  it('flags expired-session shaped errors', () => {
    expect(isAuthStaleError({ message: 'JWT expired' })).toBe(true);
    expect(isAuthStaleError({ message: 'Auth session missing!' })).toBe(true);
    expect(isAuthStaleError({ name: 'AuthApiError', message: '401 Unauthorized' })).toBe(true);
  });

  it('does not flag ordinary render errors', () => {
    expect(isAuthStaleError({ message: 'Cannot read properties of undefined' })).toBe(false);
    expect(isAuthStaleError({ name: 'TypeError', message: 'x is not a function' })).toBe(false);
    expect(isAuthStaleError(null)).toBe(false);
  });
});

describe('buildErrorTelemetry', () => {
  it('excludes the error message and includes only allowlisted fields', () => {
    const body = buildErrorTelemetry({
      error: { name: 'Error', digest: 'abc123', message: 'user@example.com failed' },
      route: '/tournaments/jt-cup',
      visibility: 'visible',
      persistedRestore: true,
      deployVersion: 'a1b2c3d',
      scope: 'app',
    });
    expect(body).toEqual({
      route: '/tournaments/jt-cup',
      digest: 'abc123',
      name: 'Error',
      visibility: 'visible',
      persistedRestore: true,
      authStale: false,
      deployVersion: 'a1b2c3d',
      scope: 'app',
    });
    expect(JSON.stringify(body)).not.toContain('user@example.com');
  });

  it('marks auth-stale and clips long fields', () => {
    const body = buildErrorTelemetry({
      error: { name: 'AuthApiError', digest: 'd'.repeat(300), message: 'JWT expired' },
      route: '/'.padEnd(300, 'x'),
      visibility: '',
      persistedRestore: false,
      deployVersion: '',
      scope: 'global',
    });
    expect(body.authStale).toBe(true);
    expect(body.digest?.length).toBe(200);
    expect(body.route.length).toBe(200);
    expect(body.visibility).toBe('unknown');
    expect(body.deployVersion).toBe('unknown');
    expect(body.scope).toBe('global');
  });
});
