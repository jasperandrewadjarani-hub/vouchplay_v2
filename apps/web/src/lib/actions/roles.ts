'use server';

import { revalidatePath } from 'next/cache';
import { organizerApplicationSchema } from '@vouchplay/validation';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { assertAdminActor } from '@/lib/moderation/staff';
import { writeAudit } from '@/lib/moderation/audit';
import type { SafetyActionState } from './report';

/**
 * Role applications (handover §4, §17.1, §36.3). A player applies for Organizer; an Admin approves,
 * which grants the `organizer` global role. Coach applications reuse the same table/flow.
 */

export async function applyForOrganizer(
  _prev: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const parsed = organizerApplicationSchema.safeParse({
    motivation: formData.get('motivation') ?? '',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };

  const svc = createServiceClient();
  try {
    const [{ data: me }, { data: role }, { data: openApp }] = await Promise.all([
      svc.from('profiles').select('account_status, onboarded_at').eq('id', user.id).maybeSingle(),
      svc
        .from('user_roles')
        .select('id')
        .eq('user_id', user.id)
        .eq('role', 'organizer')
        .eq('status', 'active')
        .maybeSingle(),
      svc
        .from('role_applications')
        .select('id')
        .eq('user_id', user.id)
        .eq('role_requested', 'organizer')
        .in('status', ['pending', 'reviewing'])
        .maybeSingle(),
    ]);
    const meRow = me as { account_status: string; onboarded_at: string | null } | null;
    if (!meRow || meRow.account_status !== 'active' || !meRow.onboarded_at) {
      return { error: 'Complete your profile before applying.' };
    }
    if (role) return { error: 'You are already an organizer.' };
    if (openApp) return { error: 'You already have an application under review.' };

    const { error } = await svc.from('role_applications').insert({
      user_id: user.id,
      role_requested: 'organizer',
      answers: { motivation: parsed.data.motivation },
    });
    if (error) return { error: 'Could not submit your application. Please try again.' };
  } catch {
    return { error: 'Applications are temporarily unavailable. Please try again shortly.' };
  }
  revalidatePath('/me');
  return { ok: true, message: 'Application submitted. Our team will review it.' };
}

async function decideApplication(
  applicationId: string,
  decision: 'approved' | 'rejected',
  reason: string,
): Promise<SafetyActionState> {
  const actor = await assertAdminActor();
  if (!actor) return { error: 'Admin access with a stepped-up (two-factor) session is required.' };
  const svc = createServiceClient();
  try {
    const { data: app } = await svc
      .from('role_applications')
      .select('id, user_id, role_requested, status')
      .eq('id', applicationId)
      .maybeSingle();
    const a = app as { id: string; user_id: string; role_requested: string; status: string } | null;
    if (!a) return { error: 'Application not found.' };
    if (!['pending', 'reviewing'].includes(a.status))
      return { error: 'Application already decided.' };

    const { error } = await svc
      .from('role_applications')
      .update({
        status: decision,
        reviewed_by: actor.viewerId,
        review_reason: reason?.trim() || null,
      })
      .eq('id', applicationId);
    if (error) return { error: 'Could not update the application.' };

    if (decision === 'approved') {
      // Grant the role (idempotent via the active-grant unique index).
      await svc.from('user_roles').insert({
        user_id: a.user_id,
        role: a.role_requested,
        status: 'active',
        approved_by: actor.viewerId,
        approved_at: new Date().toISOString(),
      });
    }
    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: `role.${a.role_requested}.${decision}`,
      entityType: 'role_application',
      entityId: applicationId,
      before: { status: a.status },
      after: { status: decision },
      reason: reason?.trim() || null,
    });
  } catch {
    return { error: 'That action failed. Please try again.' };
  }
  revalidatePath('/staff/moderation');
  return { ok: true, message: `Application ${decision}.` };
}

export async function approveRoleApplication(applicationId: string, reason: string) {
  return decideApplication(applicationId, 'approved', reason);
}
export async function rejectRoleApplication(applicationId: string, reason: string) {
  return decideApplication(applicationId, 'rejected', reason);
}
