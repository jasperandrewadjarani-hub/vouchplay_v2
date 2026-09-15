import { BadgeSymbol } from '@/components/badges/badge-symbol';
import { PlayerAvatar } from './player-avatar';

/**
 * Avatar with a conic ring in the player's skill-tier colour, filling clockwise with their vouch
 * strength (master_plan §2BK F "Player card": `uniqueVouchers / provenTarget`, computed server-side
 * into `PlayerCardDTO.vouchStrengthPct`). `pct` null - a private community rating, or nothing to rate
 * yet - draws a plain muted track with no fill and no colour, so the ring itself never leaks what a
 * private rating actually is. `crown` renders the Top-of-Tier badge pinned at the ring's edge
 * (avatar-only per the badge catalog - it never also appears in the card's badge row).
 */
export function TierRingAvatar({
  url,
  initials,
  name,
  size = 'sm',
  verified = false,
  ringColor,
  pct,
  crown = false,
  className = '',
}: {
  url: string | null;
  initials: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  verified?: boolean;
  /** Skill-band colour for the ring's fill; ignored (plain muted track) whenever `pct` is null. */
  ringColor: string | null;
  /** 0-100 fill, or null for a private/unrated player - draws an empty, colourless track. */
  pct: number | null;
  crown?: boolean;
  className?: string;
}) {
  const filled = pct != null && ringColor != null;
  const clamped = filled ? Math.max(0, Math.min(100, pct as number)) : 0;
  const background = filled
    ? `conic-gradient(${ringColor} ${clamped}%, var(--surface-muted) 0)`
    : 'var(--border)';

  return (
    <span
      className={`relative inline-block shrink-0 rounded-full p-[2.5px] ${className}`}
      style={{ background }}
    >
      <PlayerAvatar url={url} initials={initials} name={name} size={size} verified={verified} />
      {crown && (
        <span
          className="absolute -top-2 -left-1.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
          aria-hidden
        >
          <BadgeSymbol badgeKey="tier_crown" size={18} title="Top of Tier" />
        </span>
      )}
    </span>
  );
}
