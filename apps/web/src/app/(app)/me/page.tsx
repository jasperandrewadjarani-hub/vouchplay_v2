import type { Metadata } from 'next';
import Link from 'next/link';
import { getOptionalUser, getMyProfile } from '@/lib/auth';
import { viewerIsStaff, viewerIsAdmin } from '@/lib/moderation/staff';
import { createServiceClient } from '@/lib/supabase/service';
import { parseVisibility } from '@vouchplay/config';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { OrganizerApply } from '@/components/roles/organizer-apply';
import { RatingsPrivacyCard } from '@/components/me/ratings-privacy-card';
import { AppInstallCard } from '@/components/me/app-install-card';
import { ButtonLink } from '@/components/ui/button';
import { LinkSpinner } from '@/components/ui/link-spinner';
import { loadSettingFlag } from '@/lib/settings';

export const metadata: Metadata = { title: 'Me' };

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getOptionalUser();
  const sp = await searchParams;

  if (!user) {
    return (
      <section className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-foreground text-xl font-semibold tracking-tight">Your account</h1>
        <p className="text-foreground-muted text-sm">
          Sign in to build your profile, vouch for players, and join clubs and tournaments.
        </p>
        <div className="flex justify-center gap-2">
          <ButtonLink href="/login">Sign in</ButtonLink>
          <ButtonLink href="/signup" variant="secondary">
            Create account
          </ButtonLink>
        </div>
      </section>
    );
  }

  const profile = await getMyProfile();
  const [isStaff, isAdmin, installPromptEnabled, pushEnabled] = await Promise.all([
    viewerIsStaff(),
    viewerIsAdmin(),
    loadSettingFlag('pwa_install_prompt_enabled', true),
    loadSettingFlag('push_notifications_enabled', true),
  ]);
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || '-';

  // Organizer role state (§17.1) for the apply-as-organizer card.
  const svc = createServiceClient();
  const [{ data: orgRole }, { data: orgApp }, { data: visibilityRow }] = await Promise.all([
    svc
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('role', 'organizer')
      .eq('status', 'active')
      .maybeSingle(),
    svc
      .from('role_applications')
      .select('id')
      .eq('user_id', user.id)
      .eq('role_requested', 'organizer')
      .in('status', ['pending', 'reviewing'])
      .maybeSingle(),
    // master_plan §2AW: read directly rather than widen the shared `getMyProfile` select - only this
    // card and the Privacy settings page need the raw visibility jsonb.
    svc.from('profiles').select('profile_visibility').eq('id', user.id).maybeSingle(),
  ]);
  const isOrganizer = !!orgRole;
  const hasPendingOrgApp = !!orgApp;
  const ratingsVisibility = parseVisibility(
    (visibilityRow as { profile_visibility?: unknown } | null)?.profile_visibility,
  );
  const organizerIntent = (Array.isArray(sp.organizer) ? sp.organizer[0] : sp.organizer) === '1';

  return (
    <section className="mx-auto max-w-md space-y-6">
      {(Array.isArray(sp.profile) ? sp.profile[0] : sp.profile) === 'updated' && (
        <p className="bg-success/10 text-success rounded-xl px-4 py-3 text-sm" role="status">
          Profile updated.
        </p>
      )}
      <div className="border-border bg-surface rounded-2xl border p-5">
        <h1 className="text-foreground text-lg font-semibold">{fullName}</h1>
        {profile?.nickname && (
          <p className="text-foreground-muted text-sm">&ldquo;{profile.nickname}&rdquo;</p>
        )}
        <dl className="mt-4 space-y-1 text-sm">
          <Row label="Email" value={user.email ?? '-'} />
          <Row label="City" value={profile?.city ?? '-'} />
          <Row label="Account" value={profile?.account_status ?? 'active'} />
        </dl>
        {!profile?.onboarded_at ? (
          <ButtonLink href="/onboarding" className="mt-4">
            Complete your profile
          </ButtonLink>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href="/me/edit">Edit profile</ButtonLink>
            {profile?.slug && (
              <ButtonLink href={`/players/${profile.slug}`} variant="secondary">
                View public profile
              </ButtonLink>
            )}
          </div>
        )}
      </div>

      {profile?.onboarded_at && (
        <AppInstallCard installPromptEnabled={installPromptEnabled} pushEnabled={pushEnabled} />
      )}

      {profile?.onboarded_at && (
        <RatingsPrivacyCard
          communityHidden={ratingsVisibility.community_rating === 'hidden'}
          selfHidden={ratingsVisibility.self_rating === 'hidden'}
        />
      )}

      {profile?.onboarded_at && (
        <OrganizerApply
          isOrganizer={isOrganizer}
          hasPending={hasPendingOrgApp}
          defaultOpen={organizerIntent}
        />
      )}

      {profile?.onboarded_at && (
        <nav
          className="border-border bg-surface divide-border divide-y rounded-2xl border text-sm"
          aria-label="Roles"
        >
          <SettingsLink href="/me/roles/coach" label="Roles · Become a Coach" />
        </nav>
      )}

      {isStaff && (
        <nav className="border-primary/40 bg-primary/5 divide-border divide-y rounded-2xl border text-sm">
          {isAdmin && <SettingsLink href="/admin" label="Admin Control Center" />}
          <SettingsLink href="/staff" label="Staff · Moderation" />
        </nav>
      )}

      <nav className="border-border bg-surface divide-border divide-y rounded-2xl border text-sm">
        <SettingsLink href="/me/blocked" label="Blocked users" />
        <SettingsLink href="/me/support" label="Support & appeals" />
        <SettingsLink href="/me/settings/identity" label="Verify my identity" />
        <SettingsLink
          href="/me/settings/privacy"
          label="Privacy, ratings & leaderboard visibility"
        />
        <SettingsLink href="/me/settings/notifications" label="Notification preferences" />
        <SettingsLink href="/me/settings/security" label="Security & two-factor" />
        <SettingsLink href="/me/settings/password" label="Password" />
      </nav>

      <nav className="border-border bg-surface divide-border divide-y rounded-2xl border text-sm">
        <SettingsLink href="/about" label="About VouchPlay" />
        <SettingsLink href="/faq" label="Help & FAQ" />
        <SettingsLink href="/terms" label="Terms of Service" />
        <SettingsLink href="/privacy" label="Privacy Policy" />
      </nav>

      <SignOutButton />
    </section>
  );
}

function SettingsLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-foreground hover:bg-surface-muted flex items-center justify-between px-4 py-3 font-medium first:rounded-t-2xl last:rounded-b-2xl"
    >
      <span>{label}</span>
      <span aria-hidden className="text-foreground-muted flex items-center gap-2">
        <LinkSpinner />›
      </span>
    </Link>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="text-foreground font-medium">{value}</dd>
    </div>
  );
}
