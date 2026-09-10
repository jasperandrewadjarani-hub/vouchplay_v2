import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMyProfile, requireUser } from '@/lib/auth';
import { OnboardingForm } from '@/components/auth/onboarding-form';

export const metadata: Metadata = { title: 'Edit profile' };

export default async function EditProfilePage() {
  await requireUser('/me/edit');
  const profile = await getMyProfile();
  if (!profile?.onboarded_at) redirect('/onboarding');

  return (
    <section className="mx-auto max-w-md space-y-6">
      <div className="space-y-1">
        <Link href="/me" className="text-foreground-muted hover:text-foreground text-sm">
          ← Me
        </Link>
        <h1 className="text-foreground pt-2 text-2xl font-semibold tracking-tight">Edit profile</h1>
        <p className="text-foreground-muted text-sm">
          Keep your player details accurate so people can find and vouch for you.
        </p>
      </div>
      <div className="border-border bg-surface rounded-2xl border p-5">
        <OnboardingForm
          mode="edit"
          initial={{
            firstName: profile.first_name ?? '',
            lastName: profile.last_name ?? '',
            nickname: profile.nickname ?? '',
            sex: profile.sex ?? '',
            selfRatedSkill: profile.self_rated_skill,
            city: profile.city ?? '',
            facebookUrl: profile.facebook_url ?? '',
            bio: profile.bio ?? '',
            lookingForPartner: profile.looking_for_partner ?? false,
            openForSponsorship: profile.open_for_sponsorship ?? false,
          }}
        />
      </div>
    </section>
  );
}
