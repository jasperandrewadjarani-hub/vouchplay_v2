'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BADGE_FAMILIES, BADGE_METALS, badgeDef, isEventBadgeKey } from '@vouchplay/config';
import type { BadgeView, BadgeActionResult } from '@/lib/badges/types';
import { formatDate } from '@/lib/format-date';
import { pinMyBadge, setMyBadgeHidden } from '@/lib/actions/badges';
import { BottomSheet } from '@/components/tournaments/manage-sheets';
import { BadgeSymbol } from './badge-symbol';

const RARITY_COLOR: Record<string, string> = {
  common: 'text-foreground-muted',
  rare: 'text-primary',
  epic: 'text-accent-cyan',
  legendary: 'text-warning',
};

/**
 * Badge detail sheet (master_plan §2BK E): the story behind the symbol, plus owner-only Pin/Hide
 * actions. Built on the shared `BottomSheet` (tournaments/manage-sheets.tsx) rather than duplicating
 * its shell - it already wires `useBackToClose`, Escape, scroll-lock and the bottom-on-phone /
 * centered-on-desktop layout.
 */
export function BadgeDetailSheet({
  badge,
  isOwner,
  pinnedKey,
  holderCount,
  onClose,
}: {
  badge: BadgeView;
  isOwner: boolean;
  pinnedKey: string | null;
  holderCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const def = badgeDef(badge.key);
  if (!def) return null; // unknown/retired key - nothing sensible to render

  const isEvent = isEventBadgeKey(badge.key);
  const metal = BADGE_METALS[def.metal];
  const isPinned = pinnedKey === badge.key;
  const eventText = badge.meta.event ?? (isEvent ? badge.meta.label : undefined);
  const why = [def.summary, eventText, badge.meta.division].filter(Boolean).join(' · ');

  const facts: { label: string; value: string }[] = [];
  if (eventText) facts.push({ label: 'Event', value: eventText });
  if (badge.meta.division) facts.push({ label: 'Division', value: badge.meta.division });
  facts.push({ label: 'Earned', value: formatDate(badge.awardedAt) });
  facts.push({ label: 'Held by', value: `${holderCount} player${holderCount === 1 ? '' : 's'}` });

  function run(fn: () => Promise<BadgeActionResult>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <BottomSheet title={badge.name} onClose={onClose}>
      <div className="flex flex-col items-center pb-2 text-center">
        <div className="relative mb-2 grid place-items-center">
          <span
            aria-hidden
            className="pointer-events-none absolute h-[150px] w-[150px] rounded-full"
            style={{ background: `radial-gradient(circle, ${metal[1]}48, transparent 65%)` }}
          />
          <BadgeSymbol
            badgeKey={badge.key}
            size={120}
            number={badge.meta.number}
            className="relative"
          />
        </div>
        <span
          className={`text-[11px] font-bold tracking-wide uppercase ${RARITY_COLOR[def.rarity]}`}
        >
          {def.rarity.charAt(0).toUpperCase() + def.rarity.slice(1)} ·{' '}
          {BADGE_FAMILIES[def.family].name}
        </span>
        <h3 className="text-foreground mt-1 text-2xl font-bold tracking-tight">{badge.name}</h3>
        <p className="text-foreground-muted mt-1.5 text-sm">{why}</p>

        <dl className="mt-4 grid w-full grid-cols-2 gap-2 text-left">
          {facts.map((f) => (
            <div key={f.label} className="border-border bg-background rounded-xl border p-2.5">
              <dt className="text-foreground-muted text-[10.5px] font-bold tracking-wide uppercase">
                {f.label}
              </dt>
              <dd className="text-foreground text-sm font-semibold">{f.value}</dd>
            </div>
          ))}
        </dl>

        {isOwner && (
          <div className="mt-4 flex w-full flex-col gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => pinMyBadge(isPinned ? null : badge.key))}
              className="vp-gradient inline-flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-bold text-white disabled:opacity-50"
            >
              {isPinned ? 'Unpin' : '★ Pin to my card'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setMyBadgeHidden(badge.id, !badge.hidden))}
              className="border-border text-foreground hover:bg-surface-muted inline-flex min-h-11 w-full items-center justify-center rounded-xl border text-sm font-semibold disabled:opacity-50"
            >
              {badge.hidden ? 'Show on profile' : 'Hide from profile'}
            </button>
            {error && (
              <p className="text-danger text-xs" aria-live="polite">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
