'use server';

import { revalidateTag } from 'next/cache';
import { profileCommentSchema, profileCommentEditSchema } from '@vouchplay/validation';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { getVouchSettings } from '@/lib/settings';
import { checkActorCanVouch } from '@/lib/moderation/enforcement';
import { notify } from '@/lib/notifications/create';
import { getActorMini } from '@/lib/notifications/recipients';
import { commentsTag, playerTag } from '@/lib/players/queries';

export interface CommentActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface TargetRow {
  id: string;
  slug: string | null;
  account_status: string;
  onboarded_at: string | null;
}

/**
 * Shared gate for writing on somebody's profile (master_plan §2B).
 *
 * A comment used to be a field on the vouch form, so it inherited every vouch gate for free. A
 * standalone comment is a NEW way to write on a stranger's profile, so it has to ask the same
 * questions for itself: is the actor allowed to act at all, is the target a real active player, and
 * is there a block in either direction.
 */
async function resolveTarget(
  svc: ReturnType<typeof createServiceClient>,
  actorId: string,
  targetId: string,
): Promise<{ target: TargetRow } | { error: string }> {
  if (targetId === actorId) {
    return { error: 'You cannot comment on your own profile.' };
  }

  const statusErr = await checkActorCanVouch(actorId);
  if (statusErr) return { error: statusErr };

  const [targetRes, blockRes] = await Promise.all([
    svc
      .from('profiles')
      .select('id, slug, account_status, onboarded_at')
      .eq('id', targetId)
      .maybeSingle(),
    svc
      .from('blocks')
      .select('blocker_id')
      .or(
        `and(blocker_id.eq.${actorId},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${actorId})`,
      ),
  ]);

  // A FAILED QUERY IS NOT A MISSING RECORD (v1.31). Say which one actually went wrong, or the next
  // person debugging this hunts for a deleted player that was never deleted.
  if (targetRes.error) return { error: 'Could not look up that player. Please try again.' };

  const target = targetRes.data as TargetRow | null;
  if (!target || target.account_status !== 'active' || !target.onboarded_at) {
    return { error: 'That player is not available to comment on.' };
  }
  if ((blockRes.data ?? []).length > 0) {
    return { error: 'Commenting is unavailable between you and this player.' };
  }
  return { target };
}

function revalidateComments(targetId: string, slug: string | null) {
  revalidateTag(commentsTag(targetId));
  if (slug) revalidateTag(playerTag(slug));
}

/**
 * Write or replace this viewer's comment about a player (§9.3, §10.1 - ALWAYS attributed, never
 * anonymous).
 *
 * ONE ACTIVE COMMENT PER (author, target), mirroring the one-active-vouch rule: it makes "your
 * comment" unambiguous in the UI, and it is what makes edit and delete a single obvious pair of
 * controls rather than a list the author has to disambiguate. Enforced here rather than by a unique
 * index, so a legacy duplicate could never turn into a failed deploy.
 */
export async function submitProfileComment(
  _prev: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in to comment.' };

  const parsed = profileCommentSchema.safeParse({
    targetId: formData.get('targetId'),
    body: formData.get('body') ?? '',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const { targetId, body } = parsed.data;

  const svc = createServiceClient();
  try {
    const resolved = await resolveTarget(svc, user.id, targetId);
    if ('error' in resolved) return resolved;
    const { target } = resolved;

    const since = new Date(Date.now() - DAY_MS).toISOString();
    const [existingRes, rateRes, vouchRes] = await Promise.all([
      svc
        .from('vouch_comments')
        .select('id')
        .eq('author_id', user.id)
        .eq('target_id', targetId)
        .eq('status', 'active')
        .maybeSingle(),
      svc
        .from('vouch_comments')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', user.id)
        .gte('created_at', since),
      // Link the comment to this author's rating when they have one, so the existing
      // vouch-with-comment relationship is preserved rather than quietly abandoned (§2B).
      svc
        .from('vouches')
        .select('id')
        .eq('voucher_id', user.id)
        .eq('target_id', targetId)
        .eq('status', 'active')
        .maybeSingle(),
    ]);

    const existing = existingRes.data as { id: string } | null;
    const settings = await getVouchSettings();
    const limit = settings.limits.commentsPer24h;
    if (!existing && limit > 0 && (rateRes.count ?? 0) >= limit) {
      return {
        error: `You've reached your comment limit for now (${limit} per 24 hours). Try again later.`,
      };
    }

    const vouchId = (vouchRes.data as { id: string } | null)?.id ?? null;

    if (existing) {
      const { error } = await svc
        .from('vouch_comments')
        .update({ body, vouch_id: vouchId })
        .eq('id', existing.id)
        .eq('author_id', user.id);
      if (error) return { error: 'Could not save your comment. Please try again.' };
      revalidateComments(targetId, target.slug);
      return { ok: true, message: 'Comment updated.' };
    }

    const { error } = await svc.from('vouch_comments').insert({
      vouch_id: vouchId,
      author_id: user.id,
      target_id: targetId,
      body,
    });
    if (error) return { error: 'Could not save your comment. Please try again.' };

    const me = await getActorMini(user.id);
    await notify({
      recipientId: targetId,
      type: 'vouch_comment_received',
      actorId: user.id,
      params: { actorName: me.name },
      link: target.slug ? `/players/${target.slug}` : '/me',
      entityType: 'vouch_comment',
    });

    revalidateComments(targetId, target.slug);
    return { ok: true, message: 'Comment posted.' };
  } catch {
    return { error: 'Commenting is temporarily unavailable. Please try again shortly.' };
  }
}

/** Edit one's own comment. `updated_at` is maintained by the 0004 trigger, and the UI labels the
 *  result as edited rather than rewriting it silently under a reader who saw the original. */
export async function editProfileComment(
  _prev: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };

  const parsed = profileCommentEditSchema.safeParse({
    commentId: formData.get('commentId'),
    body: formData.get('body') ?? '',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const { commentId, body } = parsed.data;

  const svc = createServiceClient();
  try {
    const { data, error: readErr } = await svc
      .from('vouch_comments')
      .select('id, author_id, target_id, status')
      .eq('id', commentId)
      .maybeSingle();
    if (readErr) return { error: 'Could not load that comment. Please try again.' };
    const row = data as {
      id: string;
      author_id: string;
      target_id: string;
      status: string;
    } | null;
    if (!row || row.status !== 'active') return { error: 'That comment is no longer available.' };
    // Authorization is server-side and by row, never by what the client sent (§37).
    if (row.author_id !== user.id) return { error: 'You can only edit your own comment.' };

    const { error } = await svc
      .from('vouch_comments')
      .update({ body })
      .eq('id', commentId)
      .eq('author_id', user.id);
    if (error) return { error: 'Could not save your change. Please try again.' };

    const { data: tp } = await svc
      .from('profiles')
      .select('slug')
      .eq('id', row.target_id)
      .maybeSingle();
    revalidateComments(row.target_id, (tp as { slug: string | null } | null)?.slug ?? null);
    return { ok: true, message: 'Comment updated.' };
  } catch {
    return { error: 'Editing is temporarily unavailable. Please try again shortly.' };
  }
}

/**
 * Delete one's own comment.
 *
 * SOFT delete to `status = 'removed'`, a value the enum has always had. It leaves every public read
 * immediately, which is what the author asked for, and the row survives for moderation: a comment
 * that was reported and then deleted by its author must not vanish from the moderation trail.
 */
export async function deleteProfileComment(commentId: string): Promise<CommentActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };

  const svc = createServiceClient();
  try {
    const { data, error: readErr } = await svc
      .from('vouch_comments')
      .select('id, author_id, target_id, status')
      .eq('id', commentId)
      .maybeSingle();
    if (readErr) return { error: 'Could not load that comment. Please try again.' };
    const row = data as {
      id: string;
      author_id: string;
      target_id: string;
      status: string;
    } | null;
    if (!row) return { error: 'That comment is no longer available.' };
    if (row.author_id !== user.id) return { error: 'You can only delete your own comment.' };
    if (row.status !== 'active') return { ok: true, message: 'Comment deleted.' };

    const { error } = await svc
      .from('vouch_comments')
      .update({ status: 'removed' })
      .eq('id', commentId)
      .eq('author_id', user.id);
    if (error) return { error: 'Could not delete the comment. Please try again.' };

    const { data: tp } = await svc
      .from('profiles')
      .select('slug')
      .eq('id', row.target_id)
      .maybeSingle();
    revalidateComments(row.target_id, (tp as { slug: string | null } | null)?.slug ?? null);
    return { ok: true, message: 'Comment deleted.' };
  } catch {
    return { error: 'Deleting is temporarily unavailable. Please try again shortly.' };
  }
}
