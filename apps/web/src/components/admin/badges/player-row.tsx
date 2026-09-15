'use client';

import { ChevronRight, Check } from 'lucide-react';
import { badgeDef } from '@vouchplay/config';
import { BadgeSymbol } from '@/components/badges/badge-symbol';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { nameInitials } from '@/lib/storage';
import type { AdminBadgeTagPlayer } from '@/lib/admin/user-queries';

const MAX_BADGE_PREVIEW = 3;

/**
 * One row of the Tag screen's player list (master_plan §2BL E): a 26px checkbox (cyan when checked),
 * avatar, name/nickname, tier, up to 3 current badges + "+n", and a lime "Has {badge}" pill when the
 * row already holds one of the tray's chosen badges. Tapping the row (not the checkbox specifically)
 * toggles selection; the chevron opens that player's own badge panel instead.
 */
export function PlayerRow({
  player,
  selected,
  chosenBadgeKeys,
  onToggle,
  onOpenPanel,
}: {
  player: AdminBadgeTagPlayer;
  selected: boolean;
  /** Tray's chosen badge keys, for the "Has X" pill (first match wins). */
  chosenBadgeKeys: string[];
  onToggle: () => void;
  onOpenPanel: () => void;
}) {
  const alreadyHasKey = chosenBadgeKeys.find((k) => player.badgeKeys.includes(k));
  const alreadyHasName = alreadyHasKey ? (badgeDef(alreadyHasKey)?.name ?? alreadyHasKey) : null;
  const shown = player.badgeKeys.slice(0, MAX_BADGE_PREVIEW);
  const extra = player.badgeKeys.length - shown.length;

  return (
    <div
      className={`border-border bg-surface flex items-center gap-3 rounded-2xl border p-3 transition-colors ${
        selected ? 'border-accent-cyan bg-accent-cyan/5' : ''
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        aria-label={selected ? `Deselect ${player.name}` : `Select ${player.name}`}
        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center"
      >
        <span
          aria-hidden
          className={`flex size-[26px] items-center justify-center rounded-lg border-2 transition-colors ${
            selected
              ? 'border-accent-cyan bg-accent-cyan text-white'
              : 'border-border bg-background'
          }`}
        >
          {selected && <Check size={15} strokeWidth={3} />}
        </span>
      </button>

      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <PlayerAvatar
          url={player.avatarUrl}
          initials={nameInitials(player.name)}
          name={player.name}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-semibold">
            {player.name}
            {player.nickname && (
              <span className="text-foreground-muted ml-1 font-normal">
                &ldquo;{player.nickname}&rdquo;
              </span>
            )}
          </p>
          <div className="text-foreground-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {player.tierLabel && (
              <span className="inline-flex items-center gap-1 font-medium">
                <i
                  aria-hidden
                  className="inline-block size-[7px] rounded-full"
                  style={{ background: player.tierColor ?? 'var(--foreground-muted)' }}
                />
                {player.tierLabel}
              </span>
            )}
            {shown.length > 0 && (
              <span className="inline-flex items-center gap-1">
                {shown.map((key) => (
                  <BadgeSymbol key={key} badgeKey={key} size={20} />
                ))}
                {extra > 0 && (
                  <span className="bg-surface-muted text-foreground-muted rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                    +{extra}
                  </span>
                )}
              </span>
            )}
            {alreadyHasName && (
              <span className="bg-accent-lime/15 text-accent-lime rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
                Has {alreadyHasName}
              </span>
            )}
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={onOpenPanel}
        aria-label={`${player.name}'s badges`}
        className="text-foreground-muted hover:text-foreground hover:bg-surface-muted -m-1.5 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg"
      >
        <ChevronRight size={18} aria-hidden />
      </button>
    </div>
  );
}
