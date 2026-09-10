import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getViewerContext, getMyProfile } from '@/lib/auth';
import {
  getDirectoryCityOptions,
  getDirectoryClubOptions,
  listPlayers,
} from '@/lib/players/queries';
import {
  parsePlayerFilters,
  playerFiltersToQuery,
  type PlayerFilters,
  type SearchParamRecord,
} from '@/lib/players/filters';
import type { ViewerContext } from '@/lib/players/dto';
import { PlayerCard } from '@/components/players/player-card';
import { PlayerListSkeleton } from '@/components/players/player-list-skeleton';
import { SearchFilters } from '@/components/players/search-filters';
import { AvailabilityCard } from '@/components/players/availability-toggles';
import { PlayerViewToggle } from '@/components/players/player-view-toggle';
import { Pagination } from '@/components/ui/pagination';
import { LeaderboardsEntryCard } from '@/components/leaderboards/leaderboards-entry-card';
import { getLeaderboardSettings } from '@/lib/settings';
import { getLeaderboard } from '@/lib/leaderboards/queries';

export const metadata: Metadata = {
  title: 'Players',
  description:
    'Browse the VouchPlay player directory - skill reputations built by community vouches, not self-declaration.',
};

type SP = SearchParamRecord;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * The filtered results, isolated so a Suspense boundary keyed on the filters can show the skeleton
 * while a new query resolves (master_plan §2Z). listPlayers is the only filter-dependent await, so
 * moving it here means the shell (title, top cards, filters) stays on screen and interactive while
 * just the list swaps to preloaded boxes.
 */
async function PlayersResults({
  filters,
  viewer,
  compact,
  authed,
}: {
  filters: PlayerFilters;
  viewer: ViewerContext;
  compact: boolean;
  authed: boolean;
}) {
  const { players, total, page, pageCount } = await listPlayers(filters, viewer);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-foreground-muted text-sm" aria-live="polite">
          {total === 0
            ? 'No players match your search yet.'
            : `${total} player${total === 1 ? '' : 's'}`}
        </p>
        <PlayerViewToggle compact={compact} />
      </div>

      {players.length > 0 ? (
        <div
          className={compact ? 'space-y-2' : 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'}
        >
          {players.map((player) => (
            <PlayerCard key={player.slug} player={player} authed={authed} compact={compact} />
          ))}
        </div>
      ) : (
        <div className="border-border bg-surface text-foreground-muted rounded-2xl border p-8 text-center text-sm">
          Try a different name, city, or fewer filters.
        </div>
      )}

      <Pagination
        page={page}
        pageCount={pageCount}
        hrefFor={(n) => `/players${playerFiltersToQuery(filters, { page: n, compact })}`}
        label="Player pages"
      />
    </div>
  );
}

export default async function PlayersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  // Parsing, serialising and describing filters all live in one pure module, so the URL, the chips
  // and the pagination links cannot drift apart (master_plan §2B).
  const filters: PlayerFilters = parsePlayerFilters(sp);
  // Compact is the default directory view (§1S): a directory is for scanning names, and the
  // detailed card spends a whole screen on three players. Detailed keeps its existing URL.
  const compact = one(sp.view) !== 'detailed';
  const viewer = await getViewerContext();
  const [cityOptions, clubOptions] = await Promise.all([
    getDirectoryCityOptions(),
    getDirectoryClubOptions(),
  ]);
  // The entry card names the current leader, so it needs the board it points at. Cached read; a
  // failure here must never take down the directory, so it degrades to the invitation variant.
  const leaders = await getLeaderboardSettings()
    .then((settings) =>
      settings.enabled ? getLeaderboard('community', 'global', null, 'all_time', 3) : null,
    )
    .catch(() => null);
  const authed = viewer.viewerId !== null;
  // The viewer's own "looking for a partner" status, so the Players tab can offer a one-tap toggle
  // right where people browse for partners (§2M). Signed-in only.
  const myProfile = authed ? await getMyProfile() : null;

  return (
    <div className="space-y-5">
      <div className="vp-in space-y-1">
        <h1 className="text-foreground text-3xl font-extrabold tracking-tight">
          <span className="vp-gradient-text">Players</span>
        </h1>
        <p className="text-foreground-muted text-sm">
          Skill reputations built by the people you actually play with.
        </p>
      </div>

      <LeaderboardsEntryCard board={leaders} />

      {myProfile?.onboarded_at && (
        <AvailabilityCard
          lookingForPartner={Boolean(myProfile.looking_for_partner)}
          openForSponsorship={Boolean(myProfile.open_for_sponsorship)}
        />
      )}

      <SearchFilters
        current={filters}
        cityOptions={cityOptions}
        clubOptions={clubOptions}
        compact={compact}
      />

      {/* Keyed on the filters + view so any search/filter/page/view change remounts the boundary and
          shows the skeleton while the new query resolves (§2Z). The shell above stays put. */}
      <Suspense
        key={`${JSON.stringify(filters)}|${compact ? 'c' : 'd'}`}
        fallback={<PlayerListSkeleton compact={compact} />}
      >
        <PlayersResults filters={filters} viewer={viewer} compact={compact} authed={authed} />
      </Suspense>
    </div>
  );
}
