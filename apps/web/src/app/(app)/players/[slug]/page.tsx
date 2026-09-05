import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, CalendarDays, Facebook } from 'lucide-react';
import { getViewerContext } from '@/lib/auth';
import { getPlayerBySlug, getPlayerMetaBySlug } from '@/lib/players/queries';
import { publicEnv } from '@/lib/env';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { ClubStack } from '@/components/players/club-stack';
import { VouchButton } from '@/components/players/vouch-button';
import { ShareButton } from '@/components/players/share-button';
import { ProfileActions } from '@/components/players/profile-actions';
import {
  SkillPill,
  StsChip,
  SexBadge,
  IdentityVerifiedBadge,
  SkillVerifiedBadge,
  CoachBadge,
  OrganizerBadge,
  LookingForPartnerBadge,
  OpenForSponsorshipBadge,
} from '@/components/players/badges';
import {
  SkillDistribution,
  VouchComments,
  Achievements,
  SkillTags,
} from '@/components/players/profile-sections';

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const player = await getPlayerMetaBySlug(slug);
  if (!player) return { title: 'Player not found' };

  const url = `${publicEnv.siteUrl}/players/${slug}`;
  const title = player.nickname ? `${player.displayName} (${player.nickname})` : player.displayName;
  const descBits = [
    player.city ? `Player in ${player.city}` : 'VouchPlay player',
    player.identityVerified ? 'Identity verified' : null,
    'Skill reputation built by community vouches.',
  ].filter(Boolean);
  const description = player.bio?.trim() || descBits.join(' · ');
  const image = player.avatarUrl ?? `${publicEnv.siteUrl}/brand/vouchplay-logo-horizontal.png`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'profile',
      url,
      title: `${title} · VouchPlay`,
      description,
      images: [{ url: image }],
    },
    twitter: { card: 'summary', title: `${title} · VouchPlay`, description, images: [image] },
  };
}

export default async function PlayerProfilePage({ params }: Params) {
  const { slug } = await params;
  const viewer = await getViewerContext();
  const player = await getPlayerBySlug(slug, viewer);
  if (!player) notFound();

  const authed = viewer.viewerId !== null;
  const skill = player.communitySkill
    ? { band: player.communitySkill, source: 'community' as const }
    : player.selfRatedSkill
      ? { band: player.selfRatedSkill, source: 'self' as const }
      : null;
  const shareUrl = `${publicEnv.siteUrl}/players/${slug}`;
  const memberSince = new Date(player.memberSince).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/players" className="text-foreground-muted hover:text-foreground text-sm">
        ← All players
      </Link>

      {/* Header (§9.1) */}
      <header className="border-border bg-surface rounded-2xl border p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <PlayerAvatar
            url={player.avatarUrl}
            initials={player.initials}
            name={player.displayName}
            size="lg"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <h1 className="text-foreground text-2xl font-semibold tracking-tight">
                {player.displayName}
              </h1>
              {player.nickname && (
                <p className="text-foreground-muted">&ldquo;{player.nickname}&rdquo;</p>
              )}
            </div>

            <div className="text-foreground-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {player.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={14} aria-hidden />
                  {player.city}
                </span>
              )}
              {player.age != null && <span>{player.age} yrs</span>}
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={14} aria-hidden />
                Member since {memberSince}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {skill && <SkillPill band={skill.band} source={skill.source} />}
              <StsChip sts={player.sts} />
              <SexBadge sex={player.sex} />
            </div>

            {(player.identityVerified ||
              player.skillVerified ||
              player.isCoach ||
              player.isOrganizer ||
              player.lookingForPartner ||
              player.openForSponsorship) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {player.identityVerified && <IdentityVerifiedBadge />}
                {player.skillVerified && <SkillVerifiedBadge />}
                {player.isCoach && <CoachBadge />}
                {player.isOrganizer && <OrganizerBadge />}
                {player.lookingForPartner && <LookingForPartnerBadge />}
                {player.openForSponsorship && <OpenForSponsorshipBadge />}
              </div>
            )}

            <ClubStack clubs={player.clubs} />

            {player.bio && <p className="text-foreground pt-1 text-sm">{player.bio}</p>}

            {player.facebookUrl && (
              <a
                href={player.facebookUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
              >
                <Facebook size={14} aria-hidden />
                Facebook
              </a>
            )}
          </div>
        </div>

        {/* Primary actions (§9.1) */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <VouchButton slug={slug} authed={authed} isOwnProfile={player.isOwnProfile} />
          <ShareButton url={shareUrl} title={`${player.displayName} on VouchPlay`} />
        </div>
        <div className="mt-2">
          <ProfileActions slug={slug} authed={authed} isOwnProfile={player.isOwnProfile} />
        </div>
      </header>

      <SkillDistribution />
      <VouchComments />
      <Achievements />
      <SkillTags />
    </div>
  );
}
