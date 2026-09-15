import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import type { PlayerCardDTO } from '@/lib/players/dto';
import type { BadgeView } from '@/lib/badges/types';
import { LinkSpinner } from '@/components/ui/link-spinner';
import { StaffPlayerActivityLink } from '@/components/staff/staff-player-activity-link';
import { BadgeRow } from '@/components/badges/badge-row';
import { CompactRowPending } from './compact-row-pending';
import { TierRingAvatar } from './tier-ring-avatar';
import { ClubStack } from './club-stack';
import { VouchButton } from './vouch-button';
import { StsChip, SexBadge, RatingsPrivateInline } from './badges';

/** Tier line shared by both card variants (master_plan §2BK F): a coloured dot + band label + its
 *  source, or the sentence-case "Ratings private" stand-in - never the old pill-shaped `SkillPill`,
 *  which read as louder chrome than the redesigned card wants. */
function TierLine({
  skill,
  showPrivacyLock,
}: {
  skill: { band: { color: string; label: string }; source: 'community' | 'self' } | null;
  showPrivacyLock: boolean;
}) {
  if (skill) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-bold">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            background: skill.band.color,
            boxShadow: `0 0 0 3px color-mix(in srgb, ${skill.band.color} 20%, transparent)`,
          }}
          aria-hidden
        />
        <span className="text-foreground truncate">{skill.band.label}</span>
        <span className="text-foreground-muted shrink-0 font-semibold">
          · {skill.source === 'community' ? 'Community' : 'Self-rated'}
        </span>
      </span>
    );
  }
  if (showPrivacyLock) return <RatingsPrivateInline />;
  return null;
}

/** Badge row + the cyan "New" and lime "Looking" chips (master_plan §2BK F, "New" restored §2BP), one
 *  line, only rendered when there is something to show. "New" leads: a newly joined player usually has
 *  no badges yet, and "new & unvouched first" is the directory's default sort - the chip is what tells
 *  a voucher who to welcome. */
function CardBadgeLine({
  badges,
  looking,
  isNew,
}: {
  badges: BadgeView[];
  looking: boolean;
  isNew: boolean;
}) {
  if (badges.length === 0 && !looking && !isNew) return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {isNew && (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold"
          style={{
            color: 'var(--accent-cyan)',
            background: 'color-mix(in srgb, var(--accent-cyan) 14%, transparent)',
          }}
          title="Joined recently"
        >
          <Sparkles size={10} strokeWidth={2.75} aria-hidden />
          New
        </span>
      )}
      {badges.length > 0 && <BadgeRow badges={badges} />}
      {looking && (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold"
          style={{
            color: 'var(--accent-lime)',
            background: 'color-mix(in srgb, var(--accent-lime) 12%, transparent)',
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: 'var(--accent-lime)' }}
            aria-hidden
          />
          Looking
        </span>
      )}
    </span>
  );
}

/**
 * Player card (master_plan §2BK F, replacing the handover §8.1 layout). Same information hierarchy
 * in both variants: tier-ring avatar, name + nickname + sex only, one tier line, an optional badge
 * line, a big comparable STS with the vouch count underneath, and the Vouch action.
 */
export function PlayerCard({
  player,
  authed,
  compact = false,
  staffLinks = false,
  showCommunitySkill = true,
  isOwn = false,
}: {
  player: PlayerCardDTO;
  authed: boolean;
  compact?: boolean;
  /** Staff-only "Activity" entry point (master_plan §2AN decision 6) - the caller derives this from
   *  `viewer.isStaff`, never from the DTO, so a cached/shared card can never leak it to a non-staff
   *  viewer. */
  staffLinks?: boolean;
  /** §2AO E: Admin's `profile_show_community_skill` toggle (or the viewer being staff), computed ONCE
   *  per list by the caller and passed down - never decided in this component. False falls back to
   *  the self-rated pill only, exactly like a player with no community skill yet. */
  showCommunitySkill?: boolean;
  /** master_plan §2AW: true when this card is the signed-in viewer's OWN card - shows their private-
   *  ratings reminder chip instead of nothing. The caller derives this (e.g. `player.slug === ownSlug`),
   *  never this component. */
  isOwn?: boolean;
}) {
  // Anonymous visitors get one warm, consistent signup prompt whenever they reach for depth
  // (master_plan §2AH): every directory card click (overlay, name, avatar - compact and detailed)
  // routes to signup with a `next` that resumes on the profile after they join. Signed-in unchanged.
  const profileHref = authed
    ? `/players/${player.slug}`
    : `/signup?next=${encodeURIComponent(`/players/${player.slug}`)}`;
  const skill =
    showCommunitySkill && player.communitySkill
      ? { band: player.communitySkill, source: 'community' as const }
      : player.selfRatedSkill
        ? { band: player.selfRatedSkill, source: 'self' as const }
        : null;
  // §2AW: when the skill slot would otherwise render nothing because the field that would have gone
  // there is private for this viewer, show one lock line instead. When it DID come through (the
  // owner's own card, or a privileged viewer), append the owner's own reminder after the tier line -
  // never for anyone else's card.
  const communityChipHidden = player.communityRatingPrivate && !player.communitySkill;
  const selfChipHidden = player.selfRatingPrivate && !player.selfRatedSkill;
  const showPrivacyLock = !skill && (communityChipHidden || selfChipHidden);
  const showOwnPrivacyReminder =
    isOwn &&
    skill != null &&
    ((skill.source === 'community' && player.communityRatingPrivate) ||
      (skill.source === 'self' && player.selfRatingPrivate));

  const avatar = (
    <TierRingAvatar
      url={player.avatarUrl}
      initials={player.initials}
      name={player.displayName}
      size="sm"
      verified={player.identityVerified}
      ringColor={skill?.band.color ?? null}
      pct={player.vouchStrengthPct}
      crown={Boolean(player.crownTier)}
    />
  );

  const nameLine = (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="text-foreground truncate text-sm font-extrabold">{player.displayName}</span>
      {player.nickname && (
        <span className="text-accent-cyan shrink-0 truncate text-xs font-bold">
          &ldquo;{player.nickname}&rdquo;
        </span>
      )}
      <SexBadge sex={player.sex} symbolOnly />
    </span>
  );

  const rightColumn = (
    <>
      <StsChip sts={player.sts} voucherCount={player.uniqueVoucherCount} variant="stacked" />
      <VouchButton
        slug={player.slug}
        targetName={player.displayName}
        authed={authed}
        hasVouched={player.viewerHasVouched}
        canUpdateInMs={player.viewerVouchCanUpdateInMs}
        size="sm"
        mode="card"
      />
      {/* Staff-only review entry point (master_plan §2AN decision 6), end of the action cluster
          so it never competes with the Vouch button for the first tap. */}
      {staffLinks && <StaffPlayerActivityLink slug={player.slug} size="sm" />}
    </>
  );

  if (compact) {
    return (
      /*
       * Links and controls are SIBLINGS, never nested (§1H, §1S). An absolutely-positioned overlay
       * link keeps the whole row one large tap target for mouse and touch, while the named link on
       * the player is what assistive tech and the keyboard use. The STS chip and the Vouch action
       * are raised above the overlay with "z-10", so one tap does exactly one thing.
       */
      <div className="border-border bg-surface hover:border-primary/40 hover:bg-surface-muted focus-within:border-primary relative flex items-center gap-3 rounded-2xl border p-2.5 transition-colors">
        {/*
          Mouse/touch overlay making the whole row one large tap target. It is hidden from assistive
          tech and from the tab order, because the player's name below is the real, named link - so
          the row reads as exactly one link, not two. Positioned, so it paints above the row's
          in-flow content; the STS and Vouch controls sit above it with z-10.
        */}
        <Link
          href={profileHref}
          prefetch={false}
          aria-hidden
          tabIndex={-1}
          className="absolute inset-0 rounded-2xl"
        >
          {/* useLinkStatus only reports for the Link it sits inside, and nearly every tap lands on
              this overlay rather than on the name, so the cue has to be here as well (§1T). */}
          <CompactRowPending />
        </Link>
        {avatar}
        {/* NOT positioned: a positioned sibling after the overlay in DOM order would paint
            above it and swallow row taps. Only the trailing controls are raised. */}
        <span className="min-w-0 flex-1">
          <Link href={profileHref} prefetch={false} className="min-w-0">
            {nameLine}
            <CompactRowPending />
          </Link>
          <span className="mt-1 block min-w-0">
            <TierLine skill={skill} showPrivacyLock={showPrivacyLock} />
            {showOwnPrivacyReminder && (
              <span className="ml-1.5">
                <RatingsPrivateInline own />
              </span>
            )}
          </span>
          <span className="mt-1 block min-w-0">
            <CardBadgeLine
              badges={player.badges}
              looking={player.lookingForPartner}
              isNew={player.isNew}
            />
          </span>
        </span>
        {/* Raised above the row overlay so both controls are independently tappable. */}
        <span className="relative z-10 flex shrink-0 flex-col items-end gap-1.5">
          {rightColumn}
        </span>
      </div>
    );
  }

  return (
    <div className="border-border bg-surface vp-card flex flex-col gap-2.5 rounded-2xl border p-3.5">
      <div className="flex items-start gap-3">
        <Link href={profileHref} prefetch={false} aria-label={player.displayName}>
          {avatar}
        </Link>
        <div className="min-w-0 flex-1">
          {/* The name is the other thing people tap on a detailed card, so it gets the same pending
              feedback as "View profile" below. The spinner sits after the truncating name. */}
          <Link href={profileHref} className="hover:text-primary flex min-w-0 items-center gap-1.5">
            {nameLine}
            <LinkSpinner />
          </Link>
          <span className="mt-1.5 block min-w-0">
            <TierLine skill={skill} showPrivacyLock={showPrivacyLock} />
            {showOwnPrivacyReminder && (
              <span className="ml-1.5">
                <RatingsPrivateInline own />
              </span>
            )}
          </span>
          <span className="mt-1.5 block min-w-0">
            <CardBadgeLine
              badges={player.badges}
              looking={player.lookingForPartner}
              isNew={player.isNew}
            />
          </span>
        </div>
        <ClubStack clubs={player.clubs} />
      </div>

      <div className="border-border mt-auto flex items-center justify-between gap-2 border-t pt-2.5">
        <Link
          href={profileHref}
          className="text-primary inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
        >
          View profile
          <LinkSpinner />
        </Link>
        <span className="flex items-center gap-2">{rightColumn}</span>
      </div>
    </div>
  );
}
