import type { Metadata } from 'next';
import Link from 'next/link';
import { getOptionalUser, getMyProfile } from '@/lib/auth';
import { viewerIsStaff } from '@/lib/moderation/staff';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Me' };

export default async function MePage() {
  const user = await getOptionalUser();

  if (!user) {
    return (
      <section className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-foreground text-xl font-semibold tracking-tight">Your account</h1>
        <p className="text-foreground-muted text-sm">
          Sign in to build your profile, vouch for players, and join clubs and tournaments.
        </p>
        <div className="flex justify-center gap-2">
          <Link href="/login">
            <Button>Sign in</Button>
          </Link>
          <Link href="/signup">
            <Button variant="secondary">Create account</Button>
          </Link>
        </div>
      </section>
    );
  }

  const profile = await getMyProfile();
  const isStaff = await viewerIsStaff();
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || '—';

  return (
    <section className="mx-auto max-w-md space-y-6">
      <div className="border-border bg-surface rounded-2xl border p-5">
        <h1 className="text-foreground text-lg font-semibold">{fullName}</h1>
        {profile?.nickname && (
          <p className="text-foreground-muted text-sm">&ldquo;{profile.nickname}&rdquo;</p>
        )}
        <dl className="mt-4 space-y-1 text-sm">
          <Row label="Email" value={user.email ?? '—'} />
          <Row label="City" value={profile?.city ?? '—'} />
          <Row label="Account" value={profile?.account_status ?? 'active'} />
        </dl>
        {!profile?.onboarded_at ? (
          <Link href="/onboarding" className="mt-4 inline-block">
            <Button>Complete your profile</Button>
          </Link>
        ) : (
          profile?.slug && (
            <Link href={`/players/${profile.slug}`} className="mt-4 inline-block">
              <Button variant="secondary">View public profile</Button>
            </Link>
          )
        )}
      </div>

      {isStaff && (
        <nav className="border-primary/40 bg-primary/5 divide-border divide-y rounded-2xl border text-sm">
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
      <span aria-hidden className="text-foreground-muted">
        ›
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
