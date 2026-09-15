'use server';

import { revalidateTag } from 'next/cache';
import { badgeDef, isEventBadgeKey } from '@vouchplay/config';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { assertAdminActor } from '@/lib/moderation/staff';
import { writeAudit } from '@/lib/moderation/audit';
import { notify } from '@/lib/notifications/create';
import { getBadgeSettings } from '@/lib/settings';
import { PLAYERS_LIST_TAG, playerTag } from '@/lib/players/queries';
import { computeAutoBadges } from '@/lib/badges/compute';
import type { BadgeActionResult } from '@/lib/badges/types';

/**
 * Badge admin + owner actions (master_plan §2BK B). Admin actions require an admin/super_admin with
 * a stepped-up (aal2) session (`assertAdminActor` - the same guard as every other Admin Control
 * Center write) and write one `audit_logs` row each. Owner actions (pin/hide/celebrate) only ever
 * touch the caller's own rows.
 */

async function slugFor(playerId: string): Promise<string | null> {
  try {
    const svc = createServiceClient();
    const { data } = await svc.from('profiles').select('slug').eq('id', playerId).maybeSingle();
    return (data as { slug: string | null } | null)?.slug ?? null;
  } catch {
    return null;
  }
}

async function revalidatePlayer(playerId: string): Promise<void> {
  revalidateTag(PLAYERS_LIST_TAG);
  const slug = await slugFor(playerId);
  if (slug) revalidateTag(playerTag(slug));
}

// ---------------------------------------------------------------------------
// Admin: tag / untag / allow-auto-again / recompute / event badge
// ---------------------------------------------------------------------------

export interface AdminTagBadgeInput {
  playerId: string;
  badgeKey: string;
  reason: string;
  event?: string;
  division?: string;
  expiresAt?: string | null;
}

export async function adminTagBadge(input: AdminTagBadgeInput): Promise<BadgeActionResult> {
  const actor = await assertAdminActor();
  if (!actor)
    return { ok: false, error: 'Admin access with a stepped-up (two-factor) session is required.' };

  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, error: 'Give a reason of at least 3 characters.' };
  if (isEventBadgeKey(input.badgeKey)) {
    return { ok: false, error: 'Event badges are set from Event badges, not tagged here.' };
  }
  const def = badgeDef(input.badgeKey);
  if (!def) return { ok: false, error: 'Unknown badge.' };
  if (def.titleBadge && !input.event?.trim()) {
    return { ok: false, error: 'This badge names an event - give the tournament/event name.' };
  }

  try {
    const svc = createServiceClient();
    const settings = await getBadgeSettings();
    const { data: existingRaw } = await svc
      .from('player_badges')
      .select('id, tally, meta')
      .eq('player_id', input.playerId)
      .eq('badge_key', input.badgeKey)
      .is('revoked_at', null)
      .maybeSingle();
    const existing = existingRaw as {
      id: string;
      tally: number;
      meta: Record<string, unknown> | null;
    } | null;

    const meta: Record<string, unknown> = { ...(existing?.meta ?? {}) };
    if (input.event?.trim()) meta.event = input.event.trim();
    if (input.division?.trim()) meta.division = input.division.trim();

    const defaultExpiry = (): string | null => {
      if (input.badgeKey === 'champion') {
        return new Date(
          Date.now() + settings.rules.championWindowMonths * 30 * 86400000,
        ).toISOString();
      }
      if (input.badgeKey === 'podium') {
        return new Date(
          Date.now() + settings.rules.podiumWindowMonths * 30 * 86400000,
        ).toISOString();
      }
      return null;
    };
    const expiresAt =
      input.expiresAt !== undefined ? input.expiresAt : existing ? undefined : defaultExpiry();

    if (existing) {
      const { error } = await svc
        .from('player_badges')
        .update({
          source: 'grant',
          tally: Math.max(1, existing.tally ?? 1),
          meta,
          granted_by: actor.viewerId,
          grant_reason: reason,
          ...(expiresAt !== undefined ? { expires_at: expiresAt } : {}),
        })
        .eq('id', existing.id);
      if (error) return { ok: false, error: 'Could not save the tag. Please try again.' };
    } else {
      const { error } = await svc.from('player_badges').insert({
        player_id: input.playerId,
        badge_key: input.badgeKey,
        source: 'grant',
        tally: 1,
        meta,
        granted_by: actor.viewerId,
        grant_reason: reason,
        expires_at: expiresAt ?? null,
      });
      if (error) return { ok: false, error: 'Could not save the tag. Please try again.' };
    }

    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: 'badge.tag',
      entityType: 'player_badge',
      entityId: input.playerId,
      after: { badgeKey: input.badgeKey, meta, expiresAt: expiresAt ?? null },
      reason,
    });

    await notify({
      recipientId: input.playerId,
      type: 'badge_granted',
      params: {
        extra: typeof meta.event === 'string' ? `${def.name} (${meta.event})` : def.name,
        reason,
      },
      link: '/me',
      entityType: 'player_badge',
    });

    await revalidatePlayer(input.playerId);
    return { ok: true, message: `${def.name} tagged.` };
  } catch {
    return { ok: false, error: 'That action is temporarily unavailable.' };
  }
}

export interface AdminUntagBadgeInput {
  playerBadgeId: string;
  reason: string;
  keepOff: boolean;
}

export async function adminUntagBadge(input: AdminUntagBadgeInput): Promise<BadgeActionResult> {
  const actor = await assertAdminActor();
  if (!actor)
    return { ok: false, error: 'Admin access with a stepped-up (two-factor) session is required.' };
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, error: 'Give a reason of at least 3 characters.' };

  try {
    const svc = createServiceClient();
    const { data: rowRaw } = await svc
      .from('player_badges')
      .select('id, player_id, badge_key')
      .eq('id', input.playerBadgeId)
      .is('revoked_at', null)
      .maybeSingle();
    const row = rowRaw as { id: string; player_id: string; badge_key: string } | null;
    if (!row) return { ok: false, error: 'That badge is no longer live.' };

    const { error } = await svc
      .from('player_badges')
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: actor.viewerId,
        revoke_reason: reason,
        auto_blocked: input.keepOff,
      })
      .eq('id', row.id);
    if (error) return { ok: false, error: 'Could not remove the badge. Please try again.' };

    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: 'badge.untag',
      entityType: 'player_badge',
      entityId: row.player_id,
      after: { badgeKey: row.badge_key, keepOff: input.keepOff },
      reason,
    });

    await notify({
      recipientId: row.player_id,
      type: 'badge_revoked',
      params: { extra: badgeDef(row.badge_key)?.name ?? row.badge_key, reason },
      link: '/me',
      entityType: 'player_badge',
      skipPush: true, // §2BK: revoke is in-app only.
    });

    await revalidatePlayer(row.player_id);
    return { ok: true, message: 'Badge removed.' };
  } catch {
    return { ok: false, error: 'That action is temporarily unavailable.' };
  }
}

export interface AdminAllowAutoAgainInput {
  playerId: string;
  badgeKey: string;
}

export async function adminAllowAutoAgain(
  input: AdminAllowAutoAgainInput,
): Promise<BadgeActionResult> {
  const actor = await assertAdminActor();
  if (!actor)
    return { ok: false, error: 'Admin access with a stepped-up (two-factor) session is required.' };
  try {
    const svc = createServiceClient();
    const { error } = await svc
      .from('player_badges')
      .update({ auto_blocked: false })
      .eq('player_id', input.playerId)
      .eq('badge_key', input.badgeKey)
      .not('revoked_at', 'is', null)
      .eq('auto_blocked', true);
    if (error) return { ok: false, error: 'Could not lift the block. Please try again.' };

    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: 'badge.allow_auto_again',
      entityType: 'player_badge',
      entityId: input.playerId,
      after: { badgeKey: input.badgeKey },
    });

    await revalidatePlayer(input.playerId);
    return { ok: true, message: 'The automatic rule can award this badge again.' };
  } catch {
    return { ok: false, error: 'That action is temporarily unavailable.' };
  }
}

export async function adminRecomputeBadges(): Promise<BadgeActionResult> {
  const actor = await assertAdminActor();
  if (!actor)
    return { ok: false, error: 'Admin access with a stepped-up (two-factor) session is required.' };
  try {
    const result = await computeAutoBadges();
    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: 'badge.recompute',
      entityType: 'player_badges',
      entityId: null,
      after: { ...result },
    });
    revalidateTag(PLAYERS_LIST_TAG);
    return {
      ok: true,
      message: `Awarded ${result.awarded}, updated ${result.updated}, retired ${result.retired}${
        result.skippedBlocked ? `, skipped ${result.skippedBlocked} blocked` : ''
      }.`,
    };
  } catch {
    return { ok: false, error: 'The recompute could not run. Please try again.' };
  }
}

async function confirmedEntrantIds(
  svc: ReturnType<typeof createServiceClient>,
  tournamentId: string,
): Promise<string[]> {
  const { data: teamRows } = await svc.from('teams').select('id').eq('tournament_id', tournamentId);
  const teamIds = ((teamRows ?? []) as { id: string }[]).map((t) => t.id);
  if (teamIds.length === 0) return [];
  const { data: regRows } = await svc
    .from('registrations')
    .select('team_id')
    .in('team_id', teamIds)
    .eq('status', 'confirmed');
  const confirmedTeamIds = ((regRows ?? []) as { team_id: string }[]).map((r) => r.team_id);
  if (confirmedTeamIds.length === 0) return [];
  const { data: memberRows } = await svc
    .from('team_members')
    .select('player_id')
    .in('team_id', confirmedTeamIds);
  return Array.from(
    new Set(((memberRows ?? []) as { player_id: string }[]).map((m) => m.player_id)),
  );
}

export interface AdminSetEventBadgeInput {
  tournamentId: string;
  label: string | null;
}

export async function adminSetEventBadge(
  input: AdminSetEventBadgeInput,
): Promise<BadgeActionResult> {
  const actor = await assertAdminActor();
  if (!actor)
    return { ok: false, error: 'Admin access with a stepped-up (two-factor) session is required.' };
  try {
    const svc = createServiceClient();
    const label = input.label?.trim() || null;
    const { error } = await svc
      .from('tournaments')
      .update({ commemorative_badge_label: label })
      .eq('id', input.tournamentId);
    if (error) return { ok: false, error: 'Could not save the event badge label.' };

    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: 'badge.event_label.set',
      entityType: 'tournament',
      entityId: input.tournamentId,
      after: { label },
    });

    const entrantIds = await confirmedEntrantIds(svc, input.tournamentId);
    const result =
      entrantIds.length > 0
        ? await computeAutoBadges({ playerIds: entrantIds })
        : { awarded: 0, updated: 0, retired: 0, skippedBlocked: 0 };

    revalidateTag(PLAYERS_LIST_TAG);
    for (const playerId of entrantIds) await revalidatePlayer(playerId);

    return {
      ok: true,
      message: label
        ? `Event badge set. ${result.awarded} awarded, ${result.updated} updated.`
        : `Event badge cleared. ${result.retired} retired.`,
    };
  } catch {
    return { ok: false, error: 'That action is temporarily unavailable.' };
  }
}

// ---------------------------------------------------------------------------
// Owner actions: pin / hide / celebrate
// ---------------------------------------------------------------------------

export async function pinMyBadge(badgeKey: string | null): Promise<BadgeActionResult> {
  const user = await getOptionalUser();
  if (!user) return { ok: false, error: 'Please sign in.' };
  try {
    const svc = createServiceClient();
    if (badgeKey != null) {
      const { data } = await svc
        .from('player_badges')
        .select('id')
        .eq('player_id', user.id)
        .eq('badge_key', badgeKey)
        .is('revoked_at', null)
        .maybeSingle();
      if (!data) return { ok: false, error: 'You do not hold that badge right now.' };
    }
    const { error } = await svc
      .from('profiles')
      .update({ pinned_badge_key: badgeKey })
      .eq('id', user.id);
    if (error) return { ok: false, error: 'Could not pin that badge. Please try again.' };
    await revalidatePlayer(user.id);
    return { ok: true };
  } catch {
    return { ok: false, error: 'That action is temporarily unavailable.' };
  }
}

export async function setMyBadgeHidden(
  playerBadgeId: string,
  hidden: boolean,
): Promise<BadgeActionResult> {
  const user = await getOptionalUser();
  if (!user) return { ok: false, error: 'Please sign in.' };
  try {
    const svc = createServiceClient();
    const { data: rowRaw } = await svc
      .from('player_badges')
      .select('id, player_id')
      .eq('id', playerBadgeId)
      .maybeSingle();
    const row = rowRaw as { id: string; player_id: string } | null;
    if (!row || row.player_id !== user.id) return { ok: false, error: 'Badge not found.' };
    const { error } = await svc.from('player_badges').update({ hidden }).eq('id', playerBadgeId);
    if (error) return { ok: false, error: 'Could not update that badge. Please try again.' };
    await revalidatePlayer(user.id);
    return { ok: true };
  } catch {
    return { ok: false, error: 'That action is temporarily unavailable.' };
  }
}

export async function markBadgesCelebrated(ids: string[]): Promise<BadgeActionResult> {
  const user = await getOptionalUser();
  if (!user) return { ok: false, error: 'Please sign in.' };
  if (ids.length === 0) return { ok: true };
  try {
    const svc = createServiceClient();
    const { error } = await svc
      .from('player_badges')
      .update({ celebrated_at: new Date().toISOString() })
      .in('id', ids)
      .eq('player_id', user.id);
    if (error) return { ok: false, error: 'Could not save that. Please try again.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'That action is temporarily unavailable.' };
  }
}
