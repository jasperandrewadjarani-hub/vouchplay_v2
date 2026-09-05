import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shield, MapPin, BadgeCheck, Users, Settings, ExternalLink } from 'lucide-react';
import { getViewerContext } from '@/lib/auth';
import { getClubBySlug, getClubMembers } from '@/lib/clubs/queries';
import { publicEnv } from '@/lib/env';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { ShareButton } from '@/components/players/share-button';
import { JoinButton } from '@/components/clubs/join-button';

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClubBySlug(slug, { viewerId: null, isStaff: false });
  if (!club) return { title: 'Club not found' };
  const url = `${publicEnv.siteUrl}/clubs/${slug}`;
  const description =
    club.description?.trim() ||
    `${club.name}${club.city ? ` · ${club.city}` : ''} — a pickleball club on VouchPlay.`;
  return {
    title: club.name,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', url, title: `${club.name} · VouchPlay`, description },
  };
}

export default async function ClubPage({ params }: Params) {
  const { slug } = await params;
  const viewer = await getViewerContext();
  const club = await getClubBySlug(slug, { viewerId: viewer.viewerId, isStaff: viewer.isStaff });
  if (!club) notFound();

  const authed = viewer.viewerId !== null;
  const members = (await getClubMembers(club.id)).filter((m) => m.status === 'active');
  const shareUrl = `${publicEnv.siteUrl}/clubs/${slug}`;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/clubs" className="text-foreground-muted hover:text-foreground text-sm">
        ← All clubs
      </Link>

      <header className="border-border bg-surface vp-hero relative overflow-hidden rounded-2xl border p-5">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="border-border bg-surface-muted ring-primary/20 inline-flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border ring-4">
            {club.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={club.logoUrl} alt={club.name} className="h-full w-full object-cover" />
            ) : (
              <Shield size={32} aria-hidden className="text-foreground-muted" />
            )}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-foreground text-2xl font-semibold tracking-tight">{club.name}</h1>
              {club.verified && <BadgeCheck size={20} aria-hidden className="text-primary" />}
            </div>
            <div className="text-foreground-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {club.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={14} aria-hidden />
                  {club.city}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Users size={14} aria-hidden />
                {club.memberCount} {club.memberCount === 1 ? 'member' : 'members'}
              </span>
              {club.privacy === 'approval_required' && (
                <span className="vp-label">Approval to join</span>
              )}
              {!club.verified && <span className="vp-label">Unverified</span>}
            </div>
            {club.description && <p className="text-foreground pt-1 text-sm">{club.description}</p>}
            {club.contact && (
              <a
                href={/^https?:\/\//i.test(club.contact) ? club.contact : `https://${club.contact}`}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
              >
                <ExternalLink size={14} aria-hidden />
                Contact
              </a>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <JoinButton
            clubId={club.id}
            slug={slug}
            authed={authed}
            privacy={club.privacy}
            membership={club.myMembership}
          />
          <ShareButton url={shareUrl} title={`${club.name} on VouchPlay`} />
          {club.canManage && (
            <Link
              href={`/clubs/${slug}/manage`}
              className="border-border bg-surface text-foreground hover:bg-surface-muted inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium"
            >
              <Settings size={15} aria-hidden />
              Manage
            </Link>
          )}
        </div>

        {club.canManage && club.verificationStatus !== 'verified' && (
          <p className="text-foreground-muted mt-3 text-xs">
            {club.verificationStatus === 'rejected'
              ? 'Verification was declined. Contact support via /me/support if you think this is a mistake.'
              : 'Verification pending — our team reviews new clubs for the verified badge.'}
          </p>
        )}
      </header>

      {/* Owners & admins */}
      {(club.owners.length > 0 || club.admins.length > 0) && (
        <section className="border-border bg-surface rounded-2xl border p-4">
          <h2 className="text-foreground mb-3 text-base font-semibold">Owners &amp; admins</h2>
          <ul className="flex flex-wrap gap-3">
            {[...club.owners, ...club.admins].map((m) => (
              <li key={m.userId}>
                <MemberChip member={m} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Members (§15.5) */}
      <section className="border-border bg-surface rounded-2xl border p-4">
        <h2 className="text-foreground mb-3 text-base font-semibold">Members ({members.length})</h2>
        {members.length === 0 ? (
          <p className="text-foreground-muted text-sm">No members yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {members.map((m) => (
              <li key={m.userId}>
                <MemberChip member={m} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MemberChip({
  member,
}: {
  member: {
    userId: string;
    name: string;
    slug: string | null;
    initials: string;
    avatarUrl: string | null;
    role: string;
  };
}) {
  const inner = (
    <span className="border-border bg-background hover:bg-surface-muted flex items-center gap-2 rounded-xl border px-2.5 py-2">
      <PlayerAvatar
        url={member.avatarUrl}
        initials={member.initials}
        name={member.name}
        size="sm"
      />
      <span className="min-w-0">
        <span className="text-foreground block truncate text-sm font-medium">{member.name}</span>
        {member.role !== 'member' && (
          <span className="text-primary text-xs capitalize">{member.role}</span>
        )}
      </span>
    </span>
  );
  return member.slug ? <Link href={`/players/${member.slug}`}>{inner}</Link> : inner;
}
