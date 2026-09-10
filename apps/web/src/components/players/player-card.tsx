import Link from 'next/link';
import { MapPin, UserSearch, Handshake } from 'lucide-react';
import type { PlayerCardDTO } from '@/lib/players/dto';
import { LinkSpinner } from '@/components/ui/link-spinner';
import { CompactRowPending } from './compact-row-pending';
import { PlayerAvatar } from './player-avatar';
import { ClubStack } from './club-stack';
import { VouchButton } from './vouch-button';
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
} from './badges';

/**
 * Concise player card (handover §8.1). Renders only fields that are present ("Do not render empty
 * fields"). Community Skill is shown when available; otherwise the clearly-labeled Self-Rated band.
 */
export function PlayerCard({
  player,
  authed,
  compact = false,
}: {
  player: PlayerCardDTO;
  authed: boolean;
  compact?: boolean;
}) {
  const profileHref = `/players/${player.slug}`;
  const skill = player.communitySkill
    ? { band: player.communitySkill, source: 'community' as const }
    : player.selfRatedSkill
      ? { band: player.selfRatedSkill, source: 'self' as const }
      : null;

  if (compact) {
    return (
      /*
       * Links and controls are SIBLINGS, never nested (§1H, §1S). An absolutely-positioned overlay
       * link keeps the whole row one large tap target for mouse and touch, while the named link on
       * the player is what assistive tech and the keyboard use. The STS chip and the Vouch action
       * are raised above the overlay with "z-10", so one tap does exactly one thing.
       */
      <div className="border-border bg-surface hover:border-primary/40 hover:bg-surface-muted focus-within:border-primary relative flex min-h-14 items-center gap-3 rounded-xl border p-2.5 transition-colors">
        {/*
          Mouse/touch overlay making the whole row one large tap target. It is hidden from assistive
          tech and from the tab order, because the player's name below is the real, named link - so
          the row reads as exactly one link, not two. Positioned, so it paints above the row's
          in-flow content; the STS and Vouch controls sit above it with z-10.
        */}
        <Link href={profileHref} aria-hidden tabIndex={-1} className="absolute inset-0 rounded-xl">
          {/* useLinkStatus only reports for the Link it sits inside, and nearly every tap lands on
              this overlay rather than on the name, so the cue has to be here as well (§1T). */}
          <CompactRowPending />
        </Link>
        <PlayerAvatar
          url={player.avatarUrl}
          initials={player.initials}
          name={player.displayName}
          size="sm"
          className="ring-primary/15 shrink-0 ring-2 ring-offset-0"
        />
        {/* NOT positioned: a positioned sibling after the overlay in DOM order would paint
            above it and swallow row taps. Only the trailing controls are raised. */}
        <span className="min-w-0 flex-1">
          {/* Line one: name, nickname, sex. The name truncates last. */}
          <span className="flex min-w-0 items-center gap-1.5">
            <Link href={profileHref} className="min-w-0 shrink">
              <span className="text-foreground block truncate text-sm font-semibold">
                {player.displayName}
              </span>
              <CompactRowPending />
            </Link>
            {player.nickname && (
              <span className="text-foreground-muted min-w-0 shrink-[3] truncate text-xs">
                &ldquo;{player.nickname}&rdquo;
              </span>
            )}
            <SexBadge sex={player.sex} symbolOnly />
            {/* A small icon, not a pill, so line one still holds the name/nickname/sex without
                wrapping (§1H/§1T). It marks who is open to a partner at a glance, and it is the same
                looking_for_partner flag the filter and the profile badge use (§2L). */}
            {player.lookingForPartner && (
              <UserSearch
                size={13}
                className="shrink-0"
                style={{ color: 'var(--accent-lime)' }}
                aria-label="Looking for a partner"
              />
            )}
            {/* Same open_for_sponsorship flag as the filter, profile badge, and detailed card (§2T).
                Primary colour mirrors the detailed OpenForSponsorship badge; lime = partner above. */}
            {player.openForSponsorship && (
              <Handshake
                size={13}
                className="text-primary shrink-0"
                aria-label="Open to sponsorship"
              />
            )}
          </span>
          {/* Line two: the skill pill alone. Club logos used to sit beside it and pushed the
              longer pills onto a second line, which leaves the whole list ragged (§1H, §1T).
              A compact row gets one pill per line and nothing beside it. */}
          {skill && (
            <span className="mt-1 flex min-w-0 overflow-hidden">
              <SkillPill band={skill.band} source={skill.source} size="sm" />
            </span>
          )}
        </span>
        {/* Raised above the row overlay so both controls are independently tappable. */}
        <span className="relative z-10 flex w-[92px] shrink-0 flex-col items-end gap-1.5">
          <StsChip sts={player.sts} voucherCount={player.uniqueVoucherCount} terse />
          <VouchButton
            slug={player.slug}
            targetName={player.displayName}
            authed={authed}
            size="sm"
            mode="card"
          />
        </span>
      </div>
    );
  }

  return (
    <div className="border-border bg-surface vp-card flex flex-col gap-2.5 rounded-2xl border p-3.5">
      <div className="flex items-start gap-3">
        <Link href={profileHref} aria-label={player.displayName}>
          <PlayerAvatar
            url={player.avatarUrl}
            initials={player.initials}
            name={player.displayName}
            size="sm"
            className="ring-primary/20 ring-2 ring-offset-0"
          />
        </Link>
        <div className="min-w-0 flex-1">
          {/* The name is the other thing people tap on a detailed card, so it gets the same pending
              feedback as "View profile" below. The spinner sits after the truncating name. */}
          <Link
            href={profileHref}
            className="hover:text-primary flex min-w-0 items-center gap-1.5 font-semibold"
          >
            <span className="truncate">{player.displayName}</span>
            <LinkSpinner />
          </Link>
          {player.nickname && (
            <p className="text-foreground-muted truncate text-sm">
              &ldquo;{player.nickname}&rdquo;
            </p>
          )}
          <div className="text-foreground-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {player.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} aria-hidden />
                {player.city}
              </span>
            )}
            <SexBadge sex={player.sex} />
          </div>
        </div>
        <ClubStack clubs={player.clubs} />
      </div>

      {/* The STS chip always renders now (0.0 when nobody has vouched yet, §2B), so this row is no
          longer conditional on there being a score to show. */}
      <div className="flex flex-wrap items-center gap-2">
        {skill && <SkillPill band={skill.band} source={skill.source} size="sm" />}
        <StsChip sts={player.sts} voucherCount={player.uniqueVoucherCount} />
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

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <Link
          href={profileHref}
          className="text-primary inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
        >
          View profile
          <LinkSpinner />
        </Link>
        <VouchButton
          slug={player.slug}
          targetName={player.displayName}
          authed={authed}
          size="sm"
          mode="card"
        />
      </div>
    </div>
  );
}
