import type { Metadata } from 'next';
import { requireUser, getViewerContext } from '@/lib/auth';
import { getMfaStatus } from '@/lib/auth/mfa';
import { MfaManager } from '@/components/auth/mfa-manager';

export const metadata: Metadata = { title: 'Security' };

const REASONS: Record<string, string> = {
  enroll_required:
    'Your role requires two-factor authentication. Add an authenticator app to continue.',
  step_up_required: 'Please verify with your authenticator app to continue.',
};

/**
 * Account security - two-factor authentication (Admin MFA framework, handover §7/§30). Available to
 * everyone; required for staff before privileged surfaces (enforced by requireStaffMfa server-side).
 */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  await requireUser('/me/settings/security');
  const [{ isStaff }, status] = await Promise.all([getViewerContext(), getMfaStatus()]);
  const { reason } = await searchParams;
  const notice = reason ? REASONS[reason] : null;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-1">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">Security</h1>
        <p className="text-foreground-muted text-sm">
          Add two-factor authentication with an authenticator app (TOTP).
        </p>
      </div>

      {notice && (
        <p className="bg-warning/10 text-warning rounded-lg px-3 py-2 text-sm" role="alert">
          {notice}
        </p>
      )}

      {isStaff && !status.hasVerifiedTotp && (
        <p className="border-border bg-surface text-foreground-muted rounded-xl border p-3 text-sm">
          Your account holds a staff role. Two-factor authentication is required before using admin
          and moderation tools.
        </p>
      )}

      <MfaManager factors={status.factors} hasVerified={status.hasVerifiedTotp} />
    </div>
  );
}
