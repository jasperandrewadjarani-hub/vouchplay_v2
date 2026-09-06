'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import type { GlobalRole } from '@vouchplay/db';
import { createServiceClient } from '@/lib/supabase/service';
import { assertAdminActor } from '@/lib/moderation/staff';
import { writeAudit } from '@/lib/moderation/audit';
import { notify } from '@/lib/notifications/create';
import { recomputePlayerSkillProfile } from '@/lib/vouches/recompute';
import { PLAYERS_LIST_TAG, playerTag } from '@/lib/players/queries';
import type { SafetyActionState } from './report';

/**
 * User administration write actions (handover §30.1, §30.2, §30.8). Admin + aal2 only. Every write
 * records an immutable audit row and, where user-facing, a critical notification. Granting or
 * revoking an Admin/Super Admin role is restricted to Super Admins, and admins cannot change their
 * own privileged roles (anti-lockout / anti-escalation).
 */

const GRANTABLE_ROLES: readonly GlobalRole[] = [
  'coach',
  'organizer',
  'moderator',
  'support',
  'admin',
  'super_admin',
];
const PRIVILEGED: readonly GlobalRole[] = ['admin', 'super_admin'];

function requireReason(reason: string): string | null {
  return (reason ?? '').trim().length === 0 ? 'A reason is required.' : null;
}

async function invalidatePlayer(svc: ReturnType<typeof createServiceClient>, userId: string) {
  const { data } = await svc.from('profiles').select('slug').eq('id', userId).maybeSingle();
  const slug = (data as { slug?: string } | null)?.slug;
  if (slug) revalidateTag(playerTag(slug));
  revalidateTag(PLAYERS_LIST_TAG);
}

export async function grantRole(
  userId: string,
  role: string,
  reason: string,
): Promise<SafetyActionState> {
  const actor = await assertAdminActor();
  if (!actor) return { error: 'Admin access with a stepped-up (two-factor) session is required.' };
  if (!GRANTABLE_ROLES.includes(role as GlobalRole)) return { error: 'Unknown role.' };
  const r = role as GlobalRole;
  if (PRIVILEGED.includes(r) && actor.role !== 'super_admin') {
    return { error: 'Only a Super Admin can grant Admin or Super Admin.' };
  }
  if (requireReason(reason)) return { error: 'A reason is required.' };

  const svc = createServiceClient();
  try {
    const { data: existing } = await svc
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('role', r)
      .eq('status', 'active')
      .maybeSingle();
    if (existing) return { error: 'The user already has that role.' };

    const { error } = await svc.from('user_roles').insert({
      user_id: userId,
      role: r,
      status: 'active',
      approved_by: actor.viewerId,
      approved_at: new Date().toISOString(),
      reason: reason.trim(),
    });
    if (error) return { error: 'Could not grant the role.' };

    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: `admin.role.grant.${r}`,
      entityType: 'user_role',
      entityId: userId,
      before: { role: r, active: false },
      after: { role: r, active: true },
      reason: reason.trim(),
    });
    await notify({
      recipientId: userId,
      type: 'account_security',
      params: { reason: `You were granted the ${r.replace('_', ' ')} role.` },
      link: '/me',
      entityType: 'user_role',
      entityId: userId,
    });
    await invalidatePlayer(svc, userId);
  } catch {
    return { error: 'That action failed. Please try again.' };
  }
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true, message: `Granted ${r.replace('_', ' ')}.` };
}

export async function revokeRole(
  userId: string,
  role: string,
  reason: string,
): Promise<SafetyActionState> {
  const actor = await assertAdminActor();
  if (!actor) return { error: 'Admin access with a stepped-up (two-factor) session is required.' };
  if (!GRANTABLE_ROLES.includes(role as GlobalRole)) return { error: 'Unknown role.' };
  const r = role as GlobalRole;
  if (PRIVILEGED.includes(r) && actor.role !== 'super_admin') {
    return { error: 'Only a Super Admin can revoke Admin or Super Admin.' };
  }
  if (PRIVILEGED.includes(r) && userId === actor.viewerId) {
    return { error: 'You cannot revoke your own privileged role.' };
  }
  if (requireReason(reason)) return { error: 'A reason is required.' };

  const svc = createServiceClient();
  try {
    const { data: existing } = await svc
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('role', r)
      .eq('status', 'active')
      .maybeSingle();
    if (!existing) return { error: 'The user does not have that active role.' };

    const { error } = await svc
      .from('user_roles')
      .update({
        status: 'revoked',
        revoked_by: actor.viewerId,
        revoked_at: new Date().toISOString(),
        reason: reason.trim(),
      })
      .eq('id', (existing as { id: string }).id);
    if (error) return { error: 'Could not revoke the role.' };

    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: `admin.role.revoke.${r}`,
      entityType: 'user_role',
      entityId: userId,
      before: { role: r, active: true },
      after: { role: r, active: false },
      reason: reason.trim(),
    });
    await notify({
      recipientId: userId,
      type: 'account_security',
      params: { reason: `Your ${r.replace('_', ' ')} role was removed.` },
      link: '/me',
      entityType: 'user_role',
      entityId: userId,
    });
    await invalidatePlayer(svc, userId);
  } catch {
    return { error: 'That action failed. Please try again.' };
  }
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true, message: `Revoked ${r.replace('_', ' ')}.` };
}

/**
 * Manual Skill-Verified override (handover §30.1 "manual skill verification", §10.8). Recompute
 * first so the profile row exists with the correct algorithm version, then set/clear the
 * admin_override; a subsequent vouch-driven recompute preserves an active override. Does NOT alter
 * the calculated STS/CSL - it only flips the verified badge, keeping the four concepts separate.
 */
export async function setManualSkillVerified(
  userId: string,
  on: boolean,
  reason: string,
): Promise<SafetyActionState> {
  const actor = await assertAdminActor();
  if (!actor) return { error: 'Admin access with a stepped-up (two-factor) session is required.' };
  if (requireReason(reason)) return { error: 'A reason is required.' };

  const svc = createServiceClient();
  try {
    const { data: before } = await svc
      .from('player_skill_profiles')
      .select('skill_verified, verification_type')
      .eq('player_id', userId)
      .maybeSingle();

    if (on) {
      // Ensure the row exists (correct algorithm_version) before flipping the override.
      await recomputePlayerSkillProfile(userId);
      const { error } = await svc
        .from('player_skill_profiles')
        .update({ verification_type: 'admin_override', skill_verified: true })
        .eq('player_id', userId);
      if (error) return { error: 'Could not set the skill-verified override.' };
    } else {
      // Clear the override, then recompute so the badge falls back to the community determination.
      await svc
        .from('player_skill_profiles')
        .update({ verification_type: 'none' })
        .eq('player_id', userId);
      await recomputePlayerSkillProfile(userId);
    }

    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: on ? 'admin.skill_verified.grant' : 'admin.skill_verified.revoke',
      entityType: 'player_skill_profile',
      entityId: userId,
      before: (before as Record<string, unknown> | null) ?? { skill_verified: false },
      after: { skill_verified: on, verification_type: on ? 'admin_override' : 'recomputed' },
      reason: reason.trim(),
    });
    await notify({
      recipientId: userId,
      type: 'account_security',
      params: {
        reason: on
          ? 'You were granted a Skill-Verified badge by an administrator.'
          : 'An administrator removed your Skill-Verified override.',
      },
      link: '/me',
      entityType: 'player_skill_profile',
      entityId: userId,
    });
    await invalidatePlayer(svc, userId);
  } catch {
    return { error: 'That action failed. Please try again.' };
  }
  revalidatePath(`/admin/users/${userId}`);
  return {
    ok: true,
    message: on ? 'Skill-Verified override set.' : 'Skill-Verified override removed.',
  };
}
