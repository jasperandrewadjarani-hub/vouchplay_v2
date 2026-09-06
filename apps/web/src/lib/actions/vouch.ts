'use server';

import { revalidatePath } from 'next/cache';
import { vouchSchema, vouchRequestSchema } from '@vouchplay/validation';
import { effectiveWeight, WEIGHT_RULE_VERSION } from '@vouchplay/core';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { getVouchSettings } from '@/lib/settings';
import { recomputePlayerSkillProfile } from '@/lib/vouches/recompute';
import { checkActorCanVouch } from '@/lib/moderation/enforcement';

export interface VouchActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function bool(formData: FormData, name: string): boolean {
  const v = formData.get(name);
  return v === 'on' || v === 'true' || v === '1';
}

/**
 * Create or update a vouch (handover §10.1–§10.6). Enforces the LOCKED rules server-side:
 * no self-vouch, both accounts active, not blocked either way, coach weight only for approved
 * coaches, one active vouch per pair (update replaces + records a revision), rolling 24h limit,
 * and the update cooldown (admin setting; default 1 day). Recomputes the target's skill profile on success.
 */
export async function submitVouch(
  _prev: VouchActionState,
  formData: FormData,
): Promise<VouchActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in to vouch.' };

  const parsed = vouchSchema.safeParse({
    targetId: formData.get('targetId'),
    skillLevel: formData.get('skillLevel'),
    interactionType: formData.get('interactionType'),
    asCoach: bool(formData, 'asCoach'),
    anonymous: bool(formData, 'anonymous'),
    comment: formData.get('comment') ?? '',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const v = parsed.data;

  if (v.targetId === user.id) return { error: 'You cannot vouch for yourself.' };

  const svc = createServiceClient();
  const settings = await getVouchSettings();
  const since = new Date(Date.now() - DAY_MS).toISOString();

  try {
    // Actor status gate (account_status + timed vouching/suspension restriction), defensive so it
    // works whether or not migration 0005's timed columns exist yet (§11.3, §47).
    const statusErr = await checkActorCanVouch(user.id);
    if (statusErr) return { error: statusErr };

    const [targetRes, coachRes, idvRes, blockRes, existingRes, actionsRes] = await Promise.all([
      svc
        .from('profiles')
        .select('id, account_status, onboarded_at')
        .eq('id', v.targetId)
        .maybeSingle(),
      svc
        .from('user_roles')
        .select('id')
        .eq('user_id', user.id)
        .eq('role', 'coach')
        .eq('status', 'active')
        .maybeSingle(),
      svc
        .from('identity_verifications')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .maybeSingle(),
      svc
        .from('blocks')
        .select('blocker_id')
        .or(
          `and(blocker_id.eq.${user.id},blocked_id.eq.${v.targetId}),and(blocker_id.eq.${v.targetId},blocked_id.eq.${user.id})`,
        ),
      svc
        .from('vouches')
        .select('id, skill_level, visibility, effective_weight, updated_at')
        .eq('voucher_id', user.id)
        .eq('target_id', v.targetId)
        .eq('status', 'active')
        .maybeSingle(),
      svc
        .from('vouch_revisions')
        .select('id', { count: 'exact', head: true })
        .eq('changed_by', user.id)
        .gte('created_at', since),
    ]);

    const target = targetRes.data as {
      id: string;
      account_status: string;
      onboarded_at: string | null;
    } | null;
    if (!target || target.account_status !== 'active' || !target.onboarded_at) {
      return { error: 'That player is not available to vouch for.' };
    }
    if ((blockRes.data ?? []).length > 0) {
      return { error: 'Vouching is unavailable between you and this player.' };
    }

    const isCoach = !!coachRes.data;
    const voucherIdentityVerified = !!idvRes.data;
    const usedCoachWeight = v.asCoach && isCoach;
    const weight = effectiveWeight({ usedCoachWeight, voucherIdentityVerified }, settings.weights);

    // Rolling 24h limit (§10.3): count vouch actions (revisions) in the window.
    const limit = isCoach ? settings.limits.coachPer24h : settings.limits.playerPer24h;
    if ((actionsRes.count ?? 0) >= limit) {
      return {
        error: `You've reached your vouch limit for now (${limit} per 24 hours). Try again later.`,
      };
    }

    const existing = existingRes.data as {
      id: string;
      skill_level: number;
      visibility: string;
      effective_weight: number;
      updated_at: string;
    } | null;

    let vouchId: string;
    if (existing) {
      // Update cooldown (§10.4).
      const ageMs = Date.now() - new Date(existing.updated_at).getTime();
      const cooldownMs = settings.limits.updateCooldownDays * DAY_MS;
      if (ageMs < cooldownMs) {
        const daysLeft = Math.ceil((cooldownMs - ageMs) / DAY_MS);
        return {
          error: `You can update this vouch in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
        };
      }
      const { error } = await svc
        .from('vouches')
        .update({
          skill_level: v.skillLevel,
          interaction_type: v.interactionType,
          visibility: v.anonymous ? 'anonymous' : 'public',
          used_coach_weight: usedCoachWeight,
          effective_weight: weight,
          weight_rule_version: WEIGHT_RULE_VERSION,
        })
        .eq('id', existing.id);
      if (error) return { error: 'Could not update your vouch. Please try again.' };
      vouchId = existing.id;
      await svc.from('vouch_revisions').insert({
        vouch_id: vouchId,
        previous_skill_level: existing.skill_level,
        new_skill_level: v.skillLevel,
        previous_visibility: existing.visibility,
        new_visibility: v.anonymous ? 'anonymous' : 'public',
        previous_weight: existing.effective_weight,
        new_weight: weight,
        changed_by: user.id,
        change_type: 'updated',
      });
    } else {
      const { data: created, error } = await svc
        .from('vouches')
        .insert({
          voucher_id: user.id,
          target_id: v.targetId,
          skill_level: v.skillLevel,
          interaction_type: v.interactionType,
          visibility: v.anonymous ? 'anonymous' : 'public',
          used_coach_weight: usedCoachWeight,
          effective_weight: weight,
          weight_rule_version: WEIGHT_RULE_VERSION,
          status: 'active',
        })
        .select('id')
        .single();
      if (error || !created) return { error: 'Could not save your vouch. Please try again.' };
      vouchId = (created as { id: string }).id;
      await svc.from('vouch_revisions').insert({
        vouch_id: vouchId,
        new_skill_level: v.skillLevel,
        new_visibility: v.anonymous ? 'anonymous' : 'public',
        new_weight: weight,
        changed_by: user.id,
        change_type: 'created',
      });
    }

    // Optional comment - ALWAYS attributed (§10.1), never anonymous.
    if (v.comment && v.comment.trim()) {
      await svc.from('vouch_comments').insert({
        vouch_id: vouchId,
        author_id: user.id,
        target_id: v.targetId,
        body: v.comment.trim(),
      });
    }

    // Fulfill a pending request from this target to me (§12).
    await svc
      .from('vouch_requests')
      .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() })
      .eq('requester_id', v.targetId)
      .eq('recipient_id', user.id)
      .eq('status', 'pending');

    await recomputePlayerSkillProfile(v.targetId);
  } catch {
    return { error: 'Vouching is temporarily unavailable. Please try again shortly.' };
  }

  return { ok: true, message: 'Vouch saved. Thank you for helping build the community profile.' };
}

/** Withdraw one's own active vouch (§10.2). Records a revision and recomputes. */
export async function withdrawVouch(targetId: string): Promise<VouchActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const svc = createServiceClient();
  try {
    const { data: existing } = await svc
      .from('vouches')
      .select('id')
      .eq('voucher_id', user.id)
      .eq('target_id', targetId)
      .eq('status', 'active')
      .maybeSingle();
    if (!existing) return { error: 'No active vouch to withdraw.' };
    const id = (existing as { id: string }).id;
    await svc.from('vouches').update({ status: 'withdrawn' }).eq('id', id);
    await svc
      .from('vouch_revisions')
      .insert({ vouch_id: id, changed_by: user.id, change_type: 'withdrawn' });
    await recomputePlayerSkillProfile(targetId);
  } catch {
    return { error: 'Could not withdraw the vouch right now.' };
  }
  return { ok: true, message: 'Vouch withdrawn.' };
}

/** Request a vouch from another player (§12). One pending request per pair; rate-limited. */
export async function requestVouch(
  _prev: VouchActionState,
  formData: FormData,
): Promise<VouchActionState> {
  const user = await getOptionalUser();
  if (!user) return { error: 'Please sign in.' };
  const parsed = vouchRequestSchema.safeParse({
    recipientId: formData.get('recipientId'),
    message: formData.get('message') ?? '',
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const { recipientId, message } = parsed.data;
  if (recipientId === user.id) return { error: 'You cannot request a vouch from yourself.' };

  const svc = createServiceClient();
  const since = new Date(Date.now() - DAY_MS).toISOString();
  try {
    const statusErr = await checkActorCanVouch(user.id);
    if (statusErr) return { error: statusErr };
    const [blockRes, dupRes, rateRes] = await Promise.all([
      svc
        .from('blocks')
        .select('blocker_id')
        .or(
          `and(blocker_id.eq.${user.id},blocked_id.eq.${recipientId}),and(blocker_id.eq.${recipientId},blocked_id.eq.${user.id})`,
        ),
      svc
        .from('vouch_requests')
        .select('id')
        .eq('requester_id', user.id)
        .eq('recipient_id', recipientId)
        .eq('status', 'pending')
        .maybeSingle(),
      svc
        .from('vouch_requests')
        .select('id', { count: 'exact', head: true })
        .eq('requester_id', user.id)
        .gte('created_at', since),
    ]);
    if ((blockRes.data ?? []).length > 0) return { error: 'That request is unavailable.' };
    if (dupRes.data) return { error: 'You already have a pending request to this player.' };
    const settings = await getVouchSettings();
    if ((rateRes.count ?? 0) >= settings.limits.requestsPer24h) {
      return {
        error: `You've reached your request limit (${settings.limits.requestsPer24h} per 24 hours).`,
      };
    }
    const { error } = await svc.from('vouch_requests').insert({
      requester_id: user.id,
      recipient_id: recipientId,
      message: message && message.trim() ? message.trim() : null,
    });
    if (error) return { error: 'Could not send the request. Please try again.' };
  } catch {
    return { error: 'Requests are temporarily unavailable. Please try again shortly.' };
  }
  revalidatePath('/players');
  return { ok: true, message: 'Vouch request sent.' };
}
