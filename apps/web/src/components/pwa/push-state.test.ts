import { describe, expect, it } from 'vitest';
import { derivePushRowState, pushRowCopy, type PushRowInput } from './push-state';

const base: PushRowInput = {
  ready: true,
  pushSupported: true,
  configured: true,
  adminEnabled: true,
  ios: false,
  standalone: false,
  permission: 'default',
  subscribed: false,
};

describe('derivePushRowState', () => {
  it('is loading before post-mount detection finishes', () => {
    expect(derivePushRowState({ ...base, ready: false })).toBe('loading');
  });

  it('prefers needs_install over unsupported on iOS Safari (no PushManager pre-install)', () => {
    expect(
      derivePushRowState({ ...base, ios: true, standalone: false, pushSupported: false }),
    ).toBe('needs_install');
  });

  it('is on for installed iOS (standalone) even though ios is true', () => {
    expect(derivePushRowState({ ...base, ios: true, standalone: true, pushSupported: true })).toBe(
      'off',
    );
  });

  it('is unsupported when the browser has no PushManager and is not iOS', () => {
    expect(derivePushRowState({ ...base, pushSupported: false })).toBe('unsupported');
  });

  it('is unavailable when VAPID is not configured', () => {
    expect(derivePushRowState({ ...base, configured: false })).toBe('unavailable');
  });

  it('is off_by_admin when the kill switch is off', () => {
    expect(derivePushRowState({ ...base, adminEnabled: false })).toBe('off_by_admin');
  });

  it('is blocked when permission is denied', () => {
    expect(derivePushRowState({ ...base, permission: 'denied' })).toBe('blocked');
  });

  it('is on when subscribed', () => {
    expect(derivePushRowState({ ...base, subscribed: true, permission: 'granted' })).toBe('on');
  });

  it('is off otherwise', () => {
    expect(derivePushRowState(base)).toBe('off');
  });

  it('precedence: configured check runs before admin check', () => {
    expect(derivePushRowState({ ...base, configured: false, adminEnabled: false })).toBe(
      'unavailable',
    );
  });

  it('precedence: admin check runs before blocked', () => {
    expect(derivePushRowState({ ...base, adminEnabled: false, permission: 'denied' })).toBe(
      'off_by_admin',
    );
  });

  it('precedence: blocked runs before subscribed/off', () => {
    expect(derivePushRowState({ ...base, permission: 'denied', subscribed: true })).toBe('blocked');
  });
});

describe('pushRowCopy', () => {
  it('loading', () => {
    expect(pushRowCopy('loading')).toEqual({
      description: 'Checking this device…',
      disabled: true,
      hidden: false,
    });
  });

  it('unsupported is hidden', () => {
    expect(pushRowCopy('unsupported')).toEqual({ description: '', disabled: true, hidden: true });
  });

  it('unavailable', () => {
    expect(pushRowCopy('unavailable')).toEqual({
      description: 'Coming soon',
      disabled: true,
      hidden: false,
    });
  });

  it('off_by_admin', () => {
    expect(pushRowCopy('off_by_admin')).toEqual({
      description: 'Turned off for now',
      disabled: true,
      hidden: false,
    });
  });

  it('needs_install', () => {
    expect(pushRowCopy('needs_install')).toEqual({
      description: 'Install the app first to turn this on',
      disabled: true,
      hidden: false,
    });
  });

  it('blocked', () => {
    expect(pushRowCopy('blocked')).toEqual({
      description: 'Blocked - allow notifications in your browser settings',
      disabled: true,
      hidden: false,
    });
  });

  it('off', () => {
    expect(pushRowCopy('off')).toEqual({
      description: 'Vouches, partner matches and tournament updates',
      disabled: false,
      hidden: false,
    });
  });

  it('on', () => {
    expect(pushRowCopy('on')).toEqual({
      description: 'On for this device',
      disabled: false,
      hidden: false,
    });
  });
});
