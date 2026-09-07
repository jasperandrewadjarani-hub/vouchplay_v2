'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { getOptionalUser } from '@/lib/auth';
import { assertAdminActor } from '@/lib/moderation/staff';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { emitAnalyticsEvent } from '@/lib/analytics';
import { buildAllLeaderboards } from '@/lib/leaderboards/builder';
import { LEADERBOARD_CACHE_TAG } from '@/lib/leaderboards/queries';
import type { SafetyActionState } from './report';
import { writeAudit } from '@/lib/moderation/audit';

export async function setLeaderboardPrivacy(
  _previous: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const hidden = formData.get('leaderboards') === 'hidden';
  const db = createServiceClient();
  const { data: profile } = await db
    .from('profiles')
    .select('profile_visibility')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return { error: 'Profile not found.' };
  const visibility =
    (profile as { profile_visibility: Record<string, unknown> }).profile_visibility ?? {};
  const { error } = await db
    .from('profiles')
    .update({ profile_visibility: { ...visibility, leaderboards: hidden ? 'hidden' : 'public' } })
    .eq('id', user.id);
  if (error) return { error: 'Could not save your leaderboard privacy setting.' };
  const { data: queued } = await db
    .from('leaderboard_rebuild_requests')
    .select('id')
    .eq('status', 'pending')
    .is('category', null)
    .limit(1)
    .maybeSingle();
  if (!queued)
    await db.from('leaderboard_rebuild_requests').insert({
      category: null,
      scope_type: null,
      scope_value: null,
      period: null,
      requested_by: user.id,
      reason: 'Player leaderboard privacy changed',
    });
  await writeAudit({
    actorId: user.id,
    actorRole: 'player',
    action: 'leaderboard.privacy.change',
    entityType: 'profile',
    entityId: user.id,
    before: { leaderboards: visibility.leaderboards ?? 'public' },
    after: { leaderboards: hidden ? 'hidden' : 'public' },
    reason: 'Player changed public leaderboard visibility',
  });
  revalidatePath('/me/settings/privacy');
  revalidatePath('/');
  emitAnalyticsEvent('leaderboard_privacy_changed', { hidden });
  return {
    ok: true,
    message: hidden
      ? 'You are hidden from public leaderboards. Private momentum remains available.'
      : 'You will be eligible for public leaderboards after the next snapshot.',
  };
}

export async function requestAndBuildLeaderboards(
  _previous: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const actor = await assertAdminActor();
  if (!actor) return { error: 'Admin access with a stepped-up (two-factor) session is required.' };
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 10) return { error: 'Enter a useful reason of at least 10 characters.' };
  const db = await createClient();
  const { data: requestId, error } = await db.rpc('request_leaderboard_rebuild', {
    p_category: null,
    p_scope_type: null,
    p_scope_value: null,
    p_period: null,
    p_reason: reason,
  });
  if (error) return { error: 'Could not queue the rebuild.' };
  const svc = createServiceClient();
  if (requestId)
    await svc
      .from('leaderboard_rebuild_requests')
      .update({ status: 'running' })
      .eq('id', requestId);
  try {
    const result = await buildAllLeaderboards();
    if (requestId)
      await svc
        .from('leaderboard_rebuild_requests')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', requestId);
    revalidateTag(LEADERBOARD_CACHE_TAG);
    revalidatePath('/');
    revalidatePath('/leaderboards');
    revalidatePath('/admin/leaderboards');
    emitAnalyticsEvent('leaderboard_rebuilt', {
      runs: result.runs,
      entries: result.entries,
      contributionRows: result.contributionRows,
    });
    return {
      ok: true,
      message: `Published ${result.runs} snapshots with ${result.entries} ranked rows.`,
    };
  } catch {
    if (requestId)
      await svc
        .from('leaderboard_rebuild_requests')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_code: 'BUILD_FAILED',
        })
        .eq('id', requestId);
    return { error: 'The rebuild failed safely. Existing active snapshots were preserved.' };
  }
}

export async function setLeaderboardExclusion(
  _previous: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const actor = await assertAdminActor();
  if (!actor) return { error: 'Admin access with a stepped-up (two-factor) session is required.' };
  const entityType = String(formData.get('entityType') ?? '');
  const entityId = String(formData.get('entityId') ?? '');
  const category = String(formData.get('category') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!['player', 'club'].includes(entityType) || !/^[0-9a-f-]{36}$/i.test(entityId))
    return { error: 'Enter a valid player or club UUID.' };
  if (reason.length < 10) return { error: 'Enter a useful reason of at least 10 characters.' };
  const db = await createClient();
  const { error } = await db.rpc('set_leaderboard_exclusion', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_category: category || null,
    p_excluded: formData.get('excluded') !== 'false',
    p_reason: reason,
  });
  if (error) return { error: 'Could not update the exclusion.' };
  revalidatePath('/admin/leaderboards');
  return { ok: true, message: 'Exclusion updated. Rebuild snapshots to publish the change.' };
}

export async function activateLeaderboardSnapshot(
  _previous: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const actor = await assertAdminActor();
  if (!actor) return { error: 'Admin access with a stepped-up (two-factor) session is required.' };
  const runId = String(formData.get('runId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 10)
    return { error: 'Enter a useful rollback reason of at least 10 characters.' };
  const db = await createClient();
  const { error } = await db.rpc('activate_leaderboard_snapshot', {
    p_run_id: runId,
    p_reason: reason,
  });
  if (error) return { error: 'Could not activate that snapshot.' };
  revalidateTag(LEADERBOARD_CACHE_TAG);
  revalidatePath('/');
  revalidatePath('/leaderboards');
  revalidatePath('/admin/leaderboards');
  return { ok: true, message: 'Snapshot activated and recorded in the immutable audit log.' };
}
