import 'server-only';
import { unstable_cache } from 'next/cache';
import {
  BADGES,
  EVENT_BADGE,
  EVENT_BADGE_PREFIX,
  badgeDef,
  fieldVisible,
  parseVisibility,
  SKILL_BANDS,
  type BadgeFamily,
} from '@vouchplay/config';
import { pickCardOrder } from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';
import { getBadgeSettings } from '@/lib/settings';
import { avatarUrl } from '@/lib/storage';
// Tags come from the dependency-free `@/lib/players/tags` (not `@/lib/players/queries`, which imports this
// file), so there is no import cycle.
import { PLAYERS_LIST_TAG } from '@/lib/players/tags';
import type {
  AdminPlayerBadge,
  BadgeCase,
  BadgeHolder,
  BadgeMeta,
  BadgeView,
  ViewerGame,
} from './types';

/**
 * Badge readers (master_plan §2BK C). EVERY function here fails open (empty/null) on any error,
 * including "table does not exist yet" - migration 0051 and this deploy can land in either order.
 * Every reader also respects `badges_enabled` and `badge_disabled_keys` (a disabled key is hidden
 * everywhere, but its rows are left untouched in the database).
 */

interface PlayerBadgeRow {
  id: string;
  player_id: string;
  badge_key: string;
  source: 'auto' | 'grant';
  tally: number;
  meta: Record<string, unknown> | null;
  awarded_at: string;
  expires_at: string | null;
  hidden: boolean;
  revoked_at?: string | null;
  revoked_by?: string | null;
  revoke_reason?: string | null;
  auto_blocked?: boolean;
  granted_by?: string | null;
  grant_reason?: string | null;
}

/** Resolve a stored badge key to its display name (event badges use `meta.label`). */
function resolveName(key: string, meta: Record<string, unknown> | null): string {
  const label = typeof meta?.label === 'string' ? meta.label : null;
  if (label) return label;
  return badgeDef(key)?.name ?? key;
}

function toMeta(raw: Record<string, unknown> | null): BadgeMeta {
  if (!raw) return {};
  const meta: BadgeMeta = {};
  if (typeof raw.event === 'string') meta.event = raw.event;
  if (typeof raw.division === 'string') meta.division = raw.division;
  if (typeof raw.tournamentId === 'string') meta.tournamentId = raw.tournamentId;
  if (typeof raw.number === 'number') meta.number = raw.number;
  if (typeof raw.tier === 'string') meta.tier = raw.tier;
  if (typeof raw.level === 'number') meta.level = raw.level;
  if (raw.medal === 'silver' || raw.medal === 'bronze') meta.medal = raw.medal;
  if (typeof raw.label === 'string') meta.label = raw.label;
  return meta;
}

function toBadgeView(row: PlayerBadgeRow, pinnedKey: string | null): BadgeView {
  return {
    id: row.id,
    key: row.badge_key,
    name: resolveName(row.badge_key, row.meta),
    tally: Math.max(1, row.tally ?? 1),
    meta: toMeta(row.meta),
    awardedAt: row.awarded_at,
    expiresAt: row.expires_at,
    source: row.source,
    hidden: row.hidden === true,
    pinned: pinnedKey != null && pinnedKey === row.badge_key,
  };
}

function isLive(
  row: { revoked_at?: string | null; expires_at: string | null },
  now: number,
): boolean {
  if (row.revoked_at) return false;
  if (!row.expires_at) return true;
  return Date.parse(row.expires_at) > now;
}

function isExpired(row: { expires_at: string | null }, now: number): boolean {
  return !!row.expires_at && Date.parse(row.expires_at) <= now;
}

/** `badges_enabled` + `badge_disabled_keys` applied to a raw row list, before anything else. */
function filterEnabled<T extends { badge_key: string }>(
  rows: T[],
  settings: { enabled: boolean; disabledKeys: string[] },
): T[] {
  if (!settings.enabled) return [];
  if (settings.disabledKeys.length === 0) return rows;
  const disabled = new Set(settings.disabledKeys);
  return rows.filter((r) => !disabled.has(r.badge_key));
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * Live, visible badges for many players at once - card order applied per player (pinned → rarity →
 * newest, Legend hides Champion). One query per call, ids chunked to at most 500.
 */
export async function getVisibleBadgesForPlayers(
  playerIds: string[],
): Promise<Map<string, BadgeView[]>> {
  const out = new Map<string, BadgeView[]>();
  if (playerIds.length === 0) return out;
  try {
    const settings = await getBadgeSettings();
    if (!settings.enabled) return out;
    const svc = createServiceClient();
    const now = Date.now();

    const [rowsResult, pinsResult] = await Promise.all([
      (async () => {
        const rows: PlayerBadgeRow[] = [];
        for (const idChunk of chunk(playerIds, 500)) {
          const { data, error } = await svc
            .from('player_badges')
            .select('id, player_id, badge_key, source, tally, meta, awarded_at, expires_at, hidden')
            .in('player_id', idChunk)
            .is('revoked_at', null)
            .eq('hidden', false);
          if (error) throw error;
          rows.push(...((data ?? []) as PlayerBadgeRow[]));
        }
        return rows;
      })(),
      svc.from('profiles').select('id, pinned_badge_key').in('id', playerIds),
    ]);

    const pinnedByPlayer = new Map<string, string | null>(
      ((pinsResult.data ?? []) as { id: string; pinned_badge_key: string | null }[]).map((r) => [
        r.id,
        r.pinned_badge_key,
      ]),
    );

    const live = filterEnabled(
      rowsResult.filter((r) => isLive(r, now)),
      settings,
    );
    const byPlayer = new Map<string, PlayerBadgeRow[]>();
    for (const row of live) {
      const list = byPlayer.get(row.player_id) ?? [];
      list.push(row);
      byPlayer.set(row.player_id, list);
    }
    for (const playerId of playerIds) {
      const rows = byPlayer.get(playerId) ?? [];
      const pinnedKey = pinnedByPlayer.get(playerId) ?? null;
      const views = rows.map((r) => toBadgeView(r, pinnedKey));
      out.set(playerId, pickCardOrder(views, pinnedKey));
    }
  } catch {
    // Fail open: no badges shown rather than a broken page.
  }
  return out;
}

/**
 * One player's badge case (§2BK E). The owner sees hidden/expired/blocked rows too (`past` +
 * `progress`); any other viewer sees only the live, visible set.
 */
export async function getBadgeCase(profileId: string, viewerId: string | null): Promise<BadgeCase> {
  const empty: BadgeCase = { earned: [], past: [], progress: [], pinnedKey: null };
  try {
    const settings = await getBadgeSettings();
    if (!settings.enabled) return empty;
    const svc = createServiceClient();
    const now = Date.now();
    const isOwner = viewerId != null && viewerId === profileId;

    const [{ data: profileRow }, { data: rowsRaw, error }] = await Promise.all([
      svc.from('profiles').select('pinned_badge_key').eq('id', profileId).maybeSingle(),
      isOwner
        ? svc
            .from('player_badges')
            .select(
              'id, player_id, badge_key, source, tally, meta, awarded_at, expires_at, hidden, revoked_at',
            )
            .eq('player_id', profileId)
        : svc
            .from('player_badges')
            .select('id, player_id, badge_key, source, tally, meta, awarded_at, expires_at, hidden')
            .eq('player_id', profileId)
            .is('revoked_at', null)
            .eq('hidden', false),
    ]);
    if (error) throw error;
    const pinnedKey =
      (profileRow as { pinned_badge_key: string | null } | null)?.pinned_badge_key ?? null;
    const rows = filterEnabled((rowsRaw ?? []) as PlayerBadgeRow[], settings);

    const liveRows = rows.filter((r) => isLive(r, now));
    const earned = pickCardOrder(
      liveRows.map((r) => toBadgeView(r, pinnedKey)),
      pinnedKey,
    );

    if (!isOwner) return { earned, past: [], progress: [], pinnedKey };

    const past = rows
      .filter((r) => !r.revoked_at && isExpired(r, now))
      .sort((a, b) => Date.parse(b.expires_at as string) - Date.parse(a.expires_at as string))
      .map((r) => toBadgeView(r, pinnedKey));

    return { earned, past, progress: [], pinnedKey };
  } catch {
    return empty;
  }
}

/** Up to 5 live badges the viewer has not yet seen the unlock moment for (§2BK E), newest first. */
export async function getUncelebratedBadges(viewerId: string): Promise<BadgeView[]> {
  try {
    const settings = await getBadgeSettings();
    if (!settings.enabled) return [];
    const svc = createServiceClient();
    const now = Date.now();
    const [{ data: rowsRaw, error }, { data: profileRow }] = await Promise.all([
      svc
        .from('player_badges')
        .select('id, player_id, badge_key, source, tally, meta, awarded_at, expires_at, hidden')
        .eq('player_id', viewerId)
        .is('revoked_at', null)
        .is('celebrated_at', null)
        .order('awarded_at', { ascending: false })
        .limit(20),
      svc.from('profiles').select('pinned_badge_key').eq('id', viewerId).maybeSingle(),
    ]);
    if (error) throw error;
    const pinnedKey =
      (profileRow as { pinned_badge_key: string | null } | null)?.pinned_badge_key ?? null;
    const rows = filterEnabled((rowsRaw ?? []) as PlayerBadgeRow[], settings).filter((r) =>
      isLive(r, now),
    );
    return rows.slice(0, 5).map((r) => toBadgeView(r, pinnedKey));
  } catch {
    return [];
  }
}

/** Live (not expired), non-hidden holder counts per key - hidden rows never count publicly. */
async function countBadgeHoldersUncached(keys: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (keys.length === 0) return out;
  try {
    const settings = await getBadgeSettings();
    if (!settings.enabled) return out;
    const svc = createServiceClient();
    const now = new Date().toISOString();
    for (const key of keys) out[key] = 0;
    const { data, error } = await svc
      .from('player_badges')
      .select('badge_key')
      .in('badge_key', keys)
      .is('revoked_at', null)
      .eq('hidden', false)
      .or(`expires_at.is.null,expires_at.gt.${now}`);
    if (error) throw error;
    for (const row of (data ?? []) as { badge_key: string }[]) {
      out[row.badge_key] = (out[row.badge_key] ?? 0) + 1;
    }
  } catch {
    // Fail open to zeros already seeded above.
  }
  return out;
}

/**
 * Cached wrapper around {@link countBadgeHoldersUncached} (master_plan §2BL C) - same signature,
 * same fail-open-to-zeros behaviour, but keyed on the sorted key list so opening the badge filter
 * sheet (which asks for every catalog key at once) never hits the database on each open. 5 minutes,
 * same as `getBadgeHolderIds` below; admin badge writes already `revalidateTag(PLAYERS_LIST_TAG)`
 * (`lib/actions/badges.ts`'s `revalidatePlayer`, `adminRecomputeBadges`, `adminSetEventBadge`), so a
 * fresh tag/untag/recompute is visible well before the 5 minutes are up.
 */
export async function countBadgeHolders(keys: string[]): Promise<Record<string, number>> {
  if (keys.length === 0) return {};
  const sortedKeys = [...keys].sort();
  try {
    const cached = unstable_cache(
      () => countBadgeHoldersUncached(sortedKeys),
      ['badge-holder-counts', sortedKeys.join(',')],
      { revalidate: 300, tags: [PLAYERS_LIST_TAG] },
    );
    const out = await cached();
    // The cache is keyed on the SORTED list (so two callers asking for the same keys in a
    // different order share one cache entry); return counts under every key the caller actually
    // asked for, in case a duplicate was passed.
    const result: Record<string, number> = {};
    for (const key of keys) result[key] = out[key] ?? 0;
    return result;
  } catch {
    const out: Record<string, number> = {};
    for (const key of keys) out[key] = 0;
    return out;
  }
}

/**
 * Player ids currently (live, non-hidden, not expired) holding a set of badges (master_plan §2BL C),
 * for the Players tab "Badge holders" filter. `match: 'any'` (default) is a union; `'all'` requires
 * every one of the ORIGINAL requested keys - a disabled key can never be live, so including one in
 * an `'all'` request correctly yields no matches rather than silently dropping the requirement.
 * Unknown keys (no `badgeDef`) are dropped before anything else. Fails open to `[]` on any error, so
 * a broken read empties the FILTER, never the whole directory (the caller intersects this into
 * `restrictIds`, and an empty `restrictIds` is a real "matched nobody", not "filter unavailable" -
 * acceptable here because the badge filter is opt-in and additive, unlike the skill index in
 * `players/filters.ts` which deliberately leaves itself unapplied on a load failure instead).
 * Cached 5 minutes (`unstable_cache`, players-list tag), keyed on the sorted key list + match.
 */
export async function getBadgeHolderIds(
  keys: string[],
  match: 'any' | 'all' = 'any',
): Promise<string[]> {
  const cleanKeys = Array.from(new Set(keys.filter((k) => badgeDef(k) != null))).sort();
  if (cleanKeys.length === 0) return [];
  const normalizedMatch: 'any' | 'all' = match === 'all' ? 'all' : 'any';
  try {
    const cached = unstable_cache(
      () => fetchBadgeHolderIdsUncached(cleanKeys, normalizedMatch),
      ['badge-holder-ids', cleanKeys.join(','), normalizedMatch],
      { revalidate: 300, tags: [PLAYERS_LIST_TAG] },
    );
    return await cached();
  } catch {
    return [];
  }
}

async function fetchBadgeHolderIdsUncached(
  keys: string[],
  match: 'any' | 'all',
): Promise<string[]> {
  try {
    const settings = await getBadgeSettings();
    if (!settings.enabled) return [];
    const disabled = new Set(settings.disabledKeys);
    const liveKeys = keys.filter((k) => !disabled.has(k));
    if (liveKeys.length === 0) return [];
    const svc = createServiceClient();
    const now = new Date().toISOString();
    const { data, error } = await svc
      .from('player_badges')
      .select('player_id, badge_key')
      .in('badge_key', liveKeys)
      .is('revoked_at', null)
      .eq('hidden', false)
      .or(`expires_at.is.null,expires_at.gt.${now}`);
    if (error) throw error;
    const rows = (data ?? []) as { player_id: string; badge_key: string }[];

    if (match !== 'all') {
      return Array.from(new Set(rows.map((r) => r.player_id)));
    }
    const heldByPlayer = new Map<string, Set<string>>();
    for (const row of rows) {
      const held = heldByPlayer.get(row.player_id) ?? new Set<string>();
      held.add(row.badge_key);
      heldByPlayer.set(row.player_id, held);
    }
    const out: string[] = [];
    for (const [playerId, held] of heldByPlayer) {
      if (keys.every((k) => held.has(k))) out.push(playerId);
    }
    return out;
  } catch {
    return [];
  }
}

export interface BadgeFilterOption {
  key: string;
  name: string;
  family: BadgeFamily;
  holders: number;
}

const BADGE_FAMILY_ORDER: readonly BadgeFamily[] = [
  'glory',
  'community',
  'growth',
  'roles',
  'special',
];

/** Every enabled catalog badge's current holder count, plus current event badges that have holders
 *  (master_plan §2BL C `getBadgeFilterOptions`) - keys unavailable to the filter sheet are never
 *  fetched by count in the first place, so a disabled catalog badge is dropped before the DB read
 *  rather than shown with a stale/zero count. `tier_crown` IS included (name "Top of Tier" already
 *  in the catalog) - Growth's avatar-only badge is still a real thing to filter by. */
export async function getBadgeFilterOptions(): Promise<BadgeFilterOption[]> {
  try {
    const settings = await getBadgeSettings();
    if (!settings.enabled) return [];
    const disabled = new Set(settings.disabledKeys);
    const catalogDefs = BADGES.filter((b) => !disabled.has(b.key));
    const catalogKeys = catalogDefs.map((b) => b.key);
    const catalogOrder = new Map(catalogKeys.map((k, i) => [k, i]));

    const cachedEventSummaries = unstable_cache(
      fetchEventBadgeSummariesUncached,
      ['badge-filter-event-summaries'],
      { revalidate: 300, tags: [PLAYERS_LIST_TAG] },
    );
    const [counts, eventSummaries] = await Promise.all([
      countBadgeHolders(catalogKeys),
      cachedEventSummaries(),
    ]);

    const catalogOptions: BadgeFilterOption[] = catalogDefs.map((b) => ({
      key: b.key,
      name: b.name,
      family: b.family,
      holders: counts[b.key] ?? 0,
    }));
    const eventOptions: BadgeFilterOption[] = eventSummaries
      .filter((e) => !disabled.has(e.key) && e.holders > 0)
      .map((e) => ({ key: e.key, name: e.name, family: EVENT_BADGE.family, holders: e.holders }));

    return [...catalogOptions, ...eventOptions].sort((a, b) => {
      const familyDiff =
        BADGE_FAMILY_ORDER.indexOf(a.family) - BADGE_FAMILY_ORDER.indexOf(b.family);
      if (familyDiff !== 0) return familyDiff;
      const ai = catalogOrder.get(a.key);
      const bi = catalogOrder.get(b.key);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

async function fetchEventBadgeSummariesUncached(): Promise<
  { key: string; name: string; holders: number }[]
> {
  try {
    const svc = createServiceClient();
    const now = new Date().toISOString();
    const { data, error } = await svc
      .from('player_badges')
      .select('badge_key, meta')
      .like('badge_key', `${EVENT_BADGE_PREFIX}%`)
      .is('revoked_at', null)
      .eq('hidden', false)
      .or(`expires_at.is.null,expires_at.gt.${now}`);
    if (error) throw error;
    const byKey = new Map<string, { count: number; label: string | null }>();
    for (const row of (data ?? []) as {
      badge_key: string;
      meta: Record<string, unknown> | null;
    }[]) {
      const entry = byKey.get(row.badge_key) ?? { count: 0, label: null };
      entry.count += 1;
      if (!entry.label && typeof row.meta?.label === 'string') entry.label = row.meta.label;
      byKey.set(row.badge_key, entry);
    }
    return Array.from(byKey.entries()).map(([key, v]) => ({
      key,
      name: v.label ?? EVENT_BADGE.name,
      holders: v.count,
    }));
  } catch {
    return [];
  }
}

/** Everyone currently (live, non-hidden) holding one badge key - for the admin "holders" view. */
export async function getBadgeHolders(badgeKey: string): Promise<BadgeHolder[]> {
  try {
    const svc = createServiceClient();
    const now = new Date().toISOString();
    const { data: rows, error } = await svc
      .from('player_badges')
      .select('id, player_id, source, tally, meta, awarded_at, expires_at')
      .eq('badge_key', badgeKey)
      .is('revoked_at', null)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('awarded_at', { ascending: false });
    if (error) throw error;
    const list = (rows ?? []) as Array<{
      id: string;
      player_id: string;
      source: 'auto' | 'grant';
      tally: number;
      meta: Record<string, unknown> | null;
      awarded_at: string;
      expires_at: string | null;
    }>;
    if (list.length === 0) return [];
    const playerIds = Array.from(new Set(list.map((r) => r.player_id)));
    const { data: profiles } = await svc
      .from('profiles')
      .select('id, first_name, last_name, nickname, slug, avatar_path')
      .in('id', playerIds);
    const byId = new Map(
      (profiles ?? []).map((p) => {
        const row = p as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          nickname: string | null;
          slug: string | null;
          avatar_path: string | null;
        };
        return [row.id, row] as const;
      }),
    );
    return list.map((r) => {
      const p = byId.get(r.player_id);
      const name =
        [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() ||
        p?.nickname ||
        'VouchPlay player';
      return {
        playerBadgeId: r.id,
        playerId: r.player_id,
        playerName: name,
        playerSlug: p?.slug ?? null,
        avatarUrl: avatarUrl(p?.avatar_path ?? null),
        source: r.source,
        tally: Math.max(1, r.tally ?? 1),
        meta: toMeta(r.meta),
        awardedAt: r.awarded_at,
        expiresAt: r.expires_at,
      };
    });
  } catch {
    return [];
  }
}

/** Every row (including revoked/blocked) for one player, newest first - admin only. */
export async function getPlayerBadgesForAdmin(playerId: string): Promise<AdminPlayerBadge[]> {
  try {
    const svc = createServiceClient();
    const { data: rows, error } = await svc
      .from('player_badges')
      .select(
        'id, player_id, badge_key, source, tally, meta, awarded_at, expires_at, hidden, revoked_at, revoked_by, revoke_reason, auto_blocked, granted_by, grant_reason',
      )
      .eq('player_id', playerId)
      .order('awarded_at', { ascending: false });
    if (error) throw error;
    const list = (rows ?? []) as PlayerBadgeRow[];
    if (list.length === 0) return [];
    const granterIds = Array.from(
      new Set(list.map((r) => r.granted_by).filter((id): id is string => !!id)),
    );
    let granterNames = new Map<string, string>();
    if (granterIds.length > 0) {
      const { data: granters } = await svc
        .from('profiles')
        .select('id, first_name, last_name, nickname')
        .in('id', granterIds);
      granterNames = new Map(
        (granters ?? []).map((g) => {
          const row = g as {
            id: string;
            first_name: string | null;
            last_name: string | null;
            nickname: string | null;
          };
          const name =
            [row.first_name, row.last_name].filter(Boolean).join(' ').trim() ||
            row.nickname ||
            'VouchPlay player';
          return [row.id, name] as const;
        }),
      );
    }
    return list.map((r) => ({
      ...toBadgeView(r, null),
      revokedAt: r.revoked_at ?? null,
      revokeReason: r.revoke_reason ?? null,
      autoBlocked: r.auto_blocked === true,
      grantedByName: r.granted_by ? (granterNames.get(r.granted_by) ?? null) : null,
      grantReason: r.grant_reason ?? null,
    }));
  } catch {
    return [];
  }
}

/** Recent tournaments for the admin "Event badges" picker (§2BK B). */
export async function listCommemorativeTournaments(): Promise<
  { id: string; name: string; label: string | null; status: string }[]
> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('tournaments')
      .select('id, name, commemorative_badge_label, status')
      .order('start_at', { ascending: false, nullsFirst: false })
      .limit(30);
    if (error) throw error;
    return (
      (data ?? []) as Array<{
        id: string;
        name: string;
        commemorative_badge_label: string | null;
        status: string;
      }>
    ).map((r) => ({
      id: r.id,
      name: r.name,
      label: r.commemorative_badge_label,
      status: r.status,
    }));
  } catch {
    return [];
  }
}

/**
 * The signed-in player's "Your game" card on the Players tab (§2BK F). Null unless onboarded. Rank
 * comes from `player_leaderboard_momentum` (category 'players', global scope, the board's default
 * period - `all_time`, matching `apps/web/src/app/(app)/leaderboards/page.tsx`'s default for the
 * Players category).
 */
export async function getViewerGame(viewerId: string): Promise<ViewerGame | null> {
  try {
    const svc = createServiceClient();
    const [{ data: profile }, { data: skill }, { data: momentum }, badgeSettings] =
      await Promise.all([
        svc
          .from('profiles')
          .select(
            'first_name, last_name, nickname, avatar_path, slug, onboarded_at, profile_visibility',
          )
          .eq('id', viewerId)
          .maybeSingle(),
        svc
          .from('player_skill_profiles')
          .select('community_skill_level, sts, unique_voucher_count')
          .eq('player_id', viewerId)
          .maybeSingle(),
        svc
          .from('player_leaderboard_momentum')
          .select('private_rank, previous_rank')
          .eq('player_id', viewerId)
          .eq('category', 'players')
          .eq('scope_type', 'global')
          .eq('scope_value', '')
          .eq('period', 'all_time')
          .maybeSingle(),
        getBadgeSettings(),
      ]);
    const p = profile as {
      first_name: string | null;
      last_name: string | null;
      nickname: string | null;
      avatar_path: string | null;
      slug: string | null;
      onboarded_at: string | null;
      profile_visibility: Record<string, unknown> | null;
    } | null;
    if (!p || !p.onboarded_at) return null;

    const s = skill as {
      community_skill_level: number | null;
      sts: number | string | null;
      unique_voucher_count: number | null;
    } | null;
    const m = momentum as { private_rank: number | null; previous_rank: number | null } | null;

    const visibility = parseVisibility(p.profile_visibility ?? {});
    const communityRatingPrivate = !fieldVisible(visibility, 'community_rating');
    const bandKey =
      !communityRatingPrivate && s?.community_skill_level != null
        ? (SKILL_BANDS.find((b) => b.ordinal === s.community_skill_level) ?? null)
        : null;

    const displayName =
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
      p.nickname ||
      'VouchPlay player';
    const initials =
      `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}`.toUpperCase() ||
      (p.nickname?.[0] ?? '?').toUpperCase();

    return {
      displayName,
      nickname: p.nickname ?? null,
      initials,
      avatarUrl: avatarUrl(p.avatar_path),
      slug: p.slug ?? null,
      tier: bandKey ? { key: bandKey.key, label: bandKey.label, color: bandKey.color } : null,
      sts: communityRatingPrivate ? null : s?.sts != null ? Number(s.sts) : null,
      rank:
        m?.private_rank != null
          ? {
              position: m.private_rank,
              delta: m.previous_rank != null ? m.previous_rank - m.private_rank : null,
            }
          : null,
      uniqueVouchers: s?.unique_voucher_count ?? 0,
      provenTarget: badgeSettings.rules.provenMinVouchers,
      communityRatingPrivate,
    };
  } catch {
    return null;
  }
}
