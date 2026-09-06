'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import type {
  ReportStatus,
  SkillReviewStatus,
  SupportTicketStatus,
  FraudStatus,
} from '@vouchplay/db';
import { createServiceClient } from '@/lib/supabase/service';
import { assertStaffActor } from '@/lib/moderation/staff';
import { writeAudit } from '@/lib/moderation/audit';
import { recomputePlayerSkillProfile } from '@/lib/vouches/recompute';
import { PLAYERS_LIST_TAG, playerTag, commentsTag } from '@/lib/players/queries';
import { CLUBS_LIST_TAG, clubTag } from '@/lib/clubs/queries';
import { listActiveVouchesForModeration, type ModerationVouch } from '@/lib/moderation/queries';
import type { SafetyActionState } from './report';

const DAY_MS = 24 * 60 * 60 * 1000;
const NO_STAFF: SafetyActionState = {
  error: 'You need a stepped-up staff session (verify two-factor) to do that.',
};

function requireReason(reason: string): string | null {
  const r = (reason ?? '').trim();
  return r.length === 0 ? 'A reason is required.' : null;
}

// ---------------------------------------------------------------------------
// Reports (§14.2)
// ---------------------------------------------------------------------------
export async function resolveReport(
  reportId: string,
  status: ReportStatus,
  resolution: string,
): Promise<SafetyActionState> {
  const actor = await assertStaffActor();
  if (!actor) return NO_STAFF;
  if ((status === 'resolved' || status === 'dismissed') && requireReason(resolution)) {
    return { error: 'A resolution note is required to close a report.' };
  }
  const svc = createServiceClient();
  try {
    const { data: before } = await svc
      .from('reports')
      .select('status, resolution, assigned_to')
      .eq('id', reportId)
      .maybeSingle();
    if (!before) return { error: 'Report not found.' };
    const { error } = await svc
      .from('reports')
      .update({
        status,
        resolution: resolution?.trim() || null,
        assigned_to: actor.viewerId,
      })
      .eq('id', reportId);
    if (error) return { error: 'Could not update the report.' };
    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: `moderation.report.${status}`,
      entityType: 'report',
      entityId: reportId,
      before,
      after: { status, resolution: resolution?.trim() || null },
      reason: resolution?.trim() || null,
    });
  } catch {
    return { error: 'Moderation action failed. Please try again.' };
  }
  revalidatePath('/staff/moderation');
  return { ok: true, message: 'Report updated.' };
}

// ---------------------------------------------------------------------------
// Skill reviews (§14.1)
// ---------------------------------------------------------------------------
export async function resolveSkillReview(
  reviewId: string,
  status: SkillReviewStatus,
  resolution: string,
): Promise<SafetyActionState> {
  const actor = await assertStaffActor();
  if (!actor) return NO_STAFF;
  const closing = status.startsWith('resolved') || status === 'closed';
  if (closing && requireReason(resolution)) {
    return { error: 'A resolution note is required to close a skill review.' };
  }
  const svc = createServiceClient();
  try {
    const { data: before } = await svc
      .from('skill_reviews')
      .select('status, resolution, reviewed_by')
      .eq('id', reviewId)
      .maybeSingle();
    if (!before) return { error: 'Skill review not found.' };
    const { error } = await svc
      .from('skill_reviews')
      .update({ status, resolution: resolution?.trim() || null, reviewed_by: actor.viewerId })
      .eq('id', reviewId);
    if (error) return { error: 'Could not update the skill review.' };
    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: `moderation.skill_review.${status}`,
      entityType: 'skill_review',
      entityId: reviewId,
      before,
      after: { status, resolution: resolution?.trim() || null },
      reason: resolution?.trim() || null,
    });
  } catch {
    return { error: 'Moderation action failed. Please try again.' };
  }
  revalidatePath('/staff/moderation');
  return { ok: true, message: 'Skill review updated.' };
}

// ---------------------------------------------------------------------------
// Fraud flags (§11.3) - never auto-punish; review only.
// ---------------------------------------------------------------------------
export async function reviewFraudFlag(
  flagId: string,
  status: FraudStatus,
  resolution: string,
): Promise<SafetyActionState> {
  const actor = await assertStaffActor();
  if (!actor) return NO_STAFF;
  if ((status === 'cleared' || status === 'action_taken') && requireReason(resolution)) {
    return { error: 'A resolution note is required to close a fraud flag.' };
  }
  const svc = createServiceClient();
  try {
    const { data: before } = await svc
      .from('fraud_flags')
      .select('status, resolution, reviewed_by')
      .eq('id', flagId)
      .maybeSingle();
    if (!before) return { error: 'Fraud flag not found.' };
    const { error } = await svc
      .from('fraud_flags')
      .update({ status, resolution: resolution?.trim() || null, reviewed_by: actor.viewerId })
      .eq('id', flagId);
    if (error) return { error: 'Could not update the fraud flag.' };
    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: `moderation.fraud_flag.${status}`,
      entityType: 'fraud_flag',
      entityId: flagId,
      before,
      after: { status, resolution: resolution?.trim() || null },
      reason: resolution?.trim() || null,
    });
  } catch {
    return { error: 'Moderation action failed. Please try again.' };
  }
  revalidatePath('/staff/moderation');
  return { ok: true, message: 'Fraud flag updated.' };
}

/** Manually raise a fraud flag for review (detectors arrive later, §11.2). */
export async function raiseFraudFlag(
  subjectType: 'user' | 'vouch' | 'cluster' | 'coach',
  subjectId: string,
  flagType: string,
  severity: string,
  note: string,
): Promise<SafetyActionState> {
  const actor = await assertStaffActor();
  if (!actor) return NO_STAFF;
  if (!flagType.trim()) return { error: 'A flag type is required.' };
  const svc = createServiceClient();
  try {
    const evidence = note.trim() ? { note: note.trim() } : {};
    const { data, error } = await svc
      .from('fraud_flags')
      .insert({
        subject_type: subjectType,
        subject_id: subjectId,
        flag_type: flagType.trim(),
        severity: severity.trim() || null,
        evidence,
      })
      .select('id')
      .single();
    if (error || !data) return { error: 'Could not raise the flag.' };
    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: 'moderation.fraud_flag.raised',
      entityType: 'fraud_flag',
      entityId: (data as { id: string }).id,
      after: { subject_type: subjectType, subject_id: subjectId, flag_type: flagType.trim() },
      reason: note.trim() || null,
    });
  } catch {
    return { error: 'Could not raise the flag. Please try again.' };
  }
  revalidatePath('/staff/moderation');
  return { ok: true, message: 'Fraud flag raised for review.' };
}

// ---------------------------------------------------------------------------
// Support tickets (§36.38)
// ---------------------------------------------------------------------------
export async function updateSupportTicket(
  ticketId: string,
  status: SupportTicketStatus,
): Promise<SafetyActionState> {
  const actor = await assertStaffActor();
  if (!actor) return NO_STAFF;
  const svc = createServiceClient();
  try {
    const { data: before } = await svc
      .from('support_tickets')
      .select('status, assigned_to')
      .eq('id', ticketId)
      .maybeSingle();
    if (!before) return { error: 'Ticket not found.' };
    const { error } = await svc
      .from('support_tickets')
      .update({ status, assigned_to: actor.viewerId })
      .eq('id', ticketId);
    if (error) return { error: 'Could not update the ticket.' };
    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: `moderation.support_ticket.${status}`,
      entityType: 'support_ticket',
      entityId: ticketId,
      before,
      after: { status },
    });
  } catch {
    return { error: 'Moderation action failed. Please try again.' };
  }
  revalidatePath('/staff/moderation');
  return { ok: true, message: 'Ticket updated.' };
}

// ---------------------------------------------------------------------------
// Content actions (§47) - hide / remove a vouch comment.
// ---------------------------------------------------------------------------
async function setCommentStatus(
  commentId: string,
  status: 'active' | 'hidden' | 'removed',
  reason: string,
  action: string,
): Promise<SafetyActionState> {
  const actor = await assertStaffActor();
  if (!actor) return NO_STAFF;
  if (status !== 'active' && requireReason(reason)) return { error: 'A reason is required.' };
  const svc = createServiceClient();
  try {
    const { data: before } = await svc
      .from('vouch_comments')
      .select('status, target_id')
      .eq('id', commentId)
      .maybeSingle();
    if (!before) return { error: 'Comment not found.' };
    const targetId = (before as { target_id: string }).target_id;
    const { error } = await svc.from('vouch_comments').update({ status }).eq('id', commentId);
    if (error) return { error: 'Could not update the comment.' };
    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action,
      entityType: 'vouch_comment',
      entityId: commentId,
      before: { status: (before as { status: string }).status },
      after: { status },
      reason: reason?.trim() || null,
    });
    revalidateTag(commentsTag(targetId));
  } catch {
    return { error: 'Moderation action failed. Please try again.' };
  }
  revalidatePath('/staff/moderation');
  return { ok: true, message: 'Comment updated.' };
}

export async function hideComment(commentId: string, reason: string): Promise<SafetyActionState> {
  return setCommentStatus(commentId, 'hidden', reason, 'moderation.content.hide');
}
export async function removeComment(commentId: string, reason: string): Promise<SafetyActionState> {
  return setCommentStatus(commentId, 'removed', reason, 'moderation.content.remove');
}
export async function restoreComment(
  commentId: string,
  reason: string,
): Promise<SafetyActionState> {
  return setCommentStatus(commentId, 'active', reason, 'moderation.content.restore');
}

// ---------------------------------------------------------------------------
// Vouch invalidation (§11.1, §11.3) - remove a vouch from scoring; recompute the target.
// ---------------------------------------------------------------------------
export async function invalidateVouch(vouchId: string, reason: string): Promise<SafetyActionState> {
  const actor = await assertStaffActor();
  if (!actor) return NO_STAFF;
  if (requireReason(reason)) return { error: 'A reason is required to invalidate a vouch.' };
  const svc = createServiceClient();
  try {
    const { data: before } = await svc
      .from('vouches')
      .select('id, status, target_id, skill_level')
      .eq('id', vouchId)
      .maybeSingle();
    if (!before) return { error: 'Vouch not found.' };
    const b = before as { status: string; target_id: string };
    if (b.status !== 'active') return { error: 'That vouch is not active.' };

    const { error } = await svc
      .from('vouches')
      .update({
        status: 'invalidated',
        invalidated_by: actor.viewerId,
        invalidation_reason: reason.trim(),
      })
      .eq('id', vouchId);
    if (error) return { error: 'Could not invalidate the vouch.' };

    await svc.from('vouch_revisions').insert({
      vouch_id: vouchId,
      changed_by: actor.viewerId,
      change_type: 'invalidated',
    });
    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: 'moderation.vouch.invalidate',
      entityType: 'vouch',
      entityId: vouchId,
      before: { status: b.status },
      after: { status: 'invalidated' },
      reason: reason.trim(),
    });
    await recomputePlayerSkillProfile(b.target_id);
  } catch {
    return { error: 'Moderation action failed. Please try again.' };
  }
  revalidatePath('/staff/moderation');
  return { ok: true, message: 'Vouch invalidated and skill profile recomputed.' };
}

// ---------------------------------------------------------------------------
// Club moderation (§15.1–§15.2) - admin verification + activity status.
// ---------------------------------------------------------------------------
export async function verifyClub(
  clubId: string,
  status: 'verified' | 'unverified' | 'rejected',
  reason: string,
): Promise<SafetyActionState> {
  const actor = await assertStaffActor();
  if (!actor) return NO_STAFF;
  const svc = createServiceClient();
  try {
    const { data: before } = await svc
      .from('clubs')
      .select('slug, verification_status')
      .eq('id', clubId)
      .maybeSingle();
    if (!before) return { error: 'Club not found.' };
    const b = before as { slug: string; verification_status: string };
    const { error } = await svc
      .from('clubs')
      .update({
        verification_status: status,
        verification_reviewed_by: actor.viewerId,
        verification_reviewed_at: new Date().toISOString(),
        verification_reason: reason?.trim() || null,
      })
      .eq('id', clubId);
    if (error) return { error: 'Could not update the club.' };
    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: `moderation.club.${status}`,
      entityType: 'club',
      entityId: clubId,
      before: { verification_status: b.verification_status },
      after: { verification_status: status },
      reason: reason?.trim() || null,
    });
    revalidateTag(CLUBS_LIST_TAG);
    revalidateTag(clubTag(b.slug));
  } catch {
    return { error: 'Moderation action failed. Please try again.' };
  }
  revalidatePath('/staff/moderation');
  return { ok: true, message: 'Club verification updated.' };
}

export async function setClubModerationStatus(
  clubId: string,
  activity: 'active' | 'suspended',
  reason: string,
): Promise<SafetyActionState> {
  const actor = await assertStaffActor();
  if (!actor) return NO_STAFF;
  if (activity === 'suspended' && requireReason(reason)) {
    return { error: 'A reason is required to suspend a club.' };
  }
  const svc = createServiceClient();
  try {
    const { data: before } = await svc
      .from('clubs')
      .select('slug, activity_status')
      .eq('id', clubId)
      .maybeSingle();
    if (!before) return { error: 'Club not found.' };
    const b = before as { slug: string; activity_status: string };
    const { error } = await svc
      .from('clubs')
      .update({ activity_status: activity, status_reason: reason?.trim() || null })
      .eq('id', clubId);
    if (error) return { error: 'Could not update the club.' };
    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: `moderation.club.${activity === 'suspended' ? 'suspend' : 'reinstate'}`,
      entityType: 'club',
      entityId: clubId,
      before: { activity_status: b.activity_status },
      after: { activity_status: activity },
      reason: reason?.trim() || null,
    });
    revalidateTag(CLUBS_LIST_TAG);
    revalidateTag(clubTag(b.slug));
  } catch {
    return { error: 'Moderation action failed. Please try again.' };
  }
  revalidatePath('/staff/moderation');
  return { ok: true, message: 'Club status updated.' };
}

/**
 * Load a target's active vouches for the moderation invalidation panel (staff-gated - reveals the
 * anonymous voucher identity only through this authorized path, §37/§4.5).
 */
export async function loadActiveVouchesForTarget(targetId: string): Promise<ModerationVouch[]> {
  return listActiveVouchesForModeration(targetId);
}

// ---------------------------------------------------------------------------
// Account actions (§47) - warn / restrict vouching / restrict account / suspend / ban / lift.
// ---------------------------------------------------------------------------
export type AccountAction =
  'warn' | 'restrict_vouching' | 'restrict_account' | 'suspend' | 'ban' | 'lift_status';

export async function applyAccountAction(
  userId: string,
  action: AccountAction,
  reason: string,
  durationDays?: number,
): Promise<SafetyActionState> {
  const actor = await assertStaffActor();
  if (!actor) return NO_STAFF;
  if (requireReason(reason)) return { error: 'A reason is required.' };
  if (userId === actor.viewerId)
    return { error: 'You cannot apply an account action to yourself.' };

  const svc = createServiceClient();
  const now = new Date().toISOString();
  const until =
    durationDays && durationDays > 0
      ? new Date(Date.now() + durationDays * DAY_MS).toISOString()
      : null;

  try {
    const { data: before } = await svc
      .from('profiles')
      .select('slug, account_status, suspended_until, vouching_restricted_until, status_reason')
      .eq('id', userId)
      .maybeSingle();
    if (!before) return { error: 'Player not found.' };
    const b = before as {
      slug: string | null;
      account_status: string;
      suspended_until: string | null;
      vouching_restricted_until: string | null;
    };

    // A warning changes no status - it is an audited advisory record only.
    if (action === 'warn') {
      await writeAudit({
        actorId: actor.viewerId,
        actorRole: actor.role,
        action: 'moderation.account.warn',
        entityType: 'profile',
        entityId: userId,
        before: { account_status: b.account_status },
        after: { account_status: b.account_status },
        reason: reason.trim(),
      });
      revalidatePath('/staff/moderation');
      return { ok: true, message: 'Warning recorded.' };
    }

    const patch: Record<string, unknown> = {
      status_reason: reason.trim(),
      status_updated_at: now,
      status_updated_by: actor.viewerId,
    };

    switch (action) {
      case 'restrict_vouching':
        // Timed vouching-only restriction (§11.3). Account stays active for browsing.
        patch.vouching_restricted_until =
          until ?? new Date(Date.now() + 3650 * DAY_MS).toISOString();
        break;
      case 'restrict_account':
        patch.account_status = 'restricted';
        break;
      case 'suspend':
        patch.account_status = 'suspended';
        patch.suspended_until = until; // null = indefinite until lifted
        break;
      case 'ban':
        patch.account_status = 'banned';
        break;
      case 'lift_status':
        patch.account_status = 'active';
        patch.suspended_until = null;
        patch.vouching_restricted_until = null;
        break;
    }

    const { error } = await svc.from('profiles').update(patch).eq('id', userId);
    if (error) return { error: 'Could not apply the account action.' };

    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: `moderation.account.${action}`,
      entityType: 'profile',
      entityId: userId,
      before: {
        account_status: b.account_status,
        suspended_until: b.suspended_until,
        vouching_restricted_until: b.vouching_restricted_until,
      },
      after: patch,
      reason: reason.trim(),
    });

    // Status affects directory visibility + the public profile.
    revalidateTag(PLAYERS_LIST_TAG);
    if (b.slug) revalidateTag(playerTag(b.slug));
  } catch {
    return { error: 'Moderation action failed. Please try again.' };
  }
  revalidatePath('/staff/moderation');
  return { ok: true, message: 'Account action applied.' };
}
