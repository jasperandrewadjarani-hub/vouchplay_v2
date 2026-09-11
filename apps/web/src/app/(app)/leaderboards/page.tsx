import type { Metadata } from 'next';
import { CalendarClock } from 'lucide-react';
import type { LeaderboardCategory } from '@vouchplay/core';
import { getOptionalUser } from '@/lib/auth';
import { getLeaderboardSettings } from '@/lib/settings';
import { getLeaderboard, getMyMomentum } from '@/lib/leaderboards/queries';
import type { LeaderboardPeriod, LeaderboardScope } from '@/lib/leaderboards/types';
import { boardMeta, hasCompetitiveEvidence } from '@/lib/leaderboards/board-meta';
import { nextPublishingRunAfter } from '@/lib/leaderboards/cron-schedule';
import { formatDateTime } from '@/lib/format-date';
import { LeaderboardPanel, RankingsExplanation } from '@/components/leaderboards/leaderboard-panel';
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
  // Contributors is the default board: it is the only one with real earned separation today, so
  // landing anywhere else means landing on an emptier page (§1Q).
  const category: LeaderboardCategory =
    categoryRaw === 'players' || categoryRaw === 'clubs' ? categoryRaw : 'community';
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
  // Clubs have no per-player momentum row, so the personal box falls back to the invitation rather
  // than showing a rank that does not exist for that board.
  const myRow =
    category === 'clubs'
      ? undefined
      : (momentum.find((row) => row.category === category) ??
        (category === 'players' ? undefined : momentum[0]));
  // A board that is withholding its list has nothing ranked to count.
  const awaitingResults = board ? !hasCompetitiveEvidence(category, board.entries) : false;
  const rankedCount = awaitingResults ? 0 : (board?.entries.length ?? 0);
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
    <div className="space-y-3">
      <header className="vp-in">
        <h1 className="text-foreground text-3xl font-extrabold tracking-tight">
          <span className="vp-gradient-text">Leaderboards</span>
        </h1>
        <p className="text-foreground-muted mt-1 text-sm">Who is leading VouchPlay right now.</p>
        {/* Worth saying, because a daily drop is only motivating when people know when it lands.
            Not worth a tile: it was taking a third of the first screen (§1Q). */}
        <p className="text-foreground-muted mt-1 flex items-center gap-1.5 text-xs">
          <CalendarClock size={13} className="text-accent-lime shrink-0" aria-hidden />
          {nextPublishAt
            ? `Rankings update once a day. Next update ${formatDateTime(nextPublishAt.toISOString())}.`
            : 'Rankings publishing is on hold.'}
        </p>
      </header>

      {/* The tab strip leads the page: choosing a board is the only decision most people come here
          to make, so nothing outranks it. */}
      <BoardTabs active={category} />

      <BoardStats
        myRank={myRow?.privateRank ?? null}
        myScore={myRow?.score ?? null}
        eligiblePublic={myRow?.eligiblePublic ?? true}
        exclusionCode={myRow?.exclusionCode ?? null}
        ctaKey={myRow?.ctaKey ?? null}
        signedIn={Boolean(user)}
        rankedCount={rankedCount}
        unit={meta.unit}
        hook={meta.hook}
      />

      <LeaderboardFilters
        category={category}
        scope={scope}
        scopeValue={scopeValue}
        period={period}
      />

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
          authed={Boolean(user)}
          category={category}
          paused={settings.paused[category]}
          viewerId={user?.id ?? null}
        />
      )}
      <RankingsExplanation />
    </div>
  );
}
