import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser, getMyProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { OnboardingForm } from '@/components/auth/onboarding-form';

export const metadata: Metadata = { title: 'Complete your profile' };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const user = await requireUser(
    next ? `/onboarding?next=${encodeURIComponent(next)}` : '/onboarding',
  );
  const profile = await getMyProfile();

  // Already onboarded → nothing to do here.
  if (profile?.onboarded_at) redirect(next && next.startsWith('/') ? next : '/');

  // Prefill first name from the OAuth provider display name when the profile itself has none yet
  // (a guest's shadow account already has one - see below).
  const providerName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    '';
  const providerFirstName = providerName.trim().split(/\s+/)[0] ?? '';

  // Guest recovery (master_plan §2AU Decision E): a guest's shadow account already has first/last
  // name, sex, birthday and self-rated skill from Step 0, so signing back in and landing here should
  // show everything already on file - only city is actually missing. `date_of_birth` isn't part of
  // `getMyProfile`'s shared select (most callers don't need it), so it's read separately here rather
  // than widening that select for everyone.
  let dateOfBirth: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('profiles')
      .select('date_of_birth')
      .eq('id', user.id)
      .maybeSingle();
    dateOfBirth = (data as { date_of_birth: string | null } | null)?.date_of_birth ?? null;
  } catch {
    // Best effort only - a miss just renders the field blank, same as any first-time signup.
  }

  const initial = {
    ...((profile?.first_name ?? providerFirstName)
      ? { firstName: profile?.first_name ?? providerFirstName }
      : {}),
    ...(profile?.last_name ? { lastName: profile.last_name } : {}),
    ...(profile?.nickname ? { nickname: profile.nickname } : {}),
    ...(profile?.sex ? { sex: profile.sex } : {}),
    ...(dateOfBirth ? { dateOfBirth } : {}),
    ...(profile?.self_rated_skill != null ? { selfRatedSkill: profile.self_rated_skill } : {}),
  };

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
      <OnboardingForm initial={initial} next={next} />
    </div>
  );
}
