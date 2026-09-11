import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MapPin, CalendarDays, Facebook, Clock } from 'lucide-react';
import { getViewerContext } from '@/lib/auth';
import {
  getPlayerBySlug,
  getPlayerMetaBySlug,
  getPlayerComments,
  getViewerVouchState,
} from '@/lib/players/queries';
import { hasViewerBlocked } from '@/lib/moderation/enforcement';
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
  NewBadge,
} from '@/components/players/badges';
import {
  SkillDistribution,
  PlayingHistory,
  ContributionProgress,
} from '@/components/players/profile-sections';
import { VouchComments } from '@/components/players/vouch-comments';
import { AchievementsPanel } from '@/components/players/achievements-panel';
import { SkillTagsPanel } from '@/components/players/skill-tags-panel';
import { BackToPlayersLink } from '@/components/players/list-return';
import {
  getPlayerSkillTags,
  getPlayerAchievements,
  getPlayerHistory,
} from '@/lib/players/profile-extras';
import { getContributionProgress } from '@/lib/leaderboards/queries';
import { getVouchSettings } from '@/lib/settings';
import { formatMonthYear } from '@/lib/format-date';
import { countHeldVouchesForTarget } from '@/lib/vouches/held';

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

  const comments = await getPlayerComments(player.id);
  const [skillTags, achievements, history, contribution, vouchSettings, heldVouchCount] =
    await Promise.all([
      getPlayerSkillTags(player.id, viewer.viewerId),
      getPlayerAchievements(player.id, viewer.viewerId),
      getPlayerHistory(player.id),
      getContributionProgress(player.id),
      getVouchSettings(),
      countHeldVouchesForTarget(player.id),
    ]);
  const authed = viewer.viewerId !== null;
  const iBlocked =
    authed && !player.isOwnProfile
      ? await hasViewerBlocked(viewer.viewerId as string, player.id)
      : false;
  // The viewer's own vouch state for this player (§2U): colours the button and drives the note below.
  const vouchState =
    authed && !player.isOwnProfile
      ? await getViewerVouchState(player.id, viewer.viewerId as string)
      : { hasVouched: false, canUpdateInMs: null };
  const distributionTotal = Object.values(player.distribution).reduce((s, n) => s + n, 0);
  const skill = player.communitySkill
    ? { band: player.communitySkill, source: 'community' as const }
    : player.selfRatedSkill
      ? { band: player.selfRatedSkill, source: 'self' as const }
      : null;
  const shareUrl = `${publicEnv.siteUrl}/players/${slug}`;
  const memberSince = formatMonthYear(player.memberSince);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Returns to the exact list URL (filters/sort/page) the viewer came from (master_plan §2AG
          A1), falling back to the bare directory when nothing was remembered. */}
      <BackToPlayersLink className="text-foreground-muted hover:text-foreground text-sm" />

      {/* Header (§9.1) */}
      <header className="border-border bg-surface vp-hero relative overflow-hidden rounded-2xl border p-5">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        {/* Identity + primary action: avatar and name on the left, the Vouch/Share cluster pinned
            top-right on desktop and a prominent row under the name on mobile (§2Y). */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
          <div className="flex min-w-0 items-start gap-4">
            <PlayerAvatar
              url={player.avatarUrl}
              initials={player.initials}
              name={player.displayName}
              size="lg"
              className="ring-primary/25 shrink-0 ring-4"
            />
            <div className="min-w-0">
              <h1 className="text-foreground truncate text-2xl font-semibold tracking-tight">
                {player.displayName}
              </h1>
              {player.nickname && (
                <p className="text-foreground-muted truncate">&ldquo;{player.nickname}&rdquo;</p>
              )}
              <div className="text-foreground-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
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
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <VouchButton
              slug={slug}
              targetId={player.id}
              targetName={player.displayName}
              authed={authed}
              isOwnProfile={player.isOwnProfile}
              viewerIsCoach={viewer.isCoach && vouchSettings.coachWeightEnabled}
              hasVouched={vouchState.hasVouched}
              canUpdateInMs={vouchState.canUpdateInMs}
              mode="profile"
            />
            <ShareButton url={shareUrl} title={`${player.displayName} on VouchPlay`} />
          </div>
        </div>

        {/* Credentials: skill, confidence, sex, then verification / role / availability badges. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {skill && <SkillPill band={skill.band} source={skill.source} />}
          <StsChip sts={player.sts} voucherCount={player.uniqueVoucherCount} />
          <SexBadge sex={player.sex} />
        </div>

        {/* Honest evidence caption (master_plan §2AF "Workflow and UX"): the version-aware count
            behind the numbers above, so nothing visibly changes until Admin flips the algorithm
            version, and a calm, blame-free note when a hold is active - never a count, never a name. */}
        {player.evidenceCount != null && player.evidenceCount > 0 && (
          <p className="text-foreground-muted mt-1.5 text-xs">
            {player.skillVersion === 'STS_V2'
              ? `Based on ${player.evidenceCount} independent players`
              : `Based on ${player.uniqueVoucherCount} players`}
          </p>
        )}
        {heldVouchCount > 0 && (
          <p className="text-foreground-muted mt-1 flex items-center gap-1.5 text-xs">
            <Clock size={12} aria-hidden />
            Some recent vouches are being reviewed and aren&apos;t counted yet.
          </p>
        )}

        {(player.identityVerified ||
          player.skillVerified ||
          player.isCoach ||
          player.isOrganizer ||
          player.lookingForPartner ||
          player.openForSponsorship ||
          player.isNew) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {player.identityVerified && <IdentityVerifiedBadge />}
            {player.skillVerified && <SkillVerifiedBadge />}
            {player.isCoach && <CoachBadge />}
            {player.isOrganizer && <OrganizerBadge />}
            {player.lookingForPartner && <LookingForPartnerBadge />}
            {player.openForSponsorship && <OpenForSponsorshipBadge />}
            {player.isNew && <NewBadge />}
          </div>
        )}

        {player.clubs.length > 0 && (
          <div className="mt-3">
            <ClubStack clubs={player.clubs} />
          </div>
        )}

        {player.bio && <p className="text-foreground mt-3 text-sm">{player.bio}</p>}

        {player.facebookUrl && (
          <a
            href={player.facebookUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary mt-2 inline-flex items-center gap-1 text-sm hover:underline"
          >
            <Facebook size={14} aria-hidden />
            Facebook
          </a>
        )}

        {/* Secondary actions: request a vouch / partner / skill review, report, block (§9.1, §12). */}
        <div className="mt-4">
          <ProfileActions
            slug={slug}
            authed={authed}
            isOwnProfile={player.isOwnProfile}
            targetId={player.id}
            targetName={player.displayName}
            iBlocked={iBlocked}
          />
        </div>
      </header>

      <SkillDistribution distribution={player.distribution} total={distributionTotal} />
      <ContributionProgress progress={contribution} />
      <AchievementsPanel
        authed={authed}
        isOwnProfile={player.isOwnProfile}
        playerId={player.id}
        playerFirstName={player.displayName.split(' ')[0] || player.displayName}
        official={achievements.official}
        community={achievements.community}
        pending={achievements.pending}
      />
      <SkillTagsPanel
        playerId={player.id}
        slug={slug}
        authed={authed}
        isOwnProfile={player.isOwnProfile}
        tags={skillTags}
      />
      <PlayingHistory history={history} />
      <VouchComments
        comments={comments}
        authed={authed}
        viewerId={viewer.viewerId}
        isOwnProfile={player.isOwnProfile}
        targetId={player.id}
        targetName={player.displayName.split(' ')[0] || player.displayName}
        slug={slug}
      />
    </div>
  );
}
