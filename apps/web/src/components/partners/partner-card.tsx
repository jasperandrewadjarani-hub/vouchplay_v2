import Link from 'next/link';
import { MapPin } from 'lucide-react';
import type { PartnerCard as PartnerCardData } from '@/lib/partners/types';
import { PlayerAvatar } from '@/components/players/player-avatar';
import {
  SkillPill,
  StsChip,
  CoachVouchedBadge,
  IdentityVerifiedBadge,
  RatingsPrivateChip,
} from '@/components/players/badges';

/**
 * One deck card (master_plan §2AV E). Never shows the sort score, never shows a swipe/like state -
 * exactly the profile facts the viewer is allowed to see, following §2AW privacy same as everywhere
 * else (`communityRatingPrivate`/`selfRatingPrivate` are already applied server-side; this component
 * just renders what it is handed).
 */
export function PartnerCard({ player }: { player: PartnerCardData }) {
  // Community first, then the self-rated fallback, exactly like `PlayerCard` - the lock chip only
  // stands in when NEITHER is available to show AND the reason is the owner's own privacy choice
  // (master_plan §2AW B), not just an absence of ratings.
  const skill =
    player.communitySkill != null
      ? { band: player.communitySkill, source: 'community' as const }
      : player.selfRatedSkill != null
        ? { band: player.selfRatedSkill, source: 'self' as const }
        : null;
  const ratingsPrivate = !skill && player.communityRatingPrivate;

  return (
    <div className="border-border bg-surface vp-card flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <PlayerAvatar
          url={player.avatarUrl}
          initials={player.initials}
          name={player.displayName}
          size="lg"
          verified={player.identityVerified}
          className="ring-primary/20 ring-2 ring-offset-0"
        />
        <div className="min-w-0 flex-1 pt-1">
          <Link
            href={`/players/${player.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary text-foreground inline-flex items-center gap-1.5 text-base font-semibold"
          >
            <span className="truncate">{player.displayName}</span>
          </Link>
          {player.city && (
            <p className="text-foreground-muted mt-0.5 flex items-center gap-1 text-xs">
              <MapPin size={12} aria-hidden />
              {player.city}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {player.identityVerified && <IdentityVerifiedBadge />}
        {ratingsPrivate ? (
          <RatingsPrivateChip />
        ) : (
          skill && <SkillPill band={skill.band} source={skill.source} size="sm" />
        )}
        {player.sts != null && <StsChip sts={player.sts} interactive={false} />}
        {player.coachVouched && <CoachVouchedBadge />}
      </div>

      {player.commonDivisions.length > 0 && (
        <div>
          <p className="text-foreground-muted text-xs font-medium">Divisions in common</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {player.commonDivisions.map((d) => (
              <span
                key={d.id}
                className="border-border bg-surface-muted text-foreground inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium"
              >
                {d.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {player.seat && (
        <span
          className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            player.seat.paid ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
          }`}
        >
          {player.seat.paid ? `Has a slot · ${player.seat.divisionName}` : 'Entered · unpaid'}
        </span>
      )}

      {player.note && (
        <p className="text-foreground-muted text-sm italic">&ldquo;{player.note}&rdquo;</p>
      )}
    </div>
  );
}
