import type { Metadata } from 'next';
import Link from 'next/link';
import { getOptionalUser, getMyProfile } from '@/lib/auth';
import { viewerIsStaff, viewerIsAdmin } from '@/lib/moderation/staff';
import { createServiceClient } from '@/lib/supabase/service';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { OrganizerApply } from '@/components/roles/organizer-apply';
import { ButtonLink } from '@/components/ui/button';
import { LinkSpinner } from '@/components/ui/link-spinner';

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
  const [isStaff, isAdmin] = await Promise.all([viewerIsStaff(), viewerIsAdmin()]);
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || '-';

  // Organizer role state (§17.1) for the apply-as-organizer card.
  const svc = createServiceClient();
  const [{ data: orgRole }, { data: orgApp }] = await Promise.all([
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
  ]);
  const isOrganizer = !!orgRole;
  const hasPendingOrgApp = !!orgApp;
  const organizerIntent = (Array.isArray(sp.organizer) ? sp.organizer[0] : sp.organizer) === '1';

  return (
    <section className="mx-auto max-w-md space-y-6">
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
          profile?.slug && (
            <ButtonLink href={`/players/${profile.slug}`} variant="secondary" className="mt-4">
              View public profile
            </ButtonLink>
          )
        )}
      </div>

      {profile?.onboarded_at && (
        <OrganizerApply
          isOrganizer={isOrganizer}
          hasPending={hasPendingOrgApp}
          defaultOpen={organizerIntent}
        />
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
        <SettingsLink href="/me/settings/security" label="Security & two-factor" />
        <SettingsLink href="/me/settings/password" label="Password" />
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
