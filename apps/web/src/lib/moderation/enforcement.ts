import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Server-side account-status & block enforcement (handover §11, §14.3, §47). Every interaction
 * initiation point (vouch, vouch request, and — Phase 5 — partner/recruit/sponsor) runs these before
 * writing, so restricted/suspended/banned users and blocked pairs are stopped regardless of what the
 * client sent. Banned/suspended/deactivated profiles are already invisible in the public directory
 * (queries select account_status='active'); these guards cover the authenticated action paths.
 */

interface ActorStatus {
  account_status: string;
  suspended_until: string | null;
  vouching_restricted_until: string | null;
}

function future(ts: string | null): boolean {
  return !!ts && new Date(ts).getTime() > Date.now();
}

/**
 * Can this user initiate community interactions right now? Blocks non-active accounts and expired-
 * check suspensions. Returns null when allowed, or a user-safe message when not.
 */
export async function checkActorCanInteract(userId: string): Promise<string | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('profiles')
    .select('account_status, suspended_until, vouching_restricted_until')
    .eq('id', userId)
    .maybeSingle();
  const me = data as ActorStatus | null;
  if (!me) return 'Your account is unavailable right now.';
  if (me.account_status === 'banned') return 'Your account is banned and cannot take this action.';
  if (me.account_status === 'suspended' || future(me.suspended_until)) {
    return 'Your account is suspended and cannot take this action.';
  }
  if (me.account_status === 'deactivated') return 'Your account is deactivated.';
  return null;
}

/**
 * Additional gate specific to vouching (handover §11.3 "restrict vouching", §47). A restricted
 * account or an unexpired vouching restriction cannot create/update vouches or vouch requests.
 * Returns null when allowed, else a user-safe message.
 */
export async function checkActorCanVouch(userId: string): Promise<string | null> {
  const base = await checkActorCanInteract(userId);
  if (base) return base;
  const svc = createServiceClient();
  const { data } = await svc
    .from('profiles')
    .select('account_status, vouching_restricted_until')
    .eq('id', userId)
    .maybeSingle();
  const me = data as { account_status: string; vouching_restricted_until: string | null } | null;
  if (!me) return 'Your account is unavailable right now.';
  if (me.account_status === 'restricted') {
    return 'Your account is restricted from vouching. Contact support if you think this is a mistake.';
  }
  if (future(me.vouching_restricted_until)) {
    return 'Your vouching is temporarily restricted. Contact support if you think this is a mistake.';
  }
  return null;
}

/** True when `viewerId` has blocked `targetId` (drives the Block/Unblock toggle on a profile). */
export async function hasViewerBlocked(viewerId: string, targetId: string): Promise<boolean> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('blocks')
    .select('blocker_id')
    .eq('blocker_id', viewerId)
    .eq('blocked_id', targetId)
    .maybeSingle();
  return !!data;
}

/** The set of user ids the viewer has blocked, with block timestamps (for /me/blocked). */
export async function listBlockedByViewer(
  viewerId: string,
): Promise<{ blocked_id: string; created_at: string }[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', viewerId)
    .order('created_at', { ascending: false });
  return (data ?? []) as { blocked_id: string; created_at: string }[];
}

/** True when either user has blocked the other (handover §14.3). */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('blocks')
    .select('blocker_id')
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`);
  return (data ?? []).length > 0;
}
