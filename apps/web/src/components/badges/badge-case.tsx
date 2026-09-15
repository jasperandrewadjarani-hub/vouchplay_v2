'use client';

import { useState } from 'react';
import { badgeDef, isEventBadgeKey } from '@vouchplay/config';
import type { BadgeCase, BadgeView } from '@/lib/badges/types';
import { formatShortMonthYear } from '@/lib/format-date';
import { BadgeSymbol } from './badge-symbol';
import { BadgeDetailSheet } from './badge-detail-sheet';

/**
 * Profile badge case (master_plan §2BK E): earned grid, "Almost there" progress (owner only),
 * "Past" shelf (owner only). Tapping any badge opens the detail sheet.
 */
export function BadgeCaseSection({
  badgeCase,
  isOwner,
  holderCounts,
}: {
  badgeCase: BadgeCase;
  isOwner: boolean;
  holderCounts: Record<string, number>;
}) {
  const [selected, setSelected] = useState<BadgeView | null>(null);
  const [showPast, setShowPast] = useState(false);
  const { earned, past, progress, pinnedKey } = badgeCase;

  if (earned.length === 0) {
    // Others never see an empty case - the section is omitted entirely rather than showing "0 badges".
    if (!isOwner) return null;
    return (
      <section className="border-border bg-surface rounded-2xl border p-4">
        <h2 className="text-foreground text-base font-semibold">Badges</h2>
        <p className="text-foreground-muted mt-2 text-sm">
          Earn your first badge by getting vouched or playing a tournament.
        </p>
      </section>
    );
  }

  return (
    <section className="border-border bg-surface rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-foreground text-base font-semibold">Badges</h2>
        <span className="text-foreground-muted text-xs tabular-nums">{earned.length} earned</span>
      </div>

      <div className="grid grid-cols-3 gap-2 min-[360px]:grid-cols-4">
        {earned.map((b) => (
          <BadgeSlot key={b.id} badge={b} onSelect={() => setSelected(b)} />
        ))}
      </div>

      {isOwner && progress.length > 0 && (
        <div className="mt-5">
          <h3 className="text-foreground-muted mb-2 text-[11px] font-bold tracking-wide uppercase">
            Almost there
          </h3>
          <div className="flex flex-col gap-2">
            {progress.map((p) => (
              <div
                key={p.key}
                className="border-border bg-background flex items-center gap-3 rounded-xl border p-2.5"
              >
                <BadgeSymbol badgeKey={p.key} size={40} muted title={p.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm font-semibold">{p.name}</p>
                  <p className="text-foreground-muted mt-0.5 text-xs">{p.hint}</p>
                  <span className="bg-surface-muted mt-1.5 block h-1.5 overflow-hidden rounded-full">
                    <span
                      className="vp-gradient block h-full rounded-full"
                      style={{ width: `${Math.max(0, Math.min(100, p.pct))}%` }}
                    />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isOwner && past.length > 0 && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            aria-expanded={showPast}
            className="text-primary inline-flex min-h-11 items-center text-xs font-semibold"
          >
            {showPast ? 'Hide' : 'Show'} past badges ({past.length})
          </button>
          {showPast && (
            <div className="mt-2 grid grid-cols-3 gap-2 min-[360px]:grid-cols-4">
              {past.map((b) => (
                <BadgeSlot key={b.id} badge={b} onSelect={() => setSelected(b)} muted />
              ))}
            </div>
          )}
        </div>
      )}

      {selected && (
        <BadgeDetailSheet
          badge={selected}
          isOwner={isOwner}
          pinnedKey={pinnedKey}
          holderCount={holderCounts[selected.key] ?? 0}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}

function BadgeSlot({
  badge,
  onSelect,
  muted = false,
}: {
  badge: BadgeView;
  onSelect: () => void;
  muted?: boolean;
}) {
  const caption = captionFor(badge);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-h-11 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center focus-visible:outline-2 focus-visible:outline-offset-2 ${
        badge.pinned
          ? 'bg-warning/10 outline-warning/40 outline outline-1'
          : 'hover:bg-surface-muted'
      } ${badge.hidden || muted ? 'opacity-60' : ''}`}
    >
      <BadgeSymbol badgeKey={badge.key} size={52} title={badge.name} muted={muted} />
      <span className="text-foreground w-full truncate text-[10.5px] font-bold">{badge.name}</span>
      <span className="text-foreground-muted text-[9.5px] font-semibold">{caption}</span>
    </button>
  );
}

function captionFor(b: BadgeView): string {
  // `hidden` only ever comes back true in the owner's own views (BadgeView docstring), so no extra
  // isOwner gate is needed here.
  if (b.hidden) return 'Hidden';
  if (b.pinned) return '★ Pinned';
  if (b.tally > 1) return `×${b.tally}`;
  if (isEventBadgeKey(b.key)) return b.meta.label ?? badgeDef(b.key)?.name ?? 'Event';
  return formatShortMonthYear(b.awardedAt);
}
