import Link from 'next/link';
import { MapPin } from 'lucide-react';
import type { PlayerCardDTO } from '@/lib/players/dto';
import { LinkSpinner } from '@/components/ui/link-spinner';
import { CompactRowTrailing } from './compact-row-trailing';
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
      <Link
        href={profileHref}
        aria-label={`View ${player.displayName}'s profile`}
        className="border-border bg-surface hover:border-primary/40 hover:bg-surface-muted focus-visible:outline-primary flex min-h-14 items-center gap-3 rounded-xl border p-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <PlayerAvatar
          url={player.avatarUrl}
          initials={player.initials}
          name={player.displayName}
          size="sm"
          className="ring-primary/15 shrink-0 ring-2 ring-offset-0"
        />
        {/* Name owns the full row width and is never squeezed by the skill pill: the pill moves to its
            own line beneath. STS then sits in a fixed-width column so it lines up down the list, and
            keeps that width when a player has none so the column stays straight. */}
        <span className="min-w-0 flex-1">
          <span className="text-foreground block truncate text-sm font-semibold">
            {player.displayName}
          </span>
          {skill && (
            <span className="mt-1 flex min-w-0 overflow-hidden">
              <SkillPill band={skill.band} source={skill.source} size="sm" />
            </span>
          )}
        </span>
        {/* The STS slot doubles as the row's pending indicator, so tapping a row gives immediate
            feedback without taking any width from the name and skill pill. */}
        <CompactRowTrailing sts={player.sts} />
      </Link>
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

      {(skill || player.sts != null) && (
        <div className="flex flex-wrap items-center gap-2">
          {skill && <SkillPill band={skill.band} source={skill.source} size="sm" />}
          <StsChip sts={player.sts} />
        </div>
      )}

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
