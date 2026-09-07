import type { Metadata } from 'next';
import type { LeaderboardCategory } from '@vouchplay/core';
import { getOptionalUser } from '@/lib/auth';
import { getLeaderboardSettings } from '@/lib/settings';
import { getLeaderboard, getMyMomentum } from '@/lib/leaderboards/queries';
import type { LeaderboardPeriod, LeaderboardScope } from '@/lib/leaderboards/types';
import {
  LeaderboardPanel,
  MomentumCard,
  RankingsExplanation,
} from '@/components/leaderboards/leaderboard-panel';
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
  return (
    <div className="space-y-5">
      <header>
        <p className="vp-label text-primary">LEADER_V1</p>
        <h1 className="text-foreground text-3xl font-extrabold tracking-tight">
          VouchPlay leaderboards
        </h1>
        <p className="text-foreground-muted mt-2 max-w-2xl text-sm">
          Choose a category, scope, and supported period. Publication applies privacy, age, account,
          fraud, and club-eligibility exclusions before ranking.
        </p>
      </header>
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
        <LeaderboardPanel board={board} category={category} paused={settings.paused[category]} />
      )}
      <RankingsExplanation />
    </div>
  );
}
