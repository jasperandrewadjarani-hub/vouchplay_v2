import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getViewerContext } from '@/lib/auth';
import { getMfaStatus } from '@/lib/auth/mfa';

/**
 * Staff authorization for moderation surfaces (handover §4.3, §30, §37).
 *
 * Two layers, both enforced server-side:
 *  - Route guard (`requireStaffPage`) - redirects non-staff away and steps staff up through MFA
 *    (reuses the Admin MFA framework: verified TOTP + an aal2 session).
 *  - Action guard (`assertStaffActor`) - defense in depth inside every mutating server action, so a
 *    forged request that skips the page never reaches a privileged write.
 */

const STAFF_ROLE_PRIORITY = ['super_admin', 'admin', 'moderator', 'support'] as const;

/** The caller's roles (own rows are RLS-readable). Returns [] when anonymous/unavailable. */
async function myRoles(): Promise<string[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('status', 'active');
    return (data ?? []).map((r) => (r as { role: string }).role);
  } catch {
    return [];
  }
}

/** The highest-priority staff role a user holds, for audit `actor_role`. Null if not staff. */
export function highestStaffRole(roles: string[]): string | null {
  for (const r of STAFF_ROLE_PRIORITY) if (roles.includes(r)) return r;
  return null;
}

export interface StaffActor {
  viewerId: string;
  role: string;
}

/**
 * Action-layer guard. Returns the actor when the caller is authenticated staff with an aal2 (MFA)
 * session, else null - the caller returns a safe error. Anonymous voucher identity, account
 * actions, and content actions are all gated on this.
 */
export async function assertStaffActor(): Promise<StaffActor | null> {
  const roles = await myRoles();
  const role = highestStaffRole(roles);
  if (!role) return null;
  const mfa = await getMfaStatus();
  if (!mfa.aal2) return null; // require a stepped-up session for privileged writes
  const { viewerId } = await getViewerContext();
  if (!viewerId) return null;
  return { viewerId, role };
}

/**
 * Action-layer guard requiring ADMIN (admin/super_admin) with an aal2 session - for privileged ops
 * like approving role applications (§4.3: only Admin/Super Admin approve roles). Returns null otherwise.
 */
export async function assertAdminActor(): Promise<StaffActor | null> {
  const roles = await myRoles();
  if (!roles.includes('admin') && !roles.includes('super_admin')) return null;
  const mfa = await getMfaStatus();
  if (!mfa.aal2) return null;
  const { viewerId } = await getViewerContext();
  if (!viewerId) return null;
  return { viewerId, role: highestStaffRole(roles) ?? 'admin' };
}

/**
 * Page-layer guard for the /staff area. Anonymous → login; signed-in non-staff → home; staff without
 * a verified factor or an aal2 session → the security page to enroll / step up (reusing
 * requireStaffMfa's redirects).
 */
export async function requireStaffPage(returnTo: string): Promise<StaffActor> {
  const { viewerId } = await getViewerContext();
  if (!viewerId) redirect(`/login?next=${encodeURIComponent(returnTo)}`);

  const roles = await myRoles();
  const role = highestStaffRole(roles);
  if (!role) redirect('/'); // not staff - no moderation access

  const mfa = await getMfaStatus();
  const suffix = `next=${encodeURIComponent(returnTo)}`;
  if (!mfa.hasVerifiedTotp) redirect(`/me/settings/security?reason=enroll_required&${suffix}`);
  if (!mfa.aal2) redirect(`/me/settings/security?reason=step_up_required&${suffix}`);

  return { viewerId: viewerId as string, role };
}

/** Lightweight check for conditional nav (is the current viewer staff at all?). */
export async function viewerIsStaff(): Promise<boolean> {
  const roles = await myRoles();
  return highestStaffRole(roles) !== null;
}
