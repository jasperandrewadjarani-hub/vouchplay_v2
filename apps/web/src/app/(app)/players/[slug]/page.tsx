import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { MapPin, CalendarDays, Facebook, Clock } from 'lucide-react';
import { getViewerContext, getOptionalUser } from '@/lib/auth';
import {
  getPlayerBySlug,
  getPlayerMetaBySlug,
  getPlayerComments,
  getViewerVouchState,
  hasPendingIdentityVerification,
} from '@/lib/players/queries';
import { hasViewerBlocked } from '@/lib/moderation/enforcement';
import { isPrivilegedViewerFor } from '@/lib/players/privileged';
import { publicEnv } from '@/lib/env';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { ClubStack } from '@/components/players/club-stack';
import { VouchButton } from '@/components/players/vouch-button';
import { ShareButton } from '@/components/players/share-button';
import { ProfileActions } from '@/components/players/profile-actions';
import { StaffPlayerActivityLink } from '@/components/staff/staff-player-activity-link';
import {
  SkillPill,
  StsChip,
  SexBadge,
  IdentityVerifiedBadge,
  SkillVerifiedBadge,
  CoachBadge,
  CoachVouchedBadge,
  OrganizerBadge,
  LookingForPartnerBadge,
  OpenForSponsorshipBadge,
  NewBadge,
  PendingIdentityBadge,
  RatingsPrivateChip,
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
import { getVouchSettings, getProfileVisibilityFlags, loadSettingFlag } from '@/lib/settings';
import { formatMonthYear } from '@/lib/format-date';
import { countHeldVouchesForTarget } from '@/lib/vouches/held';
import { getVoucherTierCached } from '@/lib/vouches/newcomer';
import { getVoucherPowerCached } from '@/lib/vouches/voucher-power';

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
  // Signup wall (master_plan §2AH): profiles are not public to anonymous visitors. Redirect them to
  // signup with a `next` that resumes here after they join. `generateMetadata` above is untouched, so
  // a shared link's OG preview card still renders and the click converts. Signed-in path unchanged.
  if (!(await getOptionalUser())) {
    redirect(`/signup?next=${encodeURIComponent(`/players/${slug}`)}`);
  }
  const viewer = await getViewerContext();
  let player = await getPlayerBySlug(slug, viewer);
  if (!player) notFound();
  // master_plan §2AW: the owner and staff already see everything (the DTO's own ownership/isStaff
  // check), so the extra organizer-privilege lookup only ever needs to run for someone ELSE viewing a
  // profile that actually has something private - never on every single profile view.
  const needsPrivilegeCheck =
    !viewer.isStaff &&
    viewer.viewerId !== player.id &&
    (player.communityRatingPrivate || player.selfRatingPrivate);
  const privileged =
    viewer.isStaff ||
    (needsPrivilegeCheck ? await isPrivilegedViewerFor(viewer.viewerId, player.id) : false);
  if (privileged && needsPrivilegeCheck) {
    // Re-resolve the DTO now that the viewer is known to be a privileged organizer, so the real
    // community/self rating values (and the vouch-meter distribution) come through unredacted.
    player = await getPlayerBySlug(slug, { ...viewer, ratingsPrivileged: true });
    if (!player) notFound();
  }

  const comments = await getPlayerComments(player.id);
  const [
    skillTags,
    achievements,
    history,
    contribution,
    vouchSettings,
    heldVouchCount,
    identityPending,
    visibilityFlags,
  ] = await Promise.all([
    getPlayerSkillTags(player.id, viewer.viewerId),
    getPlayerAchievements(player.id, viewer.viewerId),
    getPlayerHistory(player.id),
    getContributionProgress(player.id),
    getVouchSettings(),
    countHeldVouchesForTarget(player.id),
    // Own-profile-only, cheap bounded read (master_plan §2AG Phase C); never shown on anyone
    // else's profile and never exposes the document itself.
    player.isOwnProfile ? hasPendingIdentityVerification(player.id) : Promise.resolve(false),
    getProfileVisibilityFlags(),
  ]);
  // §2AO E: the two Admin profile-visibility toggles. The community chip stays visible to the owner
  // and staff even when Admin hides it from other players (the wizard/fit messages speak in terms of
  // it); the vouch-meter toggle deliberately does NOT carve out the owner - off means nobody but
  // staff sees the distribution, owner included.
  const showCommunity = visibilityFlags.showCommunitySkill || player.isOwnProfile || viewer.isStaff;
  const showMeter = visibilityFlags.showVouchMeter || viewer.isStaff;
  // master_plan §2AW: whichever field this viewer cannot see (its setting is private AND no real
  // value came through the DTO for them) collapses into ONE shared lock chip - never one per field,
  // and never shown to the owner (who sees their own real values above regardless, plus their own
  // reminder chip + disclosure line below whenever either setting is actually hidden).
  const communityLockedForViewer =
    showCommunity && player.communityRatingPrivate && !player.communitySkill;
  const selfLockedForViewer = player.selfRatingPrivate && !player.selfRatedSkill;
  const showRatingsPrivateChip =
    !player.isOwnProfile && (communityLockedForViewer || selfLockedForViewer);
  const ownRatingsArePrivate =
    player.isOwnProfile && (player.communityRatingPrivate || player.selfRatingPrivate);
  const authed = viewer.viewerId !== null;
  // §2BC-D: staff see the "See vouch activity" link only while Admin's switch is on; the
  // /staff/players/[slug] page itself stays reachable by URL regardless (role + step-up gated).
  const staffLinks =
    viewer.isStaff && (await loadSettingFlag('staff_activity_links_enabled', true));
  const iBlocked =
    authed && !player.isOwnProfile
      ? await hasViewerBlocked(viewer.viewerId as string, player.id)
      : false;
  // The viewer's own vouch state for this player (§2U): colours the button and drives the note below.
  // The viewer's newcomer tier (§2AJ, cached 60s) only decides whether the form shows its one-line cap
  // note - the server action enforces the cap on fresh facts regardless.
  const [vouchState, viewerTier, viewerPower] =
    authed && !player.isOwnProfile
      ? await Promise.all([
          getViewerVouchState(player.id, viewer.viewerId as string),
          getVoucherTierCached(viewer.viewerId as string),
          // §2AN d5: the VIEWER's own vouching power (cached 60s) - only to word the form's one-line note.
          getVoucherPowerCached(viewer.viewerId as string),
        ])
      : [{ hasVouched: false, canUpdateInMs: null }, null, null];
  const newcomerLimit = viewerTier?.tier === 'newcomer' ? viewerTier.newcomerCaps.per24h : 0;
  const distributionTotal = Object.values(player.distribution).reduce((s, n) => s + n, 0);
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
        {/* Sex badge moved out of the credentials row into the header's own top-right corner
            (master_plan §2AT Decision I) - it no longer takes a chip slot next to skill/STS. */}
        <div className="absolute top-3 right-3 z-10">
          <SexBadge sex={player.sex} />
        </div>
        {/* Identity + primary action: avatar and name on the left, the Vouch/Share cluster pinned
            top-right on desktop and a prominent row under the name on mobile (§2Y). */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
          <div className="flex min-w-0 items-start gap-4">
            <PlayerAvatar
              url={player.avatarUrl}
              initials={player.initials}
              name={player.displayName}
              size="lg"
              verified={player.identityVerified}
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
              newcomerLimit={newcomerLimit}
              minimalPower={viewerPower?.minimal ?? false}
              hasVouched={vouchState.hasVouched}
              canUpdateInMs={vouchState.canUpdateInMs}
              mode="profile"
            />
            <ShareButton url={shareUrl} title={`${player.displayName} on VouchPlay`} />
            {/* Staff-only review entry point (master_plan §2AN decision 6, §2BC-D) - the page decides
                staff-ness from `viewer.isStaff` and the Admin switch, never from the player DTO. */}
            {staffLinks && <StaffPlayerActivityLink slug={slug} size="sm" />}
          </div>
        </div>

        {/* Credentials: community skill, confidence, self-rated skill, then verification / role /
            availability badges (master_plan §2AT Decision I - STS sits right after the community
            chip; with no community chip it leads, then the self-rated chip). §2AO D4/E: the full
            profile shows the community chip AND the self-rated chip together (community first) when
            Admin's `profile_show_community_skill` allows it for this viewer; otherwise only the
            self-rated chip (the self-rating is never hidden from anyone). The sex badge lives in the
            header's top-right corner now, not in this row. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {showCommunity && player.communitySkill && (
            <SkillPill band={player.communitySkill} source="community" />
          )}
          <StsChip sts={player.sts} voucherCount={player.uniqueVoucherCount} />
          {player.selfRatedSkill && <SkillPill band={player.selfRatedSkill} source="self" />}
          {/* §2AW: one lock chip stands in for whichever chip(s) this viewer cannot see. */}
          {showRatingsPrivateChip && <RatingsPrivateChip />}
          {ownRatingsArePrivate && <RatingsPrivateChip own />}
        </div>

        {ownRatingsArePrivate && (
          <p className="text-foreground-muted mt-1 text-xs">
            Only you, tournament organizers and staff can see this.
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
          player.coachVouched ||
          player.isOrganizer ||
          player.lookingForPartner ||
          player.openForSponsorship ||
          player.isNew ||
          (player.isOwnProfile && identityPending)) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {player.identityVerified && <IdentityVerifiedBadge />}
            {player.skillVerified && <SkillVerifiedBadge />}
            {player.isCoach && <CoachBadge />}
            {player.coachVouched && <CoachVouchedBadge />}
            {player.isOrganizer && <OrganizerBadge />}
            {player.lookingForPartner && <LookingForPartnerBadge />}
            {player.openForSponsorship && <OpenForSponsorshipBadge />}
            {player.isNew && <NewBadge />}
            {/* Own-profile-only chip (master_plan §2AG Phase C) - never rendered for a viewer other
                than the player themself, and never reveals the document. */}
            {player.isOwnProfile && identityPending && <PendingIdentityBadge />}
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

      {/* §2AO E: off → hidden from everyone except staff, the owner included - deliberately no
          owner carve-out here (unlike the community chip above). */}
      {showMeter && (
        <SkillDistribution
          distribution={player.distribution}
          total={distributionTotal}
          coachVouchers={player.coachVouchers}
        />
      )}
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
