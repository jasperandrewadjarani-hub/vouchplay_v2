'use server';

import { revalidatePath } from 'next/cache';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import type { SafetyActionState } from './report';

/**
 * Block / unblock a player (handover §14.3, §36.34). Blocking prevents new vouch requests, partner
 * invitations, and recruitment/sponsorship between the two accounts (enforced in the initiation
 * actions via lib/moderation/enforcement.isBlockedBetween). Existing public vouches remain unless
 * separately invalidated by moderation. Only the blocker's own block rows are ever touched.
 */
export async function blockUser(targetId: string, slug?: string): Promise<SafetyActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  if (targetId === user.id) return { error: 'You cannot block yourself.' };

  const svc = createServiceClient();
  try {
    const { data: target } = await svc
      .from('profiles')
      .select('id')
      .eq('id', targetId)
      .maybeSingle();
    if (!target) return { error: 'That player could not be found.' };

    const { error } = await svc
      .from('blocks')
      .upsert(
        { blocker_id: user.id, blocked_id: targetId },
        { onConflict: 'blocker_id,blocked_id' },
      );
    if (error) return { error: 'Could not block this player. Please try again.' };
  } catch {
    return { error: 'Blocking is temporarily unavailable. Please try again shortly.' };
  }
  if (slug) revalidatePath(`/players/${slug}`);
  revalidatePath('/me/blocked');
  return { ok: true, message: 'Player blocked.' };
}

export async function unblockUser(targetId: string, slug?: string): Promise<SafetyActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { error } = await svc
      .from('blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', targetId);
    if (error) return { error: 'Could not unblock this player. Please try again.' };
  } catch {
    return { error: 'Unblocking is temporarily unavailable. Please try again shortly.' };
  }
  if (slug) revalidatePath(`/players/${slug}`);
  revalidatePath('/me/blocked');
  return { ok: true, message: 'Player unblocked.' };
}
