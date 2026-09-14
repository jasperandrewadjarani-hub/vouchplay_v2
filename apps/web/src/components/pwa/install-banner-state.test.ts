import { describe, it, expect } from 'vitest';
import { deriveInstallBranch, installBranchCopy, type InstallBranch } from './install-banner-state';

const base = {
  ready: true,
  standalone: false,
  canInstall: false,
  inAppBrowser: false,
  ios: false,
};

describe('deriveInstallBranch', () => {
  it('is null until detection has settled', () => {
    expect(deriveInstallBranch({ ...base, ready: false, canInstall: true })).toBeNull();
  });

  it('is null once already installed / standalone', () => {
    expect(deriveInstallBranch({ ...base, standalone: true, canInstall: true })).toBeNull();
  });

  it('prefers a real install prompt (android)', () => {
    expect(deriveInstallBranch({ ...base, canInstall: true })).toBe('android');
  });

  it('an install prompt wins even inside an in-app browser', () => {
    expect(deriveInstallBranch({ ...base, canInstall: true, inAppBrowser: true })).toBe('android');
  });

  it('android in-app browser -> Chrome hand-off', () => {
    expect(deriveInstallBranch({ ...base, inAppBrowser: true })).toBe('android-inapp');
  });

  it('iOS in-app browser -> copy link (the Chrome intent is useless on iOS)', () => {
    expect(deriveInstallBranch({ ...base, inAppBrowser: true, ios: true })).toBe('ios-inapp');
  });

  it('plain iOS Safari -> show me how', () => {
    expect(deriveInstallBranch({ ...base, ios: true })).toBe('ios');
  });

  it('desktop / unsupported -> null', () => {
    expect(deriveInstallBranch(base)).toBeNull();
  });
});

describe('installBranchCopy', () => {
  it('every branch has a non-empty title, subtitle and action', () => {
    for (const b of ['android', 'android-inapp', 'ios-inapp', 'ios'] as InstallBranch[]) {
      const c = installBranchCopy(b);
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.subtitle.length).toBeGreaterThan(0);
      expect(c.action.length).toBeGreaterThan(0);
    }
  });
});
