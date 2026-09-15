'use server';

import { revalidateTag } from 'next/cache';
import { badgeDef, isEventBadgeKey } from '@vouchplay/config';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { assertAdminActor } from '@/lib/moderation/staff';
import { writeAudit } from '@/lib/moderation/audit';
import { notify } from '@/lib/notifications/create';
import { getBadgeSettings, type BadgeSettings } from '@/lib/settings';
import { PLAYERS_LIST_TAG, playerTag } from '@/lib/players/queries';
import { computeAutoBadges } from '@/lib/badges/compute';
import { getPlayerBadgesForAdmin } from '@/lib/badges/queries';
import { getUserAdminDetail, listPlayersForBadgeTagging } from '@/lib/admin/user-queries';
import type { AdminBadgeTagPlayer } from '@/lib/admin/user-queries';
import type { AdminPlayerBadge, BadgeActionResult } from '@/lib/badges/types';

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

interface TagRowResult {
  outcome: 'inserted' | 'converted' | 'updated' | 'skipped' | 'failed';
  meta: Record<string, unknown>;
  expiresAt: string | null;
}

/**
 * The one place that actually writes a `player_badges` row for an admin tag (master_plan §2BL E) -
 * shared by `adminTagBadge` (single) and `adminTagBadgesBatch`. No audit/notify/revalidate here;
 * callers own those so single-tag callers can keep their exact prior behaviour (always write, one
 * audit row, one notification) while the batch caller can fan those out differently (one audit row
 * per player, notifications deferred, skip-if-already-granted).
 *
 * `opts.skipIfAlreadyGrant`: when true and a live row already exists with `source = 'grant'`, the
 * row is left untouched and `'skipped'` is returned - the batch's "skip when the player already
 * holds it live as grant" rule (§2BL E). When false (the single-tag caller), an existing row of
 * either source is always refreshed with the new reason/meta/expiry, matching `adminTagBadge`'s
 * pre-refactor behaviour exactly.
 */
async function writeBadgeTagRow(
  svc: ReturnType<typeof createServiceClient>,
  settings: BadgeSettings,
  input: {
    playerId: string;
    badgeKey: string;
    reason: string;
    event?: string;
    division?: string;
    expiresAt?: string | null;
    grantedBy: string;
  },
  opts: { skipIfAlreadyGrant: boolean },
): Promise<TagRowResult> {
  try {
    const { data: existingRaw } = await svc
      .from('player_badges')
      .select('id, tally, meta, source')
      .eq('player_id', input.playerId)
      .eq('badge_key', input.badgeKey)
      .is('revoked_at', null)
      .maybeSingle();
    const existing = existingRaw as {
      id: string;
      tally: number;
      meta: Record<string, unknown> | null;
      source: 'auto' | 'grant';
    } | null;

    if (existing && existing.source === 'grant' && opts.skipIfAlreadyGrant) {
      return { outcome: 'skipped', meta: existing.meta ?? {}, expiresAt: null };
    }

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
          granted_by: input.grantedBy,
          grant_reason: input.reason,
          ...(expiresAt !== undefined ? { expires_at: expiresAt } : {}),
        })
        .eq('id', existing.id);
      if (error) return { outcome: 'failed', meta, expiresAt: expiresAt ?? null };
      return {
        outcome: existing.source === 'auto' ? 'converted' : 'updated',
        meta,
        expiresAt: expiresAt ?? null,
      };
    }

    const { error } = await svc.from('player_badges').insert({
      player_id: input.playerId,
      badge_key: input.badgeKey,
      source: 'grant',
      tally: 1,
      meta,
      granted_by: input.grantedBy,
      grant_reason: input.reason,
      expires_at: expiresAt ?? null,
    });
    if (error) return { outcome: 'failed', meta, expiresAt: expiresAt ?? null };
    return { outcome: 'inserted', meta, expiresAt: expiresAt ?? null };
  } catch {
    return { outcome: 'failed', meta: {}, expiresAt: null };
  }
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
    const result = await writeBadgeTagRow(
      svc,
      settings,
      {
        playerId: input.playerId,
        badgeKey: input.badgeKey,
        reason,
        event: input.event,
        division: input.division,
        expiresAt: input.expiresAt,
        grantedBy: actor.viewerId,
      },
      // Never skip for the single-tag flow - exact pre-refactor behaviour (always write).
      { skipIfAlreadyGrant: false },
    );
    if (result.outcome === 'failed') {
      return { ok: false, error: 'Could not save the tag. Please try again.' };
    }

    await writeAudit({
      actorId: actor.viewerId,
      actorRole: actor.role,
      action: 'badge.tag',
      entityType: 'player_badge',
      entityId: input.playerId,
      after: { badgeKey: input.badgeKey, meta: result.meta, expiresAt: result.expiresAt },
      reason,
    });

    await notify({
      recipientId: input.playerId,
      type: 'badge_granted',
      params: {
        extra:
          typeof result.meta.event === 'string' ? `${def.name} (${result.meta.event})` : def.name,
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

export interface AdminTagBadgesBatchInput {
  playerIds: string[];
  badgeKeys: string[];
  reason: string;
  event?: string;
  division?: string;
  expiresAt?: string | null;
}

export type AdminTagBadgesBatchResult =
  | { ok: true; tagged: number; skipped: number; failed: number; message: string }
  | { ok: false; error: string };

/**
 * Single-screen batch tagging (master_plan §2BL E): several badges onto several players at once.
 * Reuses `writeBadgeTagRow` per (player, badge) pair with `skipIfAlreadyGrant: true` - a player who
 * already holds a badge as an admin grant is left alone and counted as skipped, while a live `auto`
 * row is converted to `grant` and counted as tagged, same as a brand-new row.
 *
 * DB writes happen first and are what the response's counts reflect; notifications for newly-tagged
 * pairs are deferred to `after()` (Next 15.5) so a 100 x 10 batch's worst case (up to 1000 pairs,
 * though the two caps below keep any single call far smaller) never makes the admin's click wait on
 * push/in-app fan-out. One `audit_logs` row is written per player (not per pair), listing every
 * badge key and its outcome. Cache tags are revalidated once at the end, not per write.
 */
export async function adminTagBadgesBatch(
  input: AdminTagBadgesBatchInput,
): Promise<AdminTagBadgesBatchResult> {
  const actor = await assertAdminActor();
  if (!actor)
    return { ok: false, error: 'Admin access with a stepped-up (two-factor) session is required.' };

  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, error: 'Give a reason of at least 3 characters.' };

  const playerIds = Array.from(new Set(input.playerIds));
  if (playerIds.length === 0) return { ok: false, error: 'Choose at least one player.' };
  if (playerIds.length > 100) return { ok: false, error: 'Choose at most 100 players at once.' };

  const badgeKeys = Array.from(new Set(input.badgeKeys));
  if (badgeKeys.length === 0) return { ok: false, error: 'Choose at least one badge.' };
  if (badgeKeys.length > 10) return { ok: false, error: 'Choose at most 10 badges at once.' };
  if (badgeKeys.some((k) => isEventBadgeKey(k))) {
    return { ok: false, error: 'Event badges are set from Event badges, not tagged here.' };
  }
  const defs = badgeKeys.map((k) => ({ key: k, def: badgeDef(k) }));
  const unknown = defs.find((d) => !d.def);
  if (unknown) return { ok: false, error: 'Unknown badge.' };
  const hasTitleBadge = defs.some((d) => d.def?.titleBadge);
  if (hasTitleBadge && !input.event?.trim()) {
    return {
      ok: false,
      error: 'One of these badges names an event - give the tournament/event name.',
    };
  }

  try {
    const svc = createServiceClient();
    const settings = await getBadgeSettings();

    let tagged = 0;
    let skipped = 0;
    let failed = 0;
    const newlyTagged: { playerId: string; badgeKey: string; meta: Record<string, unknown> }[] = [];

    for (const playerId of playerIds) {
      const perPlayer: { badgeKey: string; outcome: TagRowResult['outcome'] }[] = [];
      for (const badgeKey of badgeKeys) {
        const result = await writeBadgeTagRow(
          svc,
          settings,
          {
            playerId,
            badgeKey,
            reason,
            event: input.event,
            division: input.division,
            expiresAt: input.expiresAt,
            grantedBy: actor.viewerId,
          },
          { skipIfAlreadyGrant: true },
        );
        perPlayer.push({ badgeKey, outcome: result.outcome });
        if (result.outcome === 'failed') {
          failed += 1;
        } else if (result.outcome === 'skipped') {
          skipped += 1;
        } else {
          tagged += 1;
          newlyTagged.push({ playerId, badgeKey, meta: result.meta });
        }
      }
      await writeAudit({
        actorId: actor.viewerId,
        actorRole: actor.role,
        action: 'badge.tag_batch',
        entityType: 'player_badge',
        entityId: playerId,
        after: {
          badgeKeys,
          results: perPlayer,
          event: input.event?.trim() || null,
          division: input.division?.trim() || null,
        },
        reason,
      });
    }

    // Notifications run after the writes and never block/fail the batch (master_plan §2BL E).
    const sendNotifications = async () => {
      for (const { playerId, badgeKey, meta } of newlyTagged) {
        const def = badgeDef(badgeKey);
        if (!def) continue;
        await notify({
          recipientId: playerId,
          type: 'badge_granted',
          params: {
            extra: typeof meta.event === 'string' ? `${def.name} (${meta.event})` : def.name,
            reason,
          },
          link: '/me',
          entityType: 'player_badge',
        });
      }
    };
    try {
      const { after } = await import('next/server');
      after(() => sendNotifications());
    } catch {
      // Outside a request scope (script/test) `after()` throws - fall back to awaiting inline.
      await sendNotifications();
    }

    if (tagged > 0) {
      revalidateTag(PLAYERS_LIST_TAG);
      const affectedPlayerIds = Array.from(new Set(newlyTagged.map((t) => t.playerId)));
      for (const playerId of affectedPlayerIds) {
        const slug = await slugFor(playerId);
        if (slug) revalidateTag(playerTag(slug));
      }
    }

    const parts = [`${tagged} tagged`, `${skipped} skipped`];
    if (failed > 0) parts.push(`${failed} failed`);
    return { ok: true, tagged, skipped, failed, message: parts.join(' · ') };
  } catch {
    return { ok: false, error: 'That action is temporarily unavailable.' };
  }
}

export type AdminListPlayersResult =
  { ok: true; players: AdminBadgeTagPlayer[]; total: number } | { ok: false; error: string };

/**
 * Client-callable bridge to `listPlayersForBadgeTagging` (master_plan §2BL E): the Tag screen is a
 * client component (selection has to persist across search/filter/page changes, which only works as
 * client state), and `lib/admin/user-queries.ts` is `server-only`, so this thin admin-guarded action
 * is what the client actually calls to fetch/refresh pages.
 */
export async function adminListPlayersForBadgeTagging(opts: {
  q?: string;
  tier?: number;
  city?: string;
  noBadges?: boolean;
  ids?: string[];
  page?: number;
  pageSize?: number;
}): Promise<AdminListPlayersResult> {
  const actor = await assertAdminActor();
  if (!actor)
    return { ok: false, error: 'Admin access with a stepped-up (two-factor) session is required.' };
  const result = await listPlayersForBadgeTagging(opts);
  return { ok: true, ...result };
}

export type AdminPlayerBadgeDetailResult =
  | {
      ok: true;
      player: {
        id: string;
        name: string;
        avatarUrl: string | null;
        csl: number | null;
        sts: number | null;
      };
      badges: AdminPlayerBadge[];
    }
  | { ok: false; error: string };

/**
 * One player's full badge detail for the Tag screen's "existing badges" sheet (master_plan §2BL E,
 * "a small chevron button on the row opens that player's existing badge panel"). Reuses
 * `getUserAdminDetail` (header) and `getPlayerBadgesForAdmin` (every row, including revoked/blocked)
 * exactly as the pre-§2BL "Tag a player" flow did.
 */
export async function adminGetPlayerBadgeDetail(
  playerId: string,
): Promise<AdminPlayerBadgeDetailResult> {
  const actor = await assertAdminActor();
  if (!actor)
    return { ok: false, error: 'Admin access with a stepped-up (two-factor) session is required.' };
  const [detail, badges] = await Promise.all([
    getUserAdminDetail(playerId),
    getPlayerBadgesForAdmin(playerId),
  ]);
  if (!detail) return { ok: false, error: 'Player not found.' };
  return {
    ok: true,
    player: {
      id: detail.id,
      name: detail.name,
      avatarUrl: detail.avatarUrl,
      csl: detail.skill.csl,
      sts: detail.skill.sts,
    },
    badges,
  };
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
