import type { Metadata } from 'next';
import type { LeaderboardCategory } from '@vouchplay/core';
import { getOptionalUser } from '@/lib/auth';
import { getLeaderboardSettings } from '@/lib/settings';
import { getLeaderboard, getMyMomentum } from '@/lib/leaderboards/queries';
import type { LeaderboardPeriod, LeaderboardScope } from '@/lib/leaderboards/types';
import { boardMeta } from '@/lib/leaderboards/board-meta';
import { nextPublishingRunAfter } from '@/lib/leaderboards/cron-schedule';
import {
  LeaderboardPanel,
  MomentumCard,
  RankingsExplanation,
} from '@/components/leaderboards/leaderboard-panel';
import { BoardTabs } from '@/components/leaderboards/board-tabs';
import { BoardStats } from '@/components/leaderboards/board-stats';
import { LeaderboardFilters } from '@/components/leaderboards/filters';
import { emitAnalyticsEvent } from '@/lib/analytics';

export const metadata: Metadata = {
  title: 'Leaderboards',
  description: 'Deterministic, privacy-safe VouchPlay community rankings.',
};
type SP = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function LeaderboardsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const categoryRaw = one(sp.category);
  const category: LeaderboardCategory =
    categoryRaw === 'community' || categoryRaw === 'clubs' ? categoryRaw : 'players';
  const scopeRaw = one(sp.scope);
  const scope: LeaderboardScope =
    scopeRaw === 'city' || scopeRaw === 'region' ? scopeRaw : 'global';
  const periodRaw = one(sp.period);
  const period: LeaderboardPeriod =
    category === 'community'
      ? 'all_time'
      : periodRaw === 'month' || periodRaw === 'season'
        ? periodRaw
        : 'all_time';
  const scopeValue =
    scope === 'global'
      ? ''
      : String(one(sp.scopeValue) ?? '')
          .trim()
          .slice(0, 80);
  const settings = await getLeaderboardSettings();
  const user = await getOptionalUser();
  const [board, momentum] = await Promise.all([
    settings.enabled && (scope === 'global' || scopeValue)
      ? getLeaderboard(category, scope, scopeValue || null, period, settings.fullLimit)
      : Promise.resolve(null),
    user ? getMyMomentum(user.id) : Promise.resolve([]),
  ]);
  emitAnalyticsEvent('leaderboard_viewed', {
    category,
    scope,
    period,
    hasSnapshot: Boolean(board),
  });

  const meta = boardMeta(category);
  // The viewer's own position on this board's category. Clubs have no per-player momentum row, so
  // the tile falls back to the invitation rather than showing a rank that does not exist.
  const myRank =
    momentum.find((row) => row.category === (category === 'clubs' ? 'players' : category))
      ?.privateRank ?? null;
  // Same pure prediction the Admin nightly-rebuild panel uses, so the public promise and the
  // operator view cannot disagree (§1O).
  const nextPublishAt = nextPublishingRunAfter({
    now: new Date(),
    lastPublishedAt: board?.publishedAt ? new Date(board.publishedAt) : null,
    cadenceHours: settings.cadenceHours,
    enabled: settings.enabled,
    allCategoriesPaused: Object.values(settings.paused).every(Boolean),
  });

  return (
    <div className="space-y-5">
      <header className="vp-in space-y-1">
        <h1 className="text-foreground text-3xl font-extrabold tracking-tight">
          <span className="vp-gradient-text">Leaderboards</span>
        </h1>
        <p className="text-foreground-muted text-sm">
          Who is leading VouchPlay right now. Rankings publish once a day.
        </p>
      </header>

      <BoardStats
        myRank={category === 'clubs' ? null : myRank}
        signedIn={Boolean(user)}
        rankedCount={board?.entries.length ?? 0}
        unit={meta.unit}
        nextPublishAt={nextPublishAt ? nextPublishAt.toISOString() : null}
        hook={meta.hook}
      />

      <BoardTabs active={category} />

      <LeaderboardFilters
        category={category}
        scope={scope}
        scopeValue={scopeValue}
        period={period}
      />

      {user && <MomentumCard rows={momentum} />}

      {!settings.enabled ? (
        <p
          className="border-border bg-surface text-foreground-muted rounded-2xl border p-5 text-sm"
          role="status"
        >
          Leaderboards are temporarily paused platform-wide.
        </p>
      ) : scope !== 'global' && !scopeValue ? (
        <p className="border-border bg-surface text-foreground-muted rounded-2xl border p-5 text-sm">
          Enter a city or region to load that scope.
        </p>
      ) : (
        <LeaderboardPanel
          board={board}
          category={category}
          paused={settings.paused[category]}
          viewerId={user?.id ?? null}
        />
      )}
      <RankingsExplanation />
    </div>
  );
}
