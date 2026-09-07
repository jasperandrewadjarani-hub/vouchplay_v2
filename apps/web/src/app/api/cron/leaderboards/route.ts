import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { buildAllLeaderboards } from '@/lib/leaderboards/builder';
import { LEADERBOARD_CACHE_TAG } from '@/lib/leaderboards/queries';
import { createServiceClient } from '@/lib/supabase/service';
import { purgeExpiredCoachEvidence } from '@/lib/coach/evidence';
import { getLeaderboardSettings } from '@/lib/settings';

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json({ ok: false, code: 'CRON_NOT_CONFIGURED' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false }, { status: 401 });
  const db = createServiceClient();
  let pendingIds: string[] = [];
  try {
    const [coachEvidencePurged, settings] = await Promise.all([
      purgeExpiredCoachEvidence(),
      getLeaderboardSettings(),
    ]);
    if (!settings.enabled)
      return NextResponse.json({ ok: true, skipped: 'DISABLED', coachEvidencePurged });
    if (Object.values(settings.paused).every(Boolean))
      return NextResponse.json({ ok: true, skipped: 'ALL_CATEGORIES_PAUSED', coachEvidencePurged });
    const { data: latest, error: latestError } = await db
      .from('leaderboard_snapshot_runs')
      .select('published_at')
      .eq('active', true)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    const lastPublished = latest?.published_at ? Date.parse(String(latest.published_at)) : 0;
    if (lastPublished && Date.now() - lastPublished < settings.cadenceHours * 3_600_000)
      return NextResponse.json({ ok: true, skipped: 'CADENCE_NOT_DUE', coachEvidencePurged });

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
    return NextResponse.json({ ok: false, code: 'BUILD_FAILED' }, { status: 500 });
  }
}
