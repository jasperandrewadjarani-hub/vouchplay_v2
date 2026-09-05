import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { SetPasswordForm } from '@/components/auth/set-password-form';

export const metadata: Metadata = { title: 'Set password' };

/**
 * Reset-link landing + change-password page (handover §7.5). The password-reset email links to
 * /auth/callback?next=/me/settings/password; the recovery token establishes a session, so this page
 * is guarded like any authenticated route.
 */
export default async function SetPasswordPage() {
  await requireUser('/me/settings/password');

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-1">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p className="text-foreground-muted text-sm">
          Choose a password for signing in with your email address.
        </p>
      </div>
      <SetPasswordForm />
    </div>
  );
}
