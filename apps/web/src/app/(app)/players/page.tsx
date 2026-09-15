import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SKILL_BANDS, skillByOrdinal } from '@vouchplay/config';
import { getViewerContext, getMyProfile } from '@/lib/auth';
import {
  getDirectoryCityOptions,
  getDirectoryClubOptions,
  getDirectoryPlayerCount,
  listPlayers,
} from '@/lib/players/queries';
import {
  getStaffTournamentOptions,
  listManagedTournaments,
  type TournamentOption,
} from '@/lib/tournaments/queries';
import {
  describeBadgeFilter,
  parsePlayerFilters,
  playerFiltersToQuery,
  normalizeCityKey,
  type PlayerFilters,
  type SearchParamRecord,
} from '@/lib/players/filters';
import type { ViewerContext } from '@/lib/players/dto';
import { PlayerCard } from '@/components/players/player-card';
import { PlayerListSkeleton } from '@/components/players/player-list-skeleton';
import { SearchFilters } from '@/components/players/search-filters';
import { QuickChips } from '@/components/players/quick-chips';
import { QuickBar } from '@/components/players/quick-bar';
import { YourGameCard } from '@/components/players/your-game-card';
import { getPartnerLookingStrip } from '@/lib/partners/deck';
import { getBadgeFilterOptions, getViewerGame, type BadgeFilterOption } from '@/lib/badges/queries';
import { PlayerViewToggle } from '@/components/players/player-view-toggle';
import { SortSelect } from '@/components/players/sort-select';
import { RememberListUrl } from '@/components/players/list-return';
import {
  PlayersNavProvider,
  PlayersListFrame,
  PlayersPagination,
} from '@/components/players/players-nav';
import { SignupWall } from '@/components/ui/signup-wall';
import {
  getLeaderboardSettings,
  getProfileVisibilityFlags,
  getPartnerSettings,
  loadSettingFlag,
} from '@/lib/settings';
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
  staffLinks,
  showCommunitySkill,
  ownSlug,
  badgeOptions,
}: {
  filters: PlayerFilters;
  viewer: ViewerContext;
  compact: boolean;
  authed: boolean;
  /** Staff-only "Activity" entry point on every card (master_plan §2AN decision 6) - derived from
   *  `viewer.isStaff` up in the page, never from the player DTO. */
  staffLinks: boolean;
  /** §2AO E: `profile_show_community_skill` (or staff), computed once per page - see the page
   *  component below. */
  showCommunitySkill: boolean;
  /** The signed-in viewer's own slug (already loaded by the page for the availability card, so this
   *  is free) - their OWN card keeps the community chip even when the toggle hides it from other
   *  players (master_plan §2AO E: the flag hides the chip from OTHER players, not its owner). */
  ownSlug: string | null;
  /** Badge names for the "{n} players with X, Y or Z" count line (§2BL C, item 7) - empty for a
   *  signed-out viewer, harmless either way since `filters.badges` is a signed-in-only affordance. */
  badgeOptions: BadgeFilterOption[];
}) {
  const { players: allPlayers, total, page, pageCount } = await listPlayers(filters, viewer);
  // Signup wall (master_plan §2AH): anonymous visitors get a taste - the first 10 players, compact,
  // no pagination - then one warm prompt to join. Signed-in visitors are byte-identical to before.
  const players = authed ? allPlayers : allPlayers.slice(0, 10);
  // "15 players with Legend, MVP or OG" (§2BL C item 7) - null when the badge filter is off, in
  // which case the line reads exactly as it always has.
  const badgeDescription = authed ? describeBadgeFilter(filters, badgeOptions) : null;
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
              : `${total} player${total === 1 ? '' : 's'}${badgeDescription ? ` ${badgeDescription}` : ''}`
            : `A few of our ${total.toLocaleString()}+ players`}
        </p>
        {/* Sort and view controls are signed-in features - a guest sees a fixed compact preview.
            Single non-wrapping line (master_plan §2AN decision G) - even a 390px phone has room for
            the compact sort select plus the 40px view-toggle button side by side. */}
        {authed && (
          <div className="flex items-center justify-between gap-2">
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
            <PlayerCard
              key={player.slug}
              player={player}
              authed={authed}
              compact={compact}
              staffLinks={staffLinks}
              showCommunitySkill={showCommunitySkill || player.slug === ownSlug}
              isOwn={player.slug === ownSlug}
            />
          ))}
        </div>
      ) : (
        <div className="border-border bg-surface text-foreground-muted rounded-2xl border p-8 text-center text-sm">
          Try a different name, city, or fewer filters.
        </div>
      )}

      {authed ? (
        <PlayersPagination
          page={page}
          pageCount={pageCount}
          hrefFor={(n) => `/players${playerFiltersToQuery(filters, { page: n, compact })}`}
          label="Player pages"
        />
      ) : (
        <SignupWall
          title={`Unlock ${total.toLocaleString()}+ players`}
          message="Get your own rating card, climb the boards, and find a partner."
          next="/players"
          placeholderRows={2}
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
  // All nine reads below are independent of one another once `viewer`/`authed` are known - only
  // their own internal logic (staff/authed gating) decides whether to do real work at all. They used
  // to run as five separate sequential awaits (master_plan §2BH finding 8: "the Players page added
  // several in §2BC"); one `Promise.all` runs every network round trip concurrently instead of back
  // to back, which is most of the ~0.5s bottom-nav-to-Players delay. Each one already fails open
  // (never rejects) on its own - see `getLeaderboardSettings`/`getMyProfile`/`getPartnerLookingStrip`/
  // `getProfileVisibilityFlags`/`getPartnerSettings`/`loadSettingFlag` - so batching them here changes
  // nothing about error handling, only when they run.
  const [
    cityOptions,
    clubOptions,
    tournamentOptions,
    leaders,
    myProfile,
    profileVisibility,
    partnerLooking,
    partnerSettings,
    staffLinks,
    viewerGame,
    totalPlayers,
    badgeOptions,
  ] = await Promise.all([
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
    // The entry card names the current leader, so it needs the board it points at. Cached read; a
    // failure here must never take down the directory, so it degrades to the invitation variant.
    getLeaderboardSettings()
      .then((settings) =>
        settings.enabled ? getLeaderboard('community', 'global', null, 'all_time', 3) : null,
      )
      .catch(() => null),
    // The viewer's own "looking for a partner" status, so the Players tab can offer a one-tap toggle
    // right where people browse for partners (§2M). Signed-in only.
    authed ? getMyProfile() : Promise.resolve(null),
    // §2AO E: `profile_show_community_skill` (or staff) - computed once for the whole page and
    // passed into every card, never decided in the component.
    getProfileVisibilityFlags(),
    // Where people are looking for a partner right now (master_plan §2AV directory strip). Bounded,
    // cached and fail-open, so it can never take the directory down or slow it materially.
    getPartnerLookingStrip(viewer.viewerId),
    // §2BC: whether the "Find a partner" door exists at all (2-column row when off) - a separate
    // read from the strip itself, since an empty strip and a disabled feature must not look the same.
    getPartnerSettings(),
    // §2BC-D: staff see the "See vouch activity" door only while Admin's switch is on; the
    // /staff/players/[slug] page itself stays reachable by URL regardless (role + step-up gated).
    // Non-staff never make this round trip at all (short-circuited here, same as before).
    viewer.isStaff ? loadSettingFlag('staff_activity_links_enabled', true) : Promise.resolve(false),
    // The "Your game" card (master_plan §2BK F) - the viewer's own tier/STS/rank/progress. Fails
    // open (lane-1 contract, `lib/badges/queries.ts`) - a read error here degrades to no card, never
    // to a broken page. Whether it actually renders also depends on onboarding, checked below once
    // `myProfile` is in hand.
    authed ? getViewerGame(viewer.viewerId as string).catch(() => null) : Promise.resolve(null),
    // The compact header's "{n}+ players" (master_plan §2BK F): a cached head-only count with the
    // directory's own inclusion rules - not a second full directory load. Null hides the number.
    getDirectoryPlayerCount(),
    // Badge filter options for the "Badge holders" quick chip (§2BL C, item 8) - signed-in only; an
    // anonymous visitor never sees the chip (QuickChips itself isn't even rendered for them below),
    // so there is nothing to fetch.
    authed ? getBadgeFilterOptions() : Promise.resolve<BadgeFilterOption[]>([]),
  ]);
  const showCommunitySkill = profileVisibility.showCommunitySkill || viewer.isStaff;
  // §2BC decision A: which state the "Let people find you" / "Find a partner" doors react to - an
  // anonymous or not-yet-onboarded viewer has no profile to toggle, so they get routed elsewhere.
  const onboarded = Boolean(myProfile?.onboarded_at);
  const authDoorState = !authed ? 'anon' : onboarded ? 'onboarded' : 'not_onboarded';

  // Quick chips (master_plan §2BK F "My level"): the viewer's community band ordinal, falling back
  // to self-rated - `viewerGame` only resolves once onboarded, so this is null for everyone else too,
  // which is exactly what hides the chip.
  const myLevelOrdinal =
    (viewerGame?.tier
      ? SKILL_BANDS.find((b) => b.key === viewerGame.tier?.key)?.ordinal
      : undefined) ??
    (typeof myProfile?.self_rated_skill === 'number' ? myProfile.self_rated_skill : null) ??
    null;
  const myLevelLabel =
    viewerGame?.tier?.label ??
    (myLevelOrdinal != null ? (skillByOrdinal(myLevelOrdinal)?.label ?? null) : null);
  const myCityLabel = myProfile?.city ?? null;
  const myCityKey = myCityLabel ? normalizeCityKey(myCityLabel) || null : null;

  return (
    <div className="space-y-5">
      <div className="vp-in flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h1 className="text-foreground text-3xl font-extrabold tracking-tight">
          <span className="vp-gradient-text">Players</span>
        </h1>
        {totalPlayers != null && (
          <span className="text-foreground-muted text-sm">
            {totalPlayers.toLocaleString()}+ players
          </span>
        )}
      </div>

      {/* One slim quick bar - Leaderboards, Find me, Partners - replacing the three tall doors that
          used to sit above the list (master_plan §2BK F). */}
      <QuickBar
        authState={authDoorState}
        board={leaders}
        lookingForPartner={Boolean(myProfile?.looking_for_partner)}
        openForSponsorship={Boolean(myProfile?.open_for_sponsorship)}
        partnerLooking={partnerLooking}
        partnerMatchmakingEnabled={partnerSettings.enabled}
      />

      {/* "Your game" (master_plan §2BK F): signed-in, onboarded, and there is something to show -
          `getViewerGame` (lane 1) is what actually decides eligibility server-side; this is just the
          null-check on its result. */}
      {authed && onboarded && viewerGame && <YourGameCard game={viewerGame} />}

      {/* One shared client transition runs every filter change below - quick chips, badge filter,
          sort, view toggle, pagination and search filters all navigate through it instead of
          freezing the page until the server re-renders (master_plan §2BM B). */}
      <PlayersNavProvider>
        {/* Search, filters, sort and the quick chips are signed-in features (master_plan §2AH): a
            guest sees the header, the quick bar and a fixed 10-player preview, nothing to tune. */}
        {authed && (
          <>
            <SearchFilters
              current={filters}
              cityOptions={cityOptions}
              clubOptions={clubOptions}
              tournamentOptions={tournamentOptions}
              compact={compact}
            />
            <QuickChips
              current={filters}
              compact={compact}
              myLevelOrdinal={myLevelOrdinal}
              myLevelLabel={myLevelLabel}
              myCity={myCityKey}
              myCityLabel={myCityLabel}
              badgeOptions={badgeOptions}
            />
          </>
        )}

        {/* Shows the shared skeleton INSTANTLY while a filter navigation is pending (§2BM B), before
            handing back to the boundary below once the transition resolves. Keyed on the filters +
            view so any search/filter/sort/page/view change remounts the boundary and shows Suspense's
            own fallback for a genuinely slow first paint or direct navigation (§2Z, §2AG A1 - `sort`
            is a field on `filters`, so it is already covered by this same JSON key). The shell above
            stays put either way. */}
        <PlayersListFrame compact={compact}>
          <Suspense
            key={`${JSON.stringify(filters)}|${compact ? 'c' : 'd'}`}
            fallback={<PlayerListSkeleton compact={compact} />}
          >
            <PlayersResults
              filters={filters}
              viewer={viewer}
              compact={compact}
              authed={authed}
              staffLinks={staffLinks}
              showCommunitySkill={showCommunitySkill}
              ownSlug={myProfile?.slug ?? null}
              badgeOptions={badgeOptions}
            />
          </Suspense>
        </PlayersListFrame>
      </PlayersNavProvider>
    </div>
  );
}
