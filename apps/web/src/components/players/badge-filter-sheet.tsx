'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Medal, X } from 'lucide-react';
import { BADGE_FAMILIES, type BadgeFamily } from '@vouchplay/config';
import {
  clearFilter,
  MAX_BADGE_FILTER_KEYS,
  playerFiltersToQuery,
  type PlayerFilters,
} from '@/lib/players/filters';
import type { BadgeFilterOption } from '@/lib/badges/queries';
import { BadgeSymbol } from '@/components/badges/badge-symbol';
import { BottomSheet } from '@/components/tournaments/manage-sheets';

/**
 * Badge holders filter (master_plan §2BL C): the gold "Badge holders" quick chip plus the bottom
 * sheet it opens. Both live here since they share one piece of state (which sheet is open) that
 * nothing else on the Players tab needs - `QuickChips` (still a server component) just renders
 * `BadgeHoldersChip` as its one client island.
 */

const GOLD_CHIP =
  'border-amber-300 bg-gradient-to-br from-amber-200 to-amber-500 text-amber-950 shadow-[0_0_0_3px_rgba(251,191,36,0.18),0_6px_20px_-8px_rgba(245,158,11,0.8)]';

/** Same neon cyan treatment as the other selected quick chips (§2BL D), reused here for the sheet's
 *  Any/All segmented switch per the lane brief ("selected segment = the neon style"). */
const NEON_SEGMENT =
  'bg-gradient-to-br from-cyan-300 to-cyan-400 text-cyan-950 shadow-[0_0_0_3px_rgba(34,211,238,0.22),0_6px_18px_-6px_rgba(34,211,238,0.7)]';

const FAMILY_ORDER: readonly BadgeFamily[] = ['glory', 'community', 'growth', 'roles', 'special'];

export function BadgeHoldersChip({
  current,
  compact,
  options,
}: {
  current: PlayerFilters;
  compact: boolean;
  /** Catalog + held event badges with live holder counts (§2BL C `getBadgeFilterOptions`) - already
   *  filtered to what a viewer may pick from; the caller only renders this chip when non-empty. */
  options: BadgeFilterOption[];
}) {
  const [open, setOpen] = useState(false);
  const badges = current.badges ?? [];
  const applied = badges.length > 0;
  const clearHref = `/players${playerFiltersToQuery(
    clearFilter({ ...current, page: 1 }, 'badges'),
    {
      compact,
      page: 1,
    },
  )}`;

  return (
    <>
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border py-1.5 pr-1.5 pl-3 text-xs font-bold whitespace-nowrap ${GOLD_CHIP} ${
          applied ? '' : 'vp-badge-chip-sheen'
        }`}
      >
        {/* Tapping the chip BODY opens/reopens the sheet; the ✕ (applied state only) clears via a
            plain link so it works without a client round trip through the sheet at all. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="relative z-[1] inline-flex items-center gap-1.5"
        >
          {applied ? (
            <>
              <span className="inline-flex items-center" aria-hidden>
                {badges.slice(0, 3).map((key, i) => (
                  <span key={key} className={i > 0 ? '-ml-2' : undefined}>
                    <BadgeSymbol badgeKey={key} size={18} />
                  </span>
                ))}
              </span>
              {badges.length} badge{badges.length === 1 ? '' : 's'}
            </>
          ) : (
            <>
              <Medal size={14} aria-hidden />
              Badge holders
            </>
          )}
        </button>
        {applied && (
          <Link
            href={clearHref}
            aria-label="Clear badge filter"
            className="relative z-[1] inline-flex h-5 w-5 items-center justify-center rounded-full opacity-70 hover:opacity-100"
          >
            <X size={12} strokeWidth={3} aria-hidden />
          </Link>
        )}
      </span>
      {open && (
        <BadgeFilterSheet
          current={current}
          compact={compact}
          options={options}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function BadgeTile({
  option,
  selected,
  onToggle,
}: {
  option: BadgeFilterOption;
  selected: boolean;
  onToggle: () => void;
}) {
  const empty = option.holders === 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={empty}
      aria-pressed={selected}
      className={`relative flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-center transition-colors disabled:cursor-not-allowed ${
        empty
          ? 'border-border bg-surface text-foreground-muted opacity-40'
          : selected
            ? 'text-foreground border-amber-400 bg-amber-400/10 ring-2 ring-amber-400'
            : 'border-border bg-surface text-foreground hover:border-amber-300/70'
      }`}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute top-1 right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-amber-950"
        >
          <Check size={10} strokeWidth={3} />
        </span>
      )}
      <BadgeSymbol badgeKey={option.key} size={40} />
      <span className="text-[11px] leading-tight font-bold">{option.name}</span>
      <span className="text-foreground-muted text-[10px] font-semibold">
        {empty ? 'None yet' : `${option.holders} player${option.holders === 1 ? '' : 's'}`}
      </span>
    </button>
  );
}

export function BadgeFilterSheet({
  current,
  compact,
  options,
  onClose,
}: {
  current: PlayerFilters;
  compact: boolean;
  options: BadgeFilterOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(current.badges ?? []);
  const [matchAll, setMatchAll] = useState<boolean>(current.badgeMatch === 'all');

  function toggle(option: BadgeFilterOption) {
    if (option.holders === 0) return;
    setSelected((prev) => {
      if (prev.includes(option.key)) return prev.filter((k) => k !== option.key);
      if (prev.length >= MAX_BADGE_FILTER_KEYS) return prev;
      return [...prev, option.key];
    });
  }

  function clearAll() {
    setSelected([]);
    setMatchAll(false);
  }

  function apply() {
    const next: PlayerFilters = {
      ...current,
      badges: selected.length > 0 ? selected : undefined,
      badgeMatch: matchAll && selected.length > 0 ? 'all' : undefined,
      page: 1,
    };
    router.push(`/players${playerFiltersToQuery(next, { compact, page: 1 })}`, { scroll: false });
    onClose();
  }

  // Honest count (lane brief): exact only for a single selection (n = that badge's own holder
  // count); a union or intersection of several badges cannot be summed from per-badge counts alone
  // without another DB round trip, so 2+ selections get the generic label rather than a wrong number.
  const showLabel =
    selected.length === 1
      ? `Show ${options.find((o) => o.key === selected[0])?.holders ?? 0} players`
      : 'Show players';

  const grouped = FAMILY_ORDER.map((family) => ({
    family,
    label: BADGE_FAMILIES[family].name,
    items: options.filter((o) => o.family === family),
  })).filter((g) => g.items.length > 0);

  return (
    <BottomSheet
      title="Filter by badges"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={clearAll}
            disabled={selected.length === 0}
            className="text-foreground-muted hover:text-foreground min-h-11 px-2 text-sm font-medium disabled:opacity-40"
          >
            Clear{selected.length > 0 ? ` (${selected.length})` : ''}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={selected.length === 0}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-amber-200 to-amber-500 px-4 text-sm font-bold text-amber-950 shadow-[0_6px_20px_-8px_rgba(245,158,11,0.8)] disabled:opacity-50"
          >
            {showLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="border-border bg-surface-muted grid grid-cols-2 gap-1 rounded-xl border p-1">
            <button
              type="button"
              onClick={() => setMatchAll(false)}
              aria-pressed={!matchAll}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                !matchAll ? NEON_SEGMENT : 'text-foreground-muted'
              }`}
            >
              Any of these
            </button>
            <button
              type="button"
              onClick={() => setMatchAll(true)}
              aria-pressed={matchAll}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                matchAll ? NEON_SEGMENT : 'text-foreground-muted'
              }`}
            >
              All of these
            </button>
          </div>
          <p className="text-foreground-muted mt-2 text-xs">
            {matchAll
              ? 'Players with every selected badge.'
              : 'Players with at least one selected badge.'}
          </p>
        </div>

        {grouped.map((g) => (
          <div key={g.family}>
            <h3 className="text-foreground-muted mb-2 text-[11px] font-bold tracking-wider uppercase">
              {g.label}
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {g.items.map((o) => (
                <BadgeTile
                  key={o.key}
                  option={o}
                  selected={selected.includes(o.key)}
                  onToggle={() => toggle(o)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
