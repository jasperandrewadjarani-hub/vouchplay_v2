/**
 * Pure branch selection + copy for the global install banner (master_plan §2AZ). No DOM access - it
 * takes the already-detected PwaState flags and returns which variant to show (or null), so the whole
 * device decision is unit-testable the same way `push-state.ts` is. Priority mirrors `install-row.tsx`:
 * a real install prompt wins, then the in-app-browser escape (Android Chrome hand-off vs iOS copy),
 * then plain iOS Safari; everything else (desktop, unsupported, already installed) is null.
 */
export type InstallBranch = 'android' | 'android-inapp' | 'ios-inapp' | 'ios';

export interface InstallBranchInput {
  ready: boolean;
  standalone: boolean;
  canInstall: boolean;
  inAppBrowser: boolean;
  ios: boolean;
}

export function deriveInstallBranch(s: InstallBranchInput): InstallBranch | null {
  if (!s.ready || s.standalone) return null;
  if (s.canInstall) return 'android';
  // In-app browser BEFORE iOS: an iPhone inside Facebook / Messenger has no Share -> Add to Home
  // Screen, so the Safari steps would dead-end there (same ordering reason as install-row.tsx).
  if (s.inAppBrowser) return s.ios ? 'ios-inapp' : 'android-inapp';
  if (s.ios) return 'ios';
  return null;
}

export interface InstallBranchCopy {
  title: string;
  subtitle: string;
  action: string;
}

/** One short line each, no jargon - readable for any age group (master_plan §2AZ UI/UX). */
export function installBranchCopy(branch: InstallBranch): InstallBranchCopy {
  switch (branch) {
    case 'android':
      return {
        title: 'Get the VouchPlay app',
        subtitle: 'Add it to your phone in one tap.',
        action: 'Install',
      };
    case 'android-inapp':
      return {
        title: 'Get the VouchPlay app',
        subtitle: 'Open in Chrome to add it to your phone.',
        action: 'Open in Chrome',
      };
    case 'ios-inapp':
      return {
        title: 'Get the VouchPlay app',
        subtitle: 'Open in Safari to add it to your phone.',
        action: 'Copy link',
      };
    case 'ios':
      return {
        title: 'Get the VouchPlay app',
        subtitle: 'Add it to your Home Screen.',
        action: 'Show me how',
      };
  }
}
