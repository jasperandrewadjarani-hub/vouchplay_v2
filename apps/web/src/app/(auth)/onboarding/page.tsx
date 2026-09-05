import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser, getMyProfile } from '@/lib/auth';
import { OnboardingForm } from '@/components/auth/onboarding-form';

export const metadata: Metadata = { title: 'Complete your profile' };

export default async function OnboardingPage() {
  const user = await requireUser('/onboarding');
  const profile = await getMyProfile();

  // Already onboarded → nothing to do here.
  if (profile?.onboarded_at) redirect('/');

  // Prefill first name from the OAuth provider display name when available.
  const providerName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    '';
  const firstName = providerName.trim().split(/\s+/)[0] ?? '';

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">
          Complete your profile
        </h1>
        <p className="text-foreground-muted text-sm">
          A few details so players can find and vouch for you. You can edit these anytime.
        </p>
      </div>
      <OnboardingForm defaultFirstName={firstName} />
    </div>
  );
}
