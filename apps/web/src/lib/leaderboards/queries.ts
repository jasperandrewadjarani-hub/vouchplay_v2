import 'server-only';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { createClient } from '@/lib/supabase/server';
import type { LeaderboardCategory } from '@vouchplay/core';
import type {
  LeaderboardDTO,
  LeaderboardEntryDTO,
  LeaderboardPeriod,
  LeaderboardScope,
  MomentumDTO,
} from './types';

export const LEADERBOARD_CACHE_TAG = 'leaderboard-snapshots';

const cachedLeaderboard = unstable_cache(
  async (
    category: LeaderboardCategory,
    scopeType: LeaderboardScope,
    scopeValue: string,
    period: LeaderboardPeriod,
    limit: number,
  ): Promise<LeaderboardDTO | null> => {
    const db = createPublicClient();
    let runQuery = db
      .from('leaderboard_snapshot_runs')
      .select(
        'id, scoring_version, category, scope_type, scope_value, period, published_at, stale_after',
      )
      .eq('category', category)
      .eq('scope_type', scopeType)
      .eq('period', period)
      .eq('active', true)
      .eq('status', 'published');
    runQuery =
      scopeType === 'global'
        ? runQuery.is('scope_value', null)
        : runQuery.eq('scope_value', scopeValue);
    const { data: run, error: runError } = await runQuery.maybeSingle();
    if (runError) throw new Error('leaderboard_run_read_failed');
    if (!run) return null;
    const r = run as Record<string, unknown>;
    const { data: entries, error: entryError } = await db
      .from('leaderboard_snapshot_entries')
      .select(
        'subject_type, subject_id, rank, score, components, explanation, display_name, slug, image_path, city, region',
      )
      .eq('run_id', String(r.id))
      .eq('is_public', true)
      .order('rank')
      .limit(Math.max(1, Math.min(limit, 100)));
    if (entryError) throw new Error('leaderboard_entries_read_failed');
    const publishedAt = String(r.published_at);
    const staleAfter = r.stale_after ? String(r.stale_after) : null;
    return {
      category,
      scopeType,
      scopeValue: scopeType === 'global' ? null : String(r.scope_value),
      period,
      scoringVersion: String(r.scoring_version),
      publishedAt,
      staleAfter,
      stale: !staleAfter || Date.parse(staleAfter) < Date.now(),
      entries: ((entries ?? []) as Record<string, unknown>[]).map((row): LeaderboardEntryDTO => ({
        subjectType: row.subject_type as 'player' | 'club',
        subjectId: String(row.subject_id),
        rank: Number(row.rank),
        score: Number(row.score),
        components: (row.components ?? {}) as Record<string, number>,
        explanation: String(row.explanation),
        displayName: String(row.display_name),
        slug: String(row.slug),
        imagePath: row.image_path ? String(row.image_path) : null,
        city: row.city ? String(row.city) : null,
        region: row.region ? String(row.region) : null,
      })),
    };
  },
  ['leaderboard-snapshot'],
  { revalidate: 300, tags: [LEADERBOARD_CACHE_TAG] },
);

export function getLeaderboard(
  category: LeaderboardCategory,
  scopeType: LeaderboardScope,
  scopeValue: string | null,
  period: LeaderboardPeriod,
  limit: number,
) {
  return cachedLeaderboard(category, scopeType, scopeValue ?? '', period, limit);
}

export async function getMyMomentum(userId: string): Promise<MomentumDTO[]> {
  const db = await createClient();
  const { data, error } = await db
    .from('player_leaderboard_momentum')
    .select(
      'category, private_rank, previous_rank, score, eligible_public, exclusion_code, components, cta_key, updated_at',
    )
    .eq('player_id', userId)
    .eq('scope_type', 'global')
    .eq('scope_value', '')
    .eq('period', 'all_time')
    .order('category');
  if (error) throw new Error('private_momentum_read_failed');
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    category: row.category as 'players' | 'community',
    privateRank: row.private_rank == null ? null : Number(row.private_rank),
    previousRank: row.previous_rank == null ? null : Number(row.previous_rank),
    score: Number(row.score),
    eligiblePublic: Boolean(row.eligible_public),
    exclusionCode: row.exclusion_code ? String(row.exclusion_code) : null,
    components: (row.components ?? {}) as Record<string, number>,
    ctaKey: row.cta_key ? String(row.cta_key) : null,
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Public contribution progress for a player. Cache-first (master_plan §2AC): pure public data
 * (public client, no viewer fields), 60s TTL. Contribution recomputes on the nightly rebuild, so
 * short staleness is harmless.
 */
export async function getContributionProgress(playerId: string) {
  return unstable_cache(
    () => fetchContributionProgress(playerId),
    ['contribution-progress', playerId],
    {
      revalidate: 60,
    },
  )();
}

async function fetchContributionProgress(playerId: string) {
  const db = createPublicClient();
  const { data } = await db
    .from('player_contributions')
    .select(
      'score, level, distinct_players_helped, newcomer_players_helped, current_streak_weeks, badges, calculated_at',
    )
    .eq('player_id', playerId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    score: Number(row.score),
    level: Number(row.level),
    distinctPlayersHelped: Number(row.distinct_players_helped),
    newcomerPlayersHelped: Number(row.newcomer_players_helped),
    currentStreakWeeks: Number(row.current_streak_weeks),
    badges: Array.isArray(row.badges) ? row.badges.map(String) : [],
    calculatedAt: String(row.calculated_at),
  };
}
