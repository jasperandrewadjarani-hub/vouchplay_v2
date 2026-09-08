import { CalendarClock, CheckCircle2, CircleAlert, PauseCircle, History } from 'lucide-react';
import type { CronStatus } from '@/lib/leaderboards/cron-status';
import { describeOutcome } from '@/lib/leaderboards/cron-schedule';
import { formatDateTime } from '@/lib/format-date';

/**
 * Answers "did the nightly rebuild run, and when do fresh rankings next land" without leaving the
 * app. A skipped run publishes no snapshot, so before this panel a skip and a job that never fired
 * looked identical from inside VouchPlay.
 *
 * Written for an operator, not an engineer: every line is a sentence, states apply an icon plus
 * words (never colour alone, handover §34A), and no status code reaches the screen.
 */

function outlookSentence(status: CronStatus): {
  icon: 'ok' | 'wait' | 'paused' | 'alert';
  text: string;
} {
  const nextRun = formatDateTime(status.nextRunAt);
  switch (status.outlook.code) {
    case 'WILL_PUBLISH':
      return { icon: 'ok', text: `Fresh rankings publish on ${nextRun}.` };
    case 'CADENCE_NOT_DUE': {
      const hours = Math.max(0, Math.round(status.outlook.hoursSinceLastPublishAtNextRun ?? 0));
      const landing = status.nextPublishAt
        ? ` Fresh rankings land on ${formatDateTime(status.nextPublishAt)} instead.`
        : '';
      return {
        icon: 'wait',
        text:
          `The ${nextRun} run will skip: the rankings will only be ${hours} hours old by then, ` +
          `and they publish at most once every ${status.cadenceHours} hours.${landing}`,
      };
    }
    case 'DISABLED':
      return {
        icon: 'paused',
        text: 'Leaderboards are switched off in system settings, so the nightly run will do nothing.',
      };
    case 'ALL_CATEGORIES_PAUSED':
      return {
        icon: 'paused',
        text: 'Every leaderboard category is paused, so the nightly run will do nothing.',
      };
  }
}

const ICONS = {
  ok: CheckCircle2,
  wait: CalendarClock,
  paused: PauseCircle,
  alert: CircleAlert,
} as const;

function Line({
  icon,
  label,
  children,
}: {
  icon: keyof typeof ICONS;
  label: string;
  children: React.ReactNode;
}) {
  const Icon = ICONS[icon];
  return (
    <div className="flex gap-2">
      <Icon className="text-foreground-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="text-foreground text-sm">
        <span className="font-semibold">{label}</span> {children}
      </p>
    </div>
  );
}

export function NightlyRebuildPanel({ status }: { status: CronStatus }) {
  const outlook = outlookSentence(status);
  const failed = status.lastRun?.outcome === 'failed';
  return (
    <section
      className="border-border bg-surface rounded-2xl border p-4"
      aria-labelledby="nightly-rebuild-heading"
    >
      <h2 id="nightly-rebuild-heading" className="text-foreground font-semibold">
        Nightly rebuild
      </h2>
      <p className="text-foreground-muted mt-1 text-sm">
        Rankings rebuild automatically once a night. Rebuilding here by hand does the same thing
        immediately, and resets the clock below.
      </p>
      <div className="mt-3 space-y-2">
        <Line icon={failed ? 'alert' : status.lastRun ? 'ok' : 'wait'} label="Last automatic run:">
          {status.lastRun ? (
            <>
              {formatDateTime(status.lastRun.at)}.{' '}
              {describeOutcome(status.lastRun.outcome, status.lastRun.facts ?? undefined)}
            </>
          ) : (
            'not recorded yet. The next one will appear here.'
          )}
        </Line>
        <Line icon={outlook.icon} label="Next scheduled run:">
          {outlook.text}
        </Line>
        <Line icon="wait" label="Rankings on the site were last published:">
          {status.lastPublishedAt ? `${formatDateTime(status.lastPublishedAt)}.` : 'never.'}
        </Line>
      </div>
      {!status.lastRun && (
        <p className="text-foreground-muted mt-3 flex gap-2 text-xs">
          <History className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Automatic runs have only been recorded since this feature shipped, so an empty line here
            does not mean the schedule has failed. Check again after the next scheduled run.
          </span>
        </p>
      )}
    </section>
  );
}
