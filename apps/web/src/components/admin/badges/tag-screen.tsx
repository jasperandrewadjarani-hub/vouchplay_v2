'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Loader2, Plus, Search, X } from 'lucide-react';
import { badgeDef, SKILL_BANDS } from '@vouchplay/config';
import { BadgeSymbol } from '@/components/badges/badge-symbol';
import type { CityOption } from '@/lib/players/filters';
import { adminListPlayersForBadgeTagging } from '@/lib/actions/badges';
import type { AdminBadgeTagPlayer } from '@/lib/admin/user-queries';
import { PlayerRow } from './player-row';
import { BadgeGridSheet } from './badge-grid-sheet';
import { ReviewSheet } from './review-sheet';
import { PlayerBadgesSheet } from './player-badges-sheet';

const PAGE_SIZE = 30;

/** master_plan §2BL Decision D: the neon-cyan selected style, unmistakable in both themes. */
const NEON_SELECTED =
  'border-cyan-200 bg-gradient-to-br from-cyan-300 to-cyan-400 text-cyan-950 shadow-[0_0_0_3px_rgba(34,211,238,0.22),0_6px_18px_-6px_rgba(34,211,238,0.7)]';
const CHIP_BASE =
  'inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition-colors';
const CHIP_UNSELECTED = 'border-border bg-surface text-foreground-muted hover:text-foreground';

interface Filters {
  q: string;
  tier: number | null;
  city: string | null;
  noBadges: boolean;
  selectedOnly: boolean;
}

/**
 * Admin → Badges "Tag" tab (master_plan §2BL E): one screen replacing the old search-first flow. A
 * sticky "Badges to tag" tray above a searchable/filterable player list with multi-select checkboxes,
 * and a sticky bottom action bar leading to the review sheet. Selection lives in client state keyed
 * by player id (with just enough player info for the review sheet's own list and "has X" notes) so it
 * survives every search/filter/page change - the server round trip only ever replaces `players`.
 */
export function TagScreen({
  initialPlayers,
  initialTotal,
  cityOptions,
  initialQ,
}: {
  initialPlayers: AdminBadgeTagPlayer[];
  initialTotal: number;
  cityOptions: CityOption[];
  initialQ: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(initialQ);
  const [filters, setFilters] = useState<Filters>({
    q: initialQ,
    tier: null,
    city: null,
    noBadges: false,
    selectedOnly: false,
  });
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [players, setPlayers] = useState<AdminBadgeTagPlayer[]>(initialPlayers);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selectedBadgeKeys, setSelectedBadgeKeys] = useState<string[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<Map<string, AdminBadgeTagPlayer>>(
    new Map(),
  );

  const [badgeSheetOpen, setBadgeSheetOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Debounce the search box into `filters.q`, and mirror it in the URL for shareability
  // (master_plan §2BL E: "search input (debounced → URL q)").
  function onQChange(next: string) {
    setQ(next);
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => {
      setFilters((f) => ({ ...f, q: next.trim() }));
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'tag');
      if (next.trim()) params.set('q', next.trim());
      else params.delete('q');
      router.replace(`/admin/badges?${params.toString()}`, { scroll: false });
    }, 300);
  }

  // "Selected (n)" is a pure client-side view over `selectedPlayers` - no round trip, always in sync
  // with the tray, and never at risk of a stale server snapshot of a selection that lives here anyway.
  const runQuery = useCallback(async (targetPage: number, f: Filters) => {
    if (targetPage === 1) setLoading(true);
    else setLoadingMore(true);
    const res = await adminListPlayersForBadgeTagging({
      q: f.q || undefined,
      tier: f.tier ?? undefined,
      city: f.city ?? undefined,
      noBadges: f.noBadges || undefined,
      page: targetPage,
      pageSize: PAGE_SIZE,
    });
    if (res.ok) {
      setPlayers((prev) => (targetPage === 1 ? res.players : [...prev, ...res.players]));
      setTotal(res.total);
      setPage(targetPage);
    }
    setLoading(false);
    setLoadingMore(false);
  }, []);

  // Refetch page 1 whenever a server-side filter changes. `selectedOnly` is excluded - it only
  // switches which array renders below, it never hits the server. Skips the very first render
  // (initialPlayers already covers the default, filter-less first page).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    void runQuery(1, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.tier, filters.city, filters.noBadges]);

  function toggleTier(ordinal: number) {
    setFilters((f) => ({ ...f, tier: f.tier === ordinal ? null : ordinal }));
  }
  function toggleCity(key: string) {
    setFilters((f) => ({ ...f, city: f.city === key ? null : key }));
  }
  function toggleNoBadges() {
    setFilters((f) => ({ ...f, noBadges: !f.noBadges }));
  }
  function toggleSelectedOnly() {
    setFilters((f) => ({ ...f, selectedOnly: !f.selectedOnly }));
  }

  function togglePlayer(p: AdminBadgeTagPlayer) {
    setSelectedPlayers((prev) => {
      const next = new Map(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.set(p.id, p);
      return next;
    });
  }
  function removePlayer(id: string) {
    setSelectedPlayers((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }
  function clearAll() {
    setSelectedBadgeKeys([]);
    setSelectedPlayers(new Map());
  }

  function handleRowChanged() {
    // A tag/untag from the chevron sheet can change a row's badges/pill; the simplest correct
    // refresh is to re-run the current query at page 1 (Load more state resets, same as a filter
    // change would).
    void runQuery(1, filters);
  }

  const selectedList = Array.from(selectedPlayers.values());
  const badgeCount = selectedBadgeKeys.length;
  const playerCount = selectedList.length;
  const canReview = badgeCount > 0 && playerCount > 0;
  const displayedPlayers = filters.selectedOnly ? selectedList : players;

  return (
    <div className="relative pb-40 md:pb-4">
      {/* Badges to tag tray */}
      <div className="sticky top-0 z-10 mb-3 rounded-2xl border border-amber-300/40 bg-amber-400/5 p-3 backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-bold tracking-wide text-amber-600 uppercase dark:text-amber-400">
            Badges to tag
          </h2>
          {badgeCount > 0 && (
            <button
              type="button"
              onClick={() => setSelectedBadgeKeys([])}
              className="text-foreground-muted hover:text-foreground text-xs font-semibold"
            >
              Clear
            </button>
          )}
        </div>
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
          {selectedBadgeKeys.map((key) => (
            <BadgeTrayChip
              key={key}
              badgeKey={key}
              onRemove={() => setSelectedBadgeKeys((prev) => prev.filter((k) => k !== key))}
            />
          ))}
          <button
            type="button"
            onClick={() => setBadgeSheetOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-amber-400 px-3 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400"
          >
            <Plus size={14} aria-hidden />
            Add badge
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-2">
        <div className="border-border bg-surface flex min-h-11 items-center gap-2 rounded-xl border px-3">
          <Search className="text-foreground-muted size-4 shrink-0" aria-hidden />
          <input
            value={q}
            onChange={(e) => onQChange(e.target.value)}
            placeholder="Search players by name or nickname"
            aria-label="Search players"
            className="text-foreground placeholder:text-foreground-muted w-full bg-transparent py-2 text-sm focus:outline-none"
          />
          {loading && (
            <Loader2 className="text-foreground-muted size-4 shrink-0 animate-spin" aria-hidden />
          )}
        </div>
      </div>

      {/* Quick filter chips */}
      <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1">
        {SKILL_BANDS.map((band) => (
          <button
            key={band.key}
            type="button"
            aria-pressed={filters.tier === band.ordinal}
            onClick={() => toggleTier(band.ordinal)}
            className={`${CHIP_BASE} ${filters.tier === band.ordinal ? NEON_SELECTED : CHIP_UNSELECTED}`}
          >
            {filters.tier === band.ordinal && <Check size={12} strokeWidth={3} aria-hidden />}
            {band.label}
          </button>
        ))}
        {cityOptions.slice(0, 8).map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={filters.city === c.key}
            onClick={() => toggleCity(c.key)}
            className={`${CHIP_BASE} ${filters.city === c.key ? NEON_SELECTED : CHIP_UNSELECTED}`}
          >
            {filters.city === c.key && <Check size={12} strokeWidth={3} aria-hidden />}
            {c.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={filters.noBadges}
          onClick={toggleNoBadges}
          className={`${CHIP_BASE} ${filters.noBadges ? NEON_SELECTED : CHIP_UNSELECTED}`}
        >
          {filters.noBadges && <Check size={12} strokeWidth={3} aria-hidden />}
          No badges yet
        </button>
        <button
          type="button"
          aria-pressed={filters.selectedOnly}
          onClick={toggleSelectedOnly}
          disabled={playerCount === 0}
          className={`${CHIP_BASE} disabled:opacity-40 ${filters.selectedOnly ? NEON_SELECTED : CHIP_UNSELECTED}`}
        >
          {filters.selectedOnly && <Check size={12} strokeWidth={3} aria-hidden />}
          Selected ({playerCount})
        </button>
      </div>

      <p className="text-foreground-muted mb-2 text-xs">
        <b className="text-foreground">{playerCount}</b> selected · {total} player
        {total === 1 ? '' : 's'}
      </p>

      {/* Player list */}
      <div className="space-y-2">
        {loading && displayedPlayers.length === 0 && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="text-foreground-muted size-5 animate-spin" aria-hidden />
          </div>
        )}
        {!loading && displayedPlayers.length === 0 && (
          <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-6 text-center text-sm">
            {filters.selectedOnly ? 'No players selected yet.' : 'No players match these filters.'}
          </p>
        )}
        {displayedPlayers.map((p) => (
          <PlayerRow
            key={p.id}
            player={selectedPlayers.get(p.id) ?? p}
            selected={selectedPlayers.has(p.id)}
            chosenBadgeKeys={selectedBadgeKeys}
            onToggle={() => togglePlayer(p)}
            onOpenPanel={() => setOpenPlayerId(p.id)}
          />
        ))}
        {!filters.selectedOnly && players.length > 0 && players.length < total && (
          <button
            type="button"
            onClick={() => void runQuery(page + 1, filters)}
            disabled={loadingMore}
            className="border-border text-foreground hover:border-primary min-h-[44px] w-full rounded-xl border text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>

      {/* Sticky action bar - fixed above the mobile bottom nav (which hides at `md`, same as here);
          `md`+ it sits in normal flow, `sticky` to the bottom of the viewport like a form footer. */}
      <div className="border-border bg-surface fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t px-4 pt-3 pb-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] md:sticky md:bottom-0 md:rounded-2xl md:border md:pb-3 md:shadow-none">
        <div className="text-foreground-muted mb-2 flex items-center justify-between text-xs">
          <span>
            <b className="text-foreground">{badgeCount}</b> badge{badgeCount === 1 ? '' : 's'} ·{' '}
            <b className="text-foreground">{playerCount}</b> player{playerCount === 1 ? '' : 's'}
          </span>
          <span>{badgeCount * playerCount} tags</span>
        </div>
        <button
          type="button"
          disabled={!canReview}
          onClick={() => setReviewOpen(true)}
          className="vp-gradient min-h-[44px] w-full rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
        >
          Review and tag →
        </button>
      </div>

      {toast && (
        <div className="fixed inset-x-4 bottom-40 z-30 md:right-4 md:bottom-4 md:left-auto md:w-80">
          <div className="bg-success/15 text-success border-success/30 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg">
            {toast}
          </div>
        </div>
      )}

      {badgeSheetOpen && (
        <BadgeGridSheet
          selectedKeys={selectedBadgeKeys}
          onDone={setSelectedBadgeKeys}
          onClose={() => setBadgeSheetOpen(false)}
        />
      )}

      {reviewOpen && (
        <ReviewSheet
          chosenBadgeKeys={selectedBadgeKeys}
          selectedPlayers={selectedList}
          onRemovePlayer={removePlayer}
          onClose={() => setReviewOpen(false)}
          onSubmitted={(message) => {
            setReviewOpen(false);
            clearAll();
            setToast(message);
            setTimeout(() => setToast(null), 5000);
            router.refresh();
            void runQuery(1, filters);
          }}
        />
      )}

      {openPlayerId && (
        <PlayerBadgesSheet
          playerId={openPlayerId}
          onClose={() => setOpenPlayerId(null)}
          onChanged={handleRowChanged}
        />
      )}
    </div>
  );
}

function BadgeTrayChip({ badgeKey, onRemove }: { badgeKey: string; onRemove: () => void }) {
  return (
    <span className="bg-surface border-border flex shrink-0 items-center gap-1.5 rounded-full border py-1 pr-2 pl-1">
      <BadgeSymbol badgeKey={badgeKey} size={26} />
      <BadgeName badgeKey={badgeKey} />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove badge"
        className="text-foreground-muted hover:text-danger"
      >
        <X size={14} aria-hidden />
      </button>
    </span>
  );
}

function BadgeName({ badgeKey }: { badgeKey: string }) {
  const def = badgeDef(badgeKey);
  return (
    <span className="text-foreground text-xs font-semibold whitespace-nowrap">
      {def?.name ?? badgeKey}
    </span>
  );
}
