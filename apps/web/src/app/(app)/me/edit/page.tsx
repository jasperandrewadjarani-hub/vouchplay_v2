import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldCheck, ChevronRight, Clock } from 'lucide-react';
import { getMyProfile, requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { OnboardingForm } from '@/components/auth/onboarding-form';

export const metadata: Metadata = { title: 'Edit profile' };

/** The viewer's own latest identity-verification status, for the edit-profile CTA. Owner-reads-own
 *  under RLS; fails open to 'none' (so the card always offers the action) if the read errors. */
async function myIdentityStatus(userId: string): Promise<string> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('identity_verifications')
      .select('status')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as { status: string } | null)?.status ?? 'none';
  } catch {
    return 'none';
  }
}

export default async function EditProfilePage() {
  const user = await requireUser('/me/edit');
  const profile = await getMyProfile();
  if (!profile?.onboarded_at) redirect('/onboarding');
  const idStatus = await myIdentityStatus(user.id);

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
      {/* Identity verification is its own guided flow (it needs a photo + an ID image and staff
          review), so the edit form links to it prominently rather than embedding the upload here.
          Non-technical players expect to find "verify my account" where they edit their details, so a
          clear, status-aware card sits right at the top of this page (master_plan §2AG Phase C). */}
      <IdentityCard status={idStatus} />

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

/** Status-aware "Verify your identity" card for the edit-profile page. Approved shows a calm confirmed
 *  state; pending/reviewing shows "under review"; anything else is a clear call to action. */
function IdentityCard({ status }: { status: string }) {
  if (status === 'approved') {
    return (
      <div className="border-success/40 bg-success/10 flex items-center gap-3 rounded-2xl border p-4">
        <ShieldCheck className="text-success shrink-0" size={22} aria-hidden />
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold">Your identity is verified</p>
          <p className="text-foreground-muted text-xs">
            You have the ID Verified badge on your profile.
          </p>
        </div>
      </div>
    );
  }
  if (status === 'pending' || status === 'reviewing') {
    return (
      <div className="border-warning/40 bg-warning/10 flex items-center gap-3 rounded-2xl border p-4">
        <Clock className="text-warning shrink-0" size={22} aria-hidden />
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold">Your ID is under review</p>
          <p className="text-foreground-muted text-xs">
            We&rsquo;ll add the ID Verified badge once our team approves it.
          </p>
        </div>
      </div>
    );
  }
  const cta = status === 'rejected' || status === 'resubmit_required' ? 'Try again' : 'Verify now';
  return (
    <Link
      href="/me/settings/identity"
      className="border-primary/30 bg-primary/5 hover:bg-primary/10 flex min-h-11 items-center gap-3 rounded-2xl border p-4 transition-colors"
    >
      <span className="vp-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white">
        <ShieldCheck size={20} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground block text-sm font-semibold">Verify your identity</span>
        <span className="text-foreground-muted block text-xs">
          Add a photo ID to earn the ID Verified badge and a trusted profile.
        </span>
      </span>
      <span className="text-primary flex shrink-0 items-center gap-1 text-sm font-semibold">
        {cta}
        <ChevronRight size={16} aria-hidden />
      </span>
    </Link>
  );
}
