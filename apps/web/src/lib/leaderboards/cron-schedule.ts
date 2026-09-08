/**
 * The nightly leaderboard rebuild schedule, and what the next run will actually do.
 *
 * Pure module, no I/O, so the Admin panel's prediction can be unit-tested against the same rules the
 * route applies. The prediction MUST mirror `app/api/cron/leaderboards/route.ts`: a panel that
 * disagreed with the route would be worse than no panel at all.
 *
 * The hour and minute below must match the `crons` entry in the repo-root `vercel.json`.
 * `cron-schedule.test.ts` reads that file and fails if the two ever drift.
 */

/** UTC hour of the scheduled run (01:17 UTC = 09:17 Manila). */
export const LEADERBOARD_CRON_UTC_HOUR = 1;
/** UTC minute of the scheduled run. */
export const LEADERBOARD_CRON_UTC_MINUTE = 17;
/** The `crons[].path` the schedule invokes. */
export const LEADERBOARD_CRON_PATH = '/api/cron/leaderboards';

const HOUR_MS = 3_600_000;

/** The next instant at or after `now` that matches the scheduled UTC time of day. */
export function nextCronRunAfter(now: Date): Date {
  const next = new Date(now.getTime());
  next.setUTCHours(LEADERBOARD_CRON_UTC_HOUR, LEADERBOARD_CRON_UTC_MINUTE, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** Why the next scheduled run will or will not publish a new snapshot. */
export type CronOutlookCode =
  'WILL_PUBLISH' | 'CADENCE_NOT_DUE' | 'DISABLED' | 'ALL_CATEGORIES_PAUSED';

export interface CronOutlookInput {
  /** The instant the next scheduled run fires. */
  nextRunAt: Date;
  /** `published_at` of the newest active published snapshot, or null when nothing is published. */
  lastPublishedAt: Date | null;
  cadenceHours: number;
  enabled: boolean;
  allCategoriesPaused: boolean;
}

export interface CronOutlook {
  code: CronOutlookCode;
  willPublish: boolean;
  /** Hours between the last publish and the next run, or null when nothing is published yet. */
  hoursSinceLastPublishAtNextRun: number | null;
}

/**
 * Mirror of the route's guards, in the order the route applies them: enabled, then all-paused, then
 * cadence. Evaluated against the moment the next run fires, not against now.
 */
export function predictNextRun(input: CronOutlookInput): CronOutlook {
  const elapsedMs = input.lastPublishedAt
    ? input.nextRunAt.getTime() - input.lastPublishedAt.getTime()
    : null;
  const hours = elapsedMs === null ? null : elapsedMs / HOUR_MS;
  if (!input.enabled)
    return { code: 'DISABLED', willPublish: false, hoursSinceLastPublishAtNextRun: hours };
  if (input.allCategoriesPaused)
    return {
      code: 'ALL_CATEGORIES_PAUSED',
      willPublish: false,
      hoursSinceLastPublishAtNextRun: hours,
    };
  if (elapsedMs !== null && elapsedMs < input.cadenceHours * HOUR_MS)
    return { code: 'CADENCE_NOT_DUE', willPublish: false, hoursSinceLastPublishAtNextRun: hours };
  return { code: 'WILL_PUBLISH', willPublish: true, hoursSinceLastPublishAtNextRun: hours };
}

/** The `audit_logs.action` written once per authenticated cron invocation. */
export const LEADERBOARD_CRON_AUDIT_ACTION = 'leaderboard.cron.run';

/** What a completed invocation did. Mirrors the route's return branches. */
export type CronRunOutcome =
  'published' | 'skipped_cadence' | 'skipped_disabled' | 'skipped_all_paused' | 'failed';

/** Facts recorded alongside the outcome, so a run can be understood without reading a log. */
export interface CronRunAuditFacts {
  outcome: CronRunOutcome;
  ranAt: string;
  cadenceHours: number;
  lastPublishedAt: string | null;
  runsPublished?: number;
  entriesPublished?: number;
  contributionRows?: number;
  coachEvidencePurged?: number;
  errorCode?: string;
}

/** One short sentence naming what the last run did, for an operator rather than an engineer. */
export function describeOutcome(outcome: CronRunOutcome, facts?: CronRunAuditFacts): string {
  switch (outcome) {
    case 'published':
      return facts?.runsPublished != null && facts?.entriesPublished != null
        ? `Published fresh rankings: ${facts.runsPublished} boards, ${facts.entriesPublished} entries.`
        : 'Published fresh rankings.';
    case 'skipped_cadence':
      return 'Did nothing, because the rankings had already been published inside the cadence window.';
    case 'skipped_disabled':
      return 'Did nothing, because leaderboards are switched off in system settings.';
    case 'skipped_all_paused':
      return 'Did nothing, because every leaderboard category is paused.';
    case 'failed':
      return 'Failed before it could publish. The rankings on the site are unchanged.';
  }
}

/**
 * The first scheduled run at or after `now` that will actually publish, or null when no run inside
 * `maxDays` would (leaderboards off, every category paused, or a cadence longer than the window).
 *
 * This is the sentence an operator actually wants when tonight's run is going to skip: not "it will
 * skip", but "the next fresh rankings land on Thursday morning".
 */
export function nextPublishingRunAfter(
  input: Omit<CronOutlookInput, 'nextRunAt'> & { now: Date },
  maxDays = 14,
): Date | null {
  if (!input.enabled || input.allCategoriesPaused) return null;
  let candidate = nextCronRunAfter(input.now);
  for (let i = 0; i < maxDays; i += 1) {
    if (predictNextRun({ ...input, nextRunAt: candidate }).willPublish) return candidate;
    candidate = nextCronRunAfter(candidate);
  }
  return null;
}
