import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getViewerContext } from '@/lib/auth';

/**
 * Admin MFA framework (handover §7, §30 Admin Control Center - admins must use MFA).
 *
 * V1 policy: MFA is available to everyone and REQUIRED for staff (moderator/support/admin/
 * super_admin) before they use privileged surfaces. Enrollment + step-up verification happen
 * client-side via the Supabase browser client (see components/auth/mfa-manager.tsx); this module is
 * the server side - read current status and guard staff routes.
 *
 * Supabase assurance levels: `aal1` = password/OTP session; `aal2` = a verified MFA factor was used
 * this session. A staff member with a verified TOTP factor still needs an aal2 step-up each session
 * to reach privileged actions.
 */

export interface MfaStatus {
  hasVerifiedTotp: boolean;
  currentLevel: string | null;
  nextLevel: string | null;
  aal2: boolean;
  factors: { id: string; friendlyName: string | null; status: string }[];
}

const EMPTY: MfaStatus = {
  hasVerifiedTotp: false,
  currentLevel: null,
  nextLevel: null,
  aal2: false,
  factors: [],
};

/** Current viewer's MFA status. Never throws - returns a safe empty status if unavailable. */
export async function getMfaStatus(): Promise<MfaStatus> {
  try {
    const supabase = await createClient();
    const [{ data: aal }, { data: factorsData }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    const totp = factorsData?.totp ?? [];
    return {
      hasVerifiedTotp: totp.some((f) => f.status === 'verified'),
      currentLevel: aal?.currentLevel ?? null,
      nextLevel: aal?.nextLevel ?? null,
      aal2: aal?.currentLevel === 'aal2',
      factors: totp.map((f) => ({
        id: f.id,
        friendlyName: f.friendly_name ?? null,
        status: f.status,
      })),
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Guard for staff/admin routes (wire into the Admin Control Center when it lands, Phase 30+).
 * Non-staff are unaffected in V1. A staff member with no verified factor is sent to enroll; one who
 * has a factor but only an aal1 session is sent to step up. Anonymous users are left to the route's
 * own auth guard.
 */
export async function requireStaffMfa(returnTo: string): Promise<void> {
  const { viewerId, isStaff } = await getViewerContext();
  if (!viewerId || !isStaff) return;

  const status = await getMfaStatus();
  const suffix = `next=${encodeURIComponent(returnTo)}`;
  if (!status.hasVerifiedTotp) redirect(`/me/settings/security?reason=enroll_required&${suffix}`);
  if (!status.aal2) redirect(`/me/settings/security?reason=step_up_required&${suffix}`);
}
