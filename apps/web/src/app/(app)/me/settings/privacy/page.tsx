import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { parseVisibility } from '@vouchplay/config';
import { PrivacyForm } from '@/components/leaderboards/action-forms';
import { RatingsPrivacyCard } from '@/components/me/ratings-privacy-card';

export const metadata: Metadata = { title: 'Privacy settings' };
export default async function PrivacySettingsPage() {
  const user = await requireUser('/me/settings/privacy');
  const { data } = await createServiceClient()
    .from('profiles')
    .select('profile_visibility')
    .eq('id', user.id)
    .maybeSingle();
  const rawVisibility =
    (data as { profile_visibility?: Record<string, unknown> } | null)?.profile_visibility ?? {};
  const visibility = parseVisibility(rawVisibility);
  return (
    <div className="mx-auto max-w-md space-y-5">
      <header>
        <h1 className="text-foreground text-xl font-semibold">Privacy settings</h1>
        <p className="text-foreground-muted mt-1 text-sm">
          Control public ranking visibility without losing your private progress view.
        </p>
      </header>
      {/* master_plan §2AW: same card as ME, directly above the leaderboard visibility form - the two
          controls sit together since both are "who sees what about me". */}
      <RatingsPrivacyCard
        communityHidden={visibility.community_rating === 'hidden'}
        selfHidden={visibility.self_rating === 'hidden'}
      />
      <PrivacyForm hidden={rawVisibility.leaderboards === 'hidden'} />
    </div>
  );
}
