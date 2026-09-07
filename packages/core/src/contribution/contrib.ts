export const CONTRIBUTION_ALGORITHM_VERSION = 'CONTRIB_V1' as const;

export interface ContributionEvent {
  targetKey: string;
  occurredAt: string;
  targetDistinctVouchersBefore: number;
  reciprocal: boolean;
  ringRisk: boolean;
}

export interface ContributionConfig {
  baseDistinctPoints: number;
  newcomerThreshold: number;
  newcomerBonus: number;
  reciprocalMultiplier: number;
  ringMultiplier: number;
  dailyFullCreditLimit: number;
  dailyReducedCreditLimit: number;
  dailyReducedMultiplier: number;
  dailyFloorMultiplier: number;
  decayHalfLifeDays: number;
  levelBasePoints: number;
  newcomerBadgeCount: number;
  streakBadgeWeeks: number;
  pillarScore: number;
}

export type ContributionBadge =
  | 'first_vouch'
  | 'coverage_10'
  | 'coverage_50'
  | 'coverage_100'
  | 'newcomer_champion'
  | 'consistent_voucher'
  | 'community_pillar';

export interface ContributionSummary {
  algorithmVersion: typeof CONTRIBUTION_ALGORITHM_VERSION;
  score: number;
  level: number;
  distinctPlayersHelped: number;
  newcomerPlayersHelped: number;
  currentStreakWeeks: number;
  badges: ContributionBadge[];
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

function utcDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function utcWeekStartMs(value: string | Date): number {
  const d = new Date(value);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  return midnight - mondayOffset * DAY_MS;
}

function currentStreak(events: ContributionEvent[], now: Date): number {
  const weeks = new Set(events.map((event) => utcWeekStartMs(event.occurredAt)));
  let cursor = utcWeekStartMs(now);
  if (!weeks.has(cursor)) cursor -= WEEK_MS;
  let streak = 0;
  while (weeks.has(cursor)) {
    streak += 1;
    cursor -= WEEK_MS;
  }
  return streak;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Pure contribution engine. Input intentionally contains no rating value, vouch weight, skill,
 * eligibility, or voucher-identity disclosure field. Duplicate targets are collapsed to the first
 * event, so edits/repeats for the same pair cannot earn more contribution.
 */
export function computeContribution(
  input: readonly ContributionEvent[],
  config: Readonly<ContributionConfig>,
  now: Date,
): ContributionSummary {
  const firstByTarget = new Map<string, ContributionEvent>();
  for (const event of [...input].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  )) {
    if (!firstByTarget.has(event.targetKey)) firstByTarget.set(event.targetKey, event);
  }
  const events = [...firstByTarget.values()];
  const dailyIndex = new Map<string, number>();
  let score = 0;
  let newcomerPlayersHelped = 0;

  for (const event of events) {
    const ageDays = Math.max(0, (now.getTime() - Date.parse(event.occurredAt)) / DAY_MS);
    const decay = config.decayHalfLifeDays > 0 ? 0.5 ** (ageDays / config.decayHalfLifeDays) : 1;
    const day = utcDay(event.occurredAt);
    const nth = (dailyIndex.get(day) ?? 0) + 1;
    dailyIndex.set(day, nth);
    const volumeMultiplier =
      nth <= config.dailyFullCreditLimit
        ? 1
        : nth <= config.dailyReducedCreditLimit
          ? config.dailyReducedMultiplier
          : config.dailyFloorMultiplier;
    const antiGaming = event.ringRisk
      ? config.ringMultiplier
      : event.reciprocal
        ? config.reciprocalMultiplier
        : 1;
    const newcomer = event.targetDistinctVouchersBefore <= config.newcomerThreshold;
    if (newcomer) newcomerPlayersHelped += 1;
    score +=
      (config.baseDistinctPoints + (newcomer ? config.newcomerBonus : 0)) *
      volumeMultiplier *
      antiGaming *
      decay;
  }

  const rounded = round2(score);
  const distinctPlayersHelped = events.length;
  const streak = currentStreak(events, now);
  const badges: ContributionBadge[] = [];
  if (distinctPlayersHelped >= 1) badges.push('first_vouch');
  if (distinctPlayersHelped >= 10) badges.push('coverage_10');
  if (distinctPlayersHelped >= 50) badges.push('coverage_50');
  if (distinctPlayersHelped >= 100) badges.push('coverage_100');
  if (newcomerPlayersHelped >= config.newcomerBadgeCount) badges.push('newcomer_champion');
  if (streak >= config.streakBadgeWeeks) badges.push('consistent_voucher');
  if (rounded >= config.pillarScore) badges.push('community_pillar');

  return {
    algorithmVersion: CONTRIBUTION_ALGORITHM_VERSION,
    score: rounded,
    level: Math.max(1, Math.floor(Math.sqrt(rounded / Math.max(config.levelBasePoints, 1))) + 1),
    distinctPlayersHelped,
    newcomerPlayersHelped,
    currentStreakWeeks: streak,
    badges,
  };
}
