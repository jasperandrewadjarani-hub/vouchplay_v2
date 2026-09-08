import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { getLeaderboardSettings } from '@/lib/settings';
import {
  LEADERBOARD_CRON_AUDIT_ACTION,
  nextCronRunAfter,
  nextPublishingRunAfter,
  predictNextRun,
  type CronOutlook,
  type CronRunAuditFacts,
  type CronRunOutcome,
} from './cron-schedule';

/**
 * What the Admin "Nightly rebuild" panel needs to answer three questions without leaving the app:
 * did it run, what did it do, and what will it do next.
 *
 * Read-only. Authorization is enforced by the page guard (`requireAdminPage`). Explicit column
 * projection, no `select(*)`.
 */
export interface CronStatus {
  /** The most recent authenticated invocation, or null when none has been recorded yet. */
  lastRun: { at: string; outcome: CronRunOutcome; facts: CronRunAuditFacts | null } | null;
  /** `published_at` of the newest active published snapshot, whatever published it. */
  lastPublishedAt: string | null;
  nextRunAt: string;
  outlook: CronOutlook;
  /** When fresh rankings next land, or null when no scheduled run inside two weeks would publish. */
  nextPublishAt: string | null;
  cadenceHours: number;
}

const OUTCOMES: readonly CronRunOutcome[] = [
  'published',
  'skipped_cadence',
  'skipped_disabled',
  'skipped_all_paused',
  'failed',
];

function readFacts(after: unknown): CronRunAuditFacts | null {
  if (!after || typeof after !== 'object' || Array.isArray(after)) return null;
  const outcome = (after as { outcome?: unknown }).outcome;
  if (typeof outcome !== 'string' || !OUTCOMES.includes(outcome as CronRunOutcome)) return null;
  return after as unknown as CronRunAuditFacts;
}

export async function getCronStatus(now: Date = new Date()): Promise<CronStatus> {
  const db = createServiceClient();
  const [settings, auditResult, snapshotResult] = await Promise.all([
    getLeaderboardSettings(),
    db
      .from('audit_logs')
      .select('created_at, after_snapshot')
      .eq('action', LEADERBOARD_CRON_AUDIT_ACTION)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('leaderboard_snapshot_runs')
      .select('published_at')
      .eq('active', true)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const auditRow = auditResult.data as { created_at?: string; after_snapshot?: unknown } | null;
  const facts = readFacts(auditRow?.after_snapshot);
  const lastRun =
    auditRow?.created_at && facts
      ? { at: String(auditRow.created_at), outcome: facts.outcome, facts }
      : null;

  const snapshotRow = snapshotResult.data as { published_at?: string | null } | null;
  const lastPublishedAt = snapshotRow?.published_at ? String(snapshotRow.published_at) : null;

  const nextRunAt = nextCronRunAfter(now);
  const guards = {
    lastPublishedAt: lastPublishedAt ? new Date(lastPublishedAt) : null,
    cadenceHours: settings.cadenceHours,
    enabled: settings.enabled,
    allCategoriesPaused: Object.values(settings.paused).every(Boolean),
  };
  const nextPublishAt = nextPublishingRunAfter({ ...guards, now });
  return {
    lastRun,
    lastPublishedAt,
    nextRunAt: nextRunAt.toISOString(),
    outlook: predictNextRun({ ...guards, nextRunAt }),
    nextPublishAt: nextPublishAt ? nextPublishAt.toISOString() : null,
    cadenceHours: settings.cadenceHours,
  };
}
