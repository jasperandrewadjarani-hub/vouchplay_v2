/**
 * Pure derivation of the "Notifications on this device" row state (master_plan §2AY Decision E).
 * Kept dependency-free (no `usePwa`, no DOM) so it is trivially unit-testable and shared by every
 * surface that renders the push row (ME card, Notification preferences).
 *
 * Precedence matters: iOS Safari reports no `PushManager` until the site is installed to the home
 * screen, so it would otherwise look identical to "unsupported browser" - `needs_install` has to be
 * checked before `unsupported` so the copy tells an iPhone user to install rather than giving up on
 * them.
 */
export type PushRowState =
  | 'loading'
  | 'unsupported'
  | 'unavailable'
  | 'off_by_admin'
  | 'needs_install'
  | 'blocked'
  | 'off'
  | 'on';

export interface PushRowInput {
  /** `usePwa().ready` - false until post-mount detection finishes. */
  ready: boolean;
  /** `usePwa().pushSupported`. */
  pushSupported: boolean;
  /** `VAPID_PUBLIC_KEY.length > 0`. */
  configured: boolean;
  /** `push_notifications_enabled` system setting. */
  adminEnabled: boolean;
  /** `usePwa().ios`. */
  ios: boolean;
  /** `usePwa().standalone`. */
  standalone: boolean;
  /** `usePwa().permission`. */
  permission: NotificationPermission | 'unsupported';
  /** Whether this device currently has a live push subscription. */
  subscribed: boolean;
}

export function derivePushRowState(i: PushRowInput): PushRowState {
  if (!i.ready) return 'loading';
  // iOS Safari (not yet installed) reports no PushManager - that is a "go install it" moment, not a
  // dead end, so it must win over the generic unsupported branch below.
  if (i.ios && !i.standalone) return 'needs_install';
  if (!i.pushSupported) return 'unsupported';
  if (!i.configured) return 'unavailable';
  if (!i.adminEnabled) return 'off_by_admin';
  if (i.permission === 'denied') return 'blocked';
  if (i.subscribed) return 'on';
  return 'off';
}

export interface PushRowCopy {
  description: string;
  disabled: boolean;
  /** True when the row should not be rendered at all (e.g. unsupported desktop browser). */
  hidden: boolean;
}

const COPY: Record<
  Exclude<PushRowState, 'unsupported'>,
  { description: string; disabled: boolean }
> = {
  loading: { description: 'Checking this device…', disabled: true },
  unavailable: { description: 'Coming soon', disabled: true },
  off_by_admin: { description: 'Turned off for now', disabled: true },
  needs_install: { description: 'Install the app first to turn this on', disabled: true },
  blocked: {
    description: 'Blocked - allow notifications in your browser settings',
    disabled: true,
  },
  off: { description: 'Vouches, partner matches and tournament updates', disabled: false },
  on: { description: 'On for this device', disabled: false },
};

export function pushRowCopy(state: PushRowState): PushRowCopy {
  if (state === 'unsupported') return { description: '', disabled: true, hidden: true };
  return { ...COPY[state], hidden: false };
}
