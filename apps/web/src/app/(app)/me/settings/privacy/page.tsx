import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { PrivacyForm } from '@/components/leaderboards/action-forms';

export const metadata: Metadata = { title: 'Privacy settings' };
export default async function PrivacySettingsPage() {
  const user = await requireUser('/me/settings/privacy');
  const { data } = await createServiceClient()
    .from('profiles')
    .select('profile_visibility')
    .eq('id', user.id)
    .maybeSingle();
  const visibility =
    (data as { profile_visibility?: Record<string, unknown> } | null)?.profile_visibility ?? {};
  return (
    <div className="mx-auto max-w-md space-y-5">
      <header>
        <h1 className="text-foreground text-xl font-semibold">Privacy settings</h1>
        <p className="text-foreground-muted mt-1 text-sm">
          Control public ranking visibility without losing your private progress view.
        </p>
      </header>
      <PrivacyForm hidden={visibility.leaderboards === 'hidden'} />
    </div>
  );
}
