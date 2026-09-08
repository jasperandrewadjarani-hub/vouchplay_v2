import type { Metadata } from 'next';
import { getViewerContext } from '@/lib/auth';
import { listPlayers, type PlayerFilters } from '@/lib/players/queries';
import { PlayerCard } from '@/components/players/player-card';
import { SearchFilters, type ActiveFilters } from '@/components/players/search-filters';
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

type SP = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseFilters(sp: SP): PlayerFilters {
  const q = one(sp.q);
  const city = one(sp.city);
  const sexRaw = one(sp.sex);
  const sex = sexRaw === 'male' || sexRaw === 'female' ? sexRaw : undefined;
  const minSkillRaw = one(sp.minSkill);
  const minSkillNum = minSkillRaw != null ? Number(minSkillRaw) : NaN;
  const minSkill =
    Number.isInteger(minSkillNum) && minSkillNum >= 0 && minSkillNum <= 6 ? minSkillNum : undefined;
  const pageNum = Number(one(sp.page));
  return {
    q,
    city,
    sex,
    minSkill,
    identityVerified: one(sp.identityVerified) === '1',
    coach: one(sp.coach) === '1',
    lookingForPartner: one(sp.lookingForPartner) === '1',
    openForSponsorship: one(sp.openForSponsorship) === '1',
    page: Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1,
  };
}

function toQueryString(f: PlayerFilters, page: number, compact: boolean): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.city) p.set('city', f.city);
  if (f.sex) p.set('sex', f.sex);
  if (typeof f.minSkill === 'number') p.set('minSkill', String(f.minSkill));
  if (f.identityVerified) p.set('identityVerified', '1');
  if (f.coach) p.set('coach', '1');
  if (f.lookingForPartner) p.set('lookingForPartner', '1');
  if (f.openForSponsorship) p.set('openForSponsorship', '1');
  if (compact) p.set('view', 'compact');
  if (page > 1) p.set('page', String(page));
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

export default async function PlayersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const compact = one(sp.view) === 'compact';
  const viewer = await getViewerContext();
  const { players, total, page, pageCount } = await listPlayers(filters, viewer);
  // The entry card names the current leader, so it needs the board it points at. Cached read; a
  // failure here must never take down the directory, so it degrades to the invitation variant.
  const leaders = await getLeaderboardSettings()
    .then((settings) =>
      settings.enabled ? getLeaderboard('community', 'global', null, 'all_time', 3) : null,
    )
    .catch(() => null);
  const authed = viewer.viewerId !== null;

  const active: ActiveFilters = {
    q: filters.q,
    city: filters.city,
    sex: filters.sex,
    minSkill: typeof filters.minSkill === 'number' ? String(filters.minSkill) : undefined,
    identityVerified: filters.identityVerified,
    coach: filters.coach,
    lookingForPartner: filters.lookingForPartner,
    openForSponsorship: filters.openForSponsorship,
  };

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

      <SearchFilters current={active} />

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
        hrefFor={(n) => `/players${toQueryString(filters, n, compact)}`}
        label="Player pages"
      />
    </div>
  );
}
