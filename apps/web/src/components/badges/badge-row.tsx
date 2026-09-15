import type { CSSProperties } from 'react';
import { badgeDef, BADGE_METALS } from '@vouchplay/config';
import type { BadgeView } from '@/lib/badges/types';
import { BadgeSymbol } from './badge-symbol';

/**
 * Player-card badge row (master_plan §2BK E): at most `max` symbols, the first named in its metal
 * colour, then "+N". Server-safe (no client boundary needed - display only, no tap targets).
 *
 * Assumes `badges` already arrives in card order (pinned → rarity → newest, per `BadgeCase.earned` /
 * the players-list DTO), so this component only filters and truncates - it never re-sorts.
 */
export function BadgeRow({
  badges,
  max = 2,
  size = 20,
  className,
}: {
  badges: BadgeView[];
  max?: number;
  size?: number;
  className?: string;
}) {
  // avatarOnly badges (tier_crown) render on the avatar as a crown, never in this row.
  const displayable = badges.filter((b) => !badgeDef(b.key)?.avatarOnly);
  // Legend replaces Champion on the card (both still show in the badge case).
  const hasLegend = displayable.some((b) => b.key === 'legend');
  const filtered = hasLegend ? displayable.filter((b) => b.key !== 'champion') : displayable;

  if (filtered.length === 0) return null;

  const shown = filtered.slice(0, Math.max(1, max));
  const first = shown[0];
  if (!first) return null; // filtered.length > 0 above guarantees this in practice
  const rest = shown.slice(1);
  const remaining = filtered.length - shown.length;
  const firstDef = badgeDef(first.key);
  const metal = firstDef ? BADGE_METALS[firstDef.metal] : null;

  return (
    <div className={`flex min-w-0 items-center gap-1.5 ${className ?? ''}`}>
      <BadgeSymbol badgeKey={first.key} size={size} number={first.meta.number} title={first.name} />
      {metal && (
        <span
          className="vp-badge-name truncate text-xs font-bold"
          style={
            {
              '--vp-badge-name-light': metal[1],
              '--vp-badge-name-dark': metal[0],
            } as CSSProperties
          }
        >
          {first.name}
        </span>
      )}
      {rest.map((b) => (
        <BadgeSymbol
          key={b.id}
          badgeKey={b.key}
          size={size}
          number={b.meta.number}
          title={b.name}
        />
      ))}
      {remaining > 0 && (
        <span className="text-foreground-muted bg-surface-muted shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold">
          +{remaining}
        </span>
      )}
    </div>
  );
}
