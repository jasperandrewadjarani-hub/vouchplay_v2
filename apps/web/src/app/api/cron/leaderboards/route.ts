import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { buildAllLeaderboards } from '@/lib/leaderboards/builder';
import { LEADERBOARD_CACHE_TAG } from '@/lib/leaderboards/queries';
import {
  LEADERBOARD_CRON_AUDIT_ACTION,
  type CronRunAuditFacts,
} from '@/lib/leaderboards/cron-schedule';
import { createServiceClient } from '@/lib/supabase/service';
import { purgeExpiredCoachEvidence } from '@/lib/coach/evidence';
import { getLeaderboardSettings } from '@/lib/settings';
import { writeAudit } from '@/lib/moderation/audit';

export const maxDuration = 60;

/**
 * Records what this invocation did, so "did the nightly job run?" is answerable from the app rather
 * than from the Vercel dashboard. A skipped run is the interesting case: it leaves no snapshot row,
 * so without this it is indistinguishable from a job that never fired.
 *
 * Only called after the secret check passes. Auditing an unauthenticated call would let any
 * anonymous caller fill the append-only table.
 */
async function auditRun(facts: CronRunAuditFacts): Promise<void> {
  await writeAudit({
    actorId: null,
    actorRole: 'system',
    action: LEADERBOARD_CRON_AUDIT_ACTION,
    entityType: 'leaderboard_snapshot_runs',
    entityId: null,
    after: { ...facts },
    reason: 'Scheduled leaderboard rebuild',
  });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json({ ok: false, code: 'CRON_NOT_CONFIGURED' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false }, { status: 401 });
  const ranAt = new Date().toISOString();
  const db = createServiceClient();
  let pendingIds: string[] = [];
  let cadenceHours = 0;
  let lastPublishedAt: string | null = null;
  try {
    const [coachEvidencePurged, settings] = await Promise.all([
      purgeExpiredCoachEvidence(),
      getLeaderboardSettings(),
    ]);
    cadenceHours = settings.cadenceHours;
    if (!settings.enabled) {
      await auditRun({
        outcome: 'skipped_disabled',
        ranAt,
        cadenceHours,
        lastPublishedAt,
        coachEvidencePurged,
      });
      return NextResponse.json({ ok: true, skipped: 'DISABLED', coachEvidencePurged });
    }
    if (Object.values(settings.paused).every(Boolean)) {
      await auditRun({
        outcome: 'skipped_all_paused',
        ranAt,
        cadenceHours,
        lastPublishedAt,
        coachEvidencePurged,
      });
      return NextResponse.json({ ok: true, skipped: 'ALL_CATEGORIES_PAUSED', coachEvidencePurged });
    }
    const { data: latest, error: latestError } = await db
      .from('leaderboard_snapshot_runs')
      .select('published_at')
      .eq('active', true)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    lastPublishedAt = latest?.published_at ? String(latest.published_at) : null;
    const lastPublished = lastPublishedAt ? Date.parse(lastPublishedAt) : 0;
    if (lastPublished && Date.now() - lastPublished < settings.cadenceHours * 3_600_000) {
      await auditRun({
        outcome: 'skipped_cadence',
        ranAt,
        cadenceHours,
        lastPublishedAt,
        coachEvidencePurged,
      });
      return NextResponse.json({ ok: true, skipped: 'CADENCE_NOT_DUE', coachEvidencePurged });
    }

    const { data: pending } = await db
      .from('leaderboard_rebuild_requests')
      .select('id')
      .eq('status', 'pending')
      .order('requested_at')
      .limit(100);
    pendingIds = (pending ?? []).map((row) => String((row as { id: string }).id));
    const result = await buildAllLeaderboards();
    if (pendingIds.length)
      await db
        .from('leaderboard_rebuild_requests')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .in('id', pendingIds)
        .eq('status', 'pending');
    revalidateTag(LEADERBOARD_CACHE_TAG);
    await auditRun({
      outcome: 'published',
      ranAt,
      cadenceHours,
      lastPublishedAt,
      runsPublished: result.runs,
      entriesPublished: result.entries,
      contributionRows: result.contributionRows,
      coachEvidencePurged,
    });
    return NextResponse.json({ ok: true, ...result, coachEvidencePurged });
  } catch {
    if (pendingIds.length)
      await db
        .from('leaderboard_rebuild_requests')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_code: 'BUILD_FAILED',
        })
        .in('id', pendingIds)
        .eq('status', 'pending');
    await auditRun({
      outcome: 'failed',
      ranAt,
      cadenceHours,
      lastPublishedAt,
      errorCode: 'BUILD_FAILED',
    });
    return NextResponse.json({ ok: false, code: 'BUILD_FAILED' }, { status: 500 });
  }
}
