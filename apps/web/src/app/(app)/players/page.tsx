import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getViewerContext, getMyProfile } from '@/lib/auth';
import {
  getDirectoryCityOptions,
  getDirectoryClubOptions,
  listPlayers,
} from '@/lib/players/queries';
import {
  getStaffTournamentOptions,
  listManagedTournaments,
  type TournamentOption,
} from '@/lib/tournaments/queries';
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
import { SortSelect } from '@/components/players/sort-select';
import { RememberListUrl } from '@/components/players/list-return';
import { Pagination } from '@/components/ui/pagination';
import { SignupWall } from '@/components/ui/signup-wall';
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
  const { players: allPlayers, total, page, pageCount } = await listPlayers(filters, viewer);
  // Signup wall (master_plan §2AH): anonymous visitors get a taste - the first 10 players, compact,
  // no pagination - then one warm prompt to join. Signed-in visitors are byte-identical to before.
  const players = authed ? allPlayers : allPlayers.slice(0, 10);
  return (
    <div className="space-y-5">
      {/* Records the exact list URL (filters/sort/page) so a later "Back to players" or Players-tab
          tap can restore this same view after a vouch-and-return trip (master_plan §2AG A1). */}
      <RememberListUrl />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-foreground-muted text-sm" aria-live="polite">
          {authed
            ? total === 0
              ? 'No players match your search yet.'
              : `${total} player${total === 1 ? '' : 's'}`
            : `A few of our ${total.toLocaleString()}+ players`}
        </p>
        {/* Sort and view controls are signed-in features - a guest sees a fixed compact preview. */}
        {authed && (
          <div className="flex flex-wrap items-center gap-2">
            <SortSelect sort={filters.sort ?? 'new_unvouched'} staff={viewer.isStaff} />
            <PlayerViewToggle compact={compact} />
          </div>
        )}
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

      {authed ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          hrefFor={(n) => `/players${playerFiltersToQuery(filters, { page: n, compact })}`}
          label="Player pages"
        />
      ) : (
        <SignupWall
          title="See every player"
          message={`Sign up to search ${total.toLocaleString()}+ players, filter, and open profiles.`}
          next="/players"
        />
      )}
    </div>
  );
}

export default async function PlayersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const viewer = await getViewerContext();
  // Parsing, serialising and describing filters all live in one pure module, so the URL, the chips
  // and the pagination links cannot drift apart (master_plan §2B). `staff` gates `sort=sts_desc`
  // (D3, §8.4) - a non-staff request for it is silently coerced back to the public default.
  const filters: PlayerFilters = parsePlayerFilters(sp, { staff: viewer.isStaff });
  const authed = viewer.viewerId !== null;
  // Guest teaser order (master_plan §2AH): a signed-out visitor sees the first 10 by MOST VOUCHED, so
  // the preview shows real, well-established players rather than empty new profiles. Signed-in users
  // keep the "New & unvouched first" default (and their own chosen sort); a guest has no sort control
  // anyway, so this only ever sets what the ten preview cards are.
  if (!authed) filters.sort = 'most_vouched';
  // Compact is the default directory view (§1S): a directory is for scanning names, and the
  // detailed card spends a whole screen on three players. Detailed keeps its existing URL. Anonymous
  // visitors get the fixed compact preview (master_plan §2AH) - the view toggle is hidden for them,
  // so the skeleton and the cards stay compact even if `?view=detailed` is typed manually.
  const compact = authed ? one(sp.view) !== 'detailed' : true;
  const [cityOptions, clubOptions, tournamentOptions] = await Promise.all([
    getDirectoryCityOptions(),
    getDirectoryClubOptions(),
    // The tournament filter (§2AG A4, D7) is offered only to staff or a tournament's own
    // organizers - everyone else gets an empty list, and `SearchFilters` hides the control
    // entirely when it is empty. The server-side gate in `listPlayers` is authoritative either
    // way; this is only about which options make sense to SHOW.
    viewer.isStaff
      ? getStaffTournamentOptions()
      : authed
        ? listManagedTournaments(viewer.viewerId as string, {}).then((rows): TournamentOption[] =>
            rows.map((t) => ({ id: t.id, name: t.name })),
          )
        : Promise.resolve<TournamentOption[]>([]),
  ]);
  // The entry card names the current leader, so it needs the board it points at. Cached read; a
  // failure here must never take down the directory, so it degrades to the invitation variant.
  const leaders = await getLeaderboardSettings()
    .then((settings) =>
      settings.enabled ? getLeaderboard('community', 'global', null, 'all_time', 3) : null,
    )
    .catch(() => null);
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

      {/* Search, filters, sort and the availability card are signed-in features (master_plan §2AH):
          a guest sees the header, the leaders card and a fixed 10-player preview, nothing to tune. */}
      {authed && (
        <SearchFilters
          current={filters}
          cityOptions={cityOptions}
          clubOptions={clubOptions}
          tournamentOptions={tournamentOptions}
          compact={compact}
        />
      )}

      {/* Keyed on the filters + view so any search/filter/sort/page/view change remounts the
          boundary and shows the skeleton while the new query resolves (§2Z, §2AG A1 - `sort` is a
          field on `filters`, so it is already covered by this same JSON key). The shell above stays
          put. */}
      <Suspense
        key={`${JSON.stringify(filters)}|${compact ? 'c' : 'd'}`}
        fallback={<PlayerListSkeleton compact={compact} />}
      >
        <PlayersResults filters={filters} viewer={viewer} compact={compact} authed={authed} />
      </Suspense>
    </div>
  );
}
