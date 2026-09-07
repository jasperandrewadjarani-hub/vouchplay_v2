export const LEADERBOARD_ALGORITHM_VERSION = 'LEADER_V1' as const;

export type LeaderboardCategory = 'players' | 'community' | 'clubs';

export interface LeaderboardFact {
  subjectId: string;
  eligible: boolean;
  components: Readonly<Record<string, number>>;
  tieBreak: readonly number[];
  explanation: string;
}

export interface LeaderboardConfig {
  weights: Readonly<Record<string, number>>;
  minimumScore: number;
  maximumComponentValue: number;
}

export interface RankedLeaderboardRow {
  subjectId: string;
  rank: number;
  score: number;
  components: Readonly<Record<string, number>>;
  explanation: string;
}

export interface LeaderboardScopeSubject {
  publicEligible: boolean;
  city: string | null;
  region: string | null;
}

/** Public scope metadata must be deterministic and must never be seeded by private/ineligible rows. */
export function derivePublicLeaderboardScopes(
  subjects: readonly LeaderboardScopeSubject[],
  maximumScopes: number,
): { cities: string[]; regions: string[] } {
  const limit = Math.max(0, Math.floor(maximumScopes));
  const eligible = subjects.filter((subject) => subject.publicEligible);
  const cities = [...new Set(eligible.map((subject) => subject.city).filter(Boolean) as string[])]
    .sort()
    .slice(0, limit);
  const regions = [
    ...new Set(eligible.map((subject) => subject.region).filter(Boolean) as string[]),
  ]
    .sort()
    .slice(0, Math.max(0, limit - cities.length));
  return { cities, regions };
}

function score(fact: LeaderboardFact, config: LeaderboardConfig): number {
  return Object.entries(config.weights).reduce((sum, [key, weight]) => {
    const component = Math.max(
      0,
      Math.min(config.maximumComponentValue, fact.components[key] ?? 0),
    );
    return sum + component * weight;
  }, 0);
}

function compareTieBreak(a: readonly number[], b: readonly number[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Stable, deterministic scorer/ranker. Category data is normalized by the bounded builder. */
export function rankLeaderboard(
  facts: readonly LeaderboardFact[],
  config: Readonly<LeaderboardConfig>,
): RankedLeaderboardRow[] {
  const scored = facts
    .filter((fact) => fact.eligible)
    .map((fact) => ({ fact, score: score(fact, config) }))
    .filter((row) => row.score >= config.minimumScore)
    .sort(
      (a, b) =>
        b.score - a.score ||
        compareTieBreak(a.fact.tieBreak, b.fact.tieBreak) ||
        a.fact.subjectId.localeCompare(b.fact.subjectId),
    );
  return scored.map((row, index) => ({
    subjectId: row.fact.subjectId,
    rank: index + 1,
    score: Math.round((row.score + Number.EPSILON) * 10000) / 10000,
    components: row.fact.components,
    explanation: row.fact.explanation,
  }));
}
