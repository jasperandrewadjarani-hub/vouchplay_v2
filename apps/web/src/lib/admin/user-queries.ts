import 'server-only';
import type { AccountStatus, GlobalRole } from '@vouchplay/db';
import { SKILL_BANDS } from '@vouchplay/config';
import { createServiceClient } from '@/lib/supabase/service';
import { avatarUrl } from '@/lib/storage';

/**
 * User administration reads (handover §30.1). Service-client reads gated by the page guard
 * (requireAdminPage). Explicit projections, bulk role resolution (no N+1).
 */

export interface AdminUserCard {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
  avatarUrl: string | null;
  accountStatus: AccountStatus;
  onboarded: boolean;
  roles: GlobalRole[];
  createdAt: string;
}

function displayName(p: {
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  slug: string | null;
}): string {
  return (
    [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
    p.nickname ||
    p.slug ||
    'Unnamed player'
  );
}

const CARD_COLUMNS =
  'id, first_name, last_name, nickname, slug, city, avatar_path, account_status, onboarded_at, created_at';

export async function searchUsers(query: string, limit = 25): Promise<AdminUserCard[]> {
  const q = query.trim();
  try {
    const svc = createServiceClient();
    let sel = svc.from('profiles').select(CARD_COLUMNS).limit(limit);
    if (q.length > 0) {
      const like = `%${q}%`;
      sel = sel.or(
        `first_name.ilike.${like},last_name.ilike.${like},nickname.ilike.${like},slug.ilike.${like},city.ilike.${like}`,
      );
    }
    sel = sel.order('created_at', { ascending: false });
    const { data } = await sel;
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) return [];

    // Bulk-resolve active roles for the result set.
    const ids = rows.map((r) => r.id as string);
    const rolesByUser = new Map<string, GlobalRole[]>();
    const { data: roleRows } = await svc
      .from('user_roles')
      .select('user_id, role')
      .eq('status', 'active')
      .in('user_id', ids);
    for (const rr of (roleRows ?? []) as { user_id: string; role: GlobalRole }[]) {
      const arr = rolesByUser.get(rr.user_id) ?? [];
      arr.push(rr.role);
      rolesByUser.set(rr.user_id, arr);
    }

    return rows.map((r) => ({
      id: r.id as string,
      name: displayName(r as never),
      slug: (r.slug as string) ?? null,
      city: (r.city as string) ?? null,
      avatarUrl: avatarUrl((r.avatar_path as string) ?? null),
      accountStatus: r.account_status as AccountStatus,
      onboarded: !!r.onboarded_at,
      roles: rolesByUser.get(r.id as string) ?? [],
      createdAt: r.created_at as string,
    }));
  } catch {
    return [];
  }
}

export interface AdminBadgeTagPlayer {
  id: string;
  name: string;
  nickname: string | null;
  slug: string | null;
  avatarUrl: string | null;
  tierKey: string | null;
  tierLabel: string | null;
  tierColor: string | null;
  city: string | null;
  /** Live (not revoked, not expired) badge keys the player currently holds, any source. */
  badgeKeys: string[];
}

const TAG_PROFILE_COLUMNS = 'id, first_name, last_name, nickname, slug, city, avatar_path';
type ProfileRow = Record<string, unknown>;

/**
 * Bounds past which a tier/"no badges yet" id restriction is applied server-side via a single
 * `.in()`/`.not(...,'in',...)` round trip (master_plan §2BM Decision C); at or beyond it, the
 * restriction is paged in memory instead over a lightweight `id, first_name` read, so neither query
 * string grows unbounded. VouchPlay's whole player base is currently in the hundreds, far under
 * either bound.
 */
const TIER_INLINE_ID_CAP = 500;
const NO_BADGES_INLINE_ID_CAP = 800;

/**
 * Tier-matching player ids. Filtered on the V1 `community_skill_level` column - this list has only
 * ever read that column for tier (never the STS_V2 columns added by `player_skill_profiles`), and
 * routing it through the `skill_algorithm_active_version` switch (`lib/vouches/active-skill.ts`)
 * would need `selectSkillProfiles`'s single column-list retry to also swap an `.eq()` filter column,
 * which its fail-open-to-V1 retry contract does not support. Deviation noted rather than force-fit -
 * see master_plan §2BM.
 */
async function tierPlayerIds(
  svc: ReturnType<typeof createServiceClient>,
  tier: number,
): Promise<string[]> {
  const { data, error } = await svc
    .from('player_skill_profiles')
    .select('player_id')
    .eq('community_skill_level', tier);
  if (error) throw error;
  return ((data ?? []) as { player_id: string }[]).map((r) => r.player_id);
}

/** Distinct ids currently holding any live (not revoked, not expired) badge - the "no badges yet"
 *  exclusion set (master_plan §2BM Decision C). */
async function liveBadgeHolderIds(svc: ReturnType<typeof createServiceClient>): Promise<string[]> {
  const { data, error } = await svc
    .from('player_badges')
    .select('player_id')
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  if (error) throw error;
  return Array.from(new Set(((data ?? []) as { player_id: string }[]).map((r) => r.player_id)));
}

type IdRestrict = { kind: 'in' | 'notIn'; ids: string[] };

function likeOrFilter(q: string): string {
  const like = `%${q}%`;
  return `first_name.ilike.${like},last_name.ilike.${like},nickname.ilike.${like},slug.ilike.${like}`;
}

/**
 * Pages `profiles` for the Tag screen, applying `q`/`city` plus an optional id restriction, in the
 * cheapest way that stays correct (master_plan §2BM Decision C):
 * - No restriction, or one within its inline cap: one SQL round trip with `.range()` +
 *   `{ count: 'exact' }` - only the requested page is ever fetched.
 * - A restriction past its inline cap (tier matches > 500, or "no badges" holders >= 800): a
 *   lightweight `id, first_name` read is paginated in memory instead, and only the page's own ids are
 *   read back in full - still far cheaper than the old "load up to 2000 full profiles" path.
 */
async function pageProfilesForTagging(
  svc: ReturnType<typeof createServiceClient>,
  opts: { q?: string; city?: string; restrict: IdRestrict | null },
  page: number,
  pageSize: number,
): Promise<{ rows: ProfileRow[]; total: number }> {
  const { restrict } = opts;
  if (restrict?.kind === 'in' && restrict.ids.length === 0) return { rows: [], total: 0 };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const q = opts.q?.trim();
  const city = opts.city?.trim();

  const inline =
    !restrict ||
    (restrict.kind === 'in' && restrict.ids.length <= TIER_INLINE_ID_CAP) ||
    (restrict.kind === 'notIn' && restrict.ids.length < NO_BADGES_INLINE_ID_CAP);

  if (inline) {
    // `sel` is deliberately untyped past this point: reassigning through this many chained
    // supabase-js filter calls (not/or/ilike/in/order/range) makes TS try to instantiate a
    // conditional type so deep it hits "TS2589 excessively deep" - the same tradeoff supabase-js
    // users hit on any sufficiently long conditional filter chain. `data`/`count` are cast back to
    // known shapes below, so this stays contained to the query-building steps.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sel: any = svc
      .from('profiles')
      .select(TAG_PROFILE_COLUMNS, { count: 'exact' })
      .not('onboarded_at', 'is', null);
    if (q) sel = sel.or(likeOrFilter(q));
    if (city) sel = sel.ilike('city', `%${city}%`);
    if (restrict?.kind === 'in') sel = sel.in('id', restrict.ids);
    if (restrict?.kind === 'notIn') sel = sel.not('id', 'in', `(${restrict.ids.join(',')})`);
    const { data, error, count } = await sel
      .order('first_name', { ascending: true })
      .range(from, to);
    if (error) throw error;
    return { rows: (data ?? []) as ProfileRow[], total: count ?? 0 };
  }

  // Fallback: lightweight in-memory pagination (only reached well past the inline caps above).
  let lightSel = svc.from('profiles').select('id, first_name').not('onboarded_at', 'is', null);
  if (q) lightSel = lightSel.or(likeOrFilter(q));
  if (city) lightSel = lightSel.ilike('city', `%${city}%`);
  if (restrict?.kind === 'in') lightSel = lightSel.in('id', restrict.ids);
  const { data: lightData, error: lightErr } = await lightSel;
  if (lightErr) throw lightErr;
  let lightRows = (lightData ?? []) as { id: string; first_name: string | null }[];
  if (restrict?.kind === 'notIn') {
    const excl = new Set(restrict.ids);
    lightRows = lightRows.filter((r) => !excl.has(r.id));
  }
  lightRows.sort((a, b) => (a.first_name ?? '').localeCompare(b.first_name ?? ''));
  const total = lightRows.length;
  const pageIds = lightRows.slice(from, to + 1).map((r) => r.id);
  if (pageIds.length === 0) return { rows: [], total };
  const { data: fullData, error: fullErr } = await svc
    .from('profiles')
    .select(TAG_PROFILE_COLUMNS)
    .in('id', pageIds);
  if (fullErr) throw fullErr;
  const byId = new Map(((fullData ?? []) as ProfileRow[]).map((r) => [r.id as string, r]));
  const rows = pageIds.map((id) => byId.get(id)).filter((r): r is ProfileRow => !!r);
  return { rows, total };
}

/**
 * Players for Admin → Badges' single-screen Tag flow (master_plan §2BL E, cheapened in §2BM Decision
 * C). Unlike `searchUsers` / the public directory, this deliberately includes players hidden from the
 * directory (admins tag everyone, not just who a visitor can see) and never applies
 * `account_status`/visibility filters. `ids` returns exactly those players, unpaginated, ignoring
 * every other filter (kept for interface compatibility; no current caller passes it).
 *
 * Only the requested page's worth of profiles is ever fetched from `profiles`, and skill/badge rows
 * are read only for that page's ids - never the whole player base (the previous implementation loaded
 * up to 2000 profiles plus their skill and badge rows on every keystroke).
 */
export async function listPlayersForBadgeTagging(opts: {
  q?: string;
  /** Community skill ordinal (SKILL_BANDS). Players with no community rating never match. */
  tier?: number;
  city?: string;
  noBadges?: boolean;
  ids?: string[];
  page?: number;
  pageSize?: number;
}): Promise<{ players: AdminBadgeTagPlayer[]; total: number }> {
  const empty = { players: [], total: 0 };
  try {
    const svc = createServiceClient();
    const pageSize = Math.min(Math.max(opts.pageSize ?? 30, 1), 100);
    const page = Math.max(opts.page ?? 1, 1);
    const byIds = !!opts.ids && opts.ids.length > 0;

    let rows: ProfileRow[];
    let total: number;

    if (byIds) {
      const { data, error } = await svc
        .from('profiles')
        .select(TAG_PROFILE_COLUMNS)
        .not('onboarded_at', 'is', null)
        .order('created_at', { ascending: false })
        .in('id', opts.ids as string[]);
      if (error) throw error;
      rows = (data ?? []) as ProfileRow[];
      total = rows.length;
    } else {
      let restrict: IdRestrict | null = null;
      if (opts.tier != null) {
        restrict = { kind: 'in', ids: await tierPlayerIds(svc, opts.tier) };
      }
      if (opts.noBadges) {
        const holderIds = await liveBadgeHolderIds(svc);
        if (restrict) {
          const holderSet = new Set(holderIds);
          restrict = { kind: 'in', ids: restrict.ids.filter((id) => !holderSet.has(id)) };
        } else {
          restrict = { kind: 'notIn', ids: holderIds };
        }
      }
      const paged = await pageProfilesForTagging(
        svc,
        { q: opts.q, city: opts.city, restrict },
        page,
        pageSize,
      );
      rows = paged.rows;
      total = paged.total;
    }

    if (rows.length === 0) return { players: [], total };
    const ids = rows.map((r) => r.id as string);

    const [{ data: skillRows }, { data: badgeRows }] = await Promise.all([
      svc
        .from('player_skill_profiles')
        .select('player_id, community_skill_level')
        .in('player_id', ids),
      svc
        .from('player_badges')
        .select('player_id, badge_key')
        .in('player_id', ids)
        .is('revoked_at', null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
    ]);

    const tierByPlayer = new Map<string, number>();
    for (const r of (skillRows ?? []) as {
      player_id: string;
      community_skill_level: number | null;
    }[]) {
      if (r.community_skill_level != null) tierByPlayer.set(r.player_id, r.community_skill_level);
    }
    const badgesByPlayer = new Map<string, string[]>();
    for (const r of (badgeRows ?? []) as { player_id: string; badge_key: string }[]) {
      const arr = badgesByPlayer.get(r.player_id) ?? [];
      arr.push(r.badge_key);
      badgesByPlayer.set(r.player_id, arr);
    }

    const players: AdminBadgeTagPlayer[] = rows.map((r) => {
      const ordinal = tierByPlayer.get(r.id as string);
      const band = ordinal != null ? SKILL_BANDS.find((b) => b.ordinal === ordinal) : undefined;
      return {
        id: r.id as string,
        name: displayName(r as never),
        nickname: (r.nickname as string) ?? null,
        slug: (r.slug as string) ?? null,
        avatarUrl: avatarUrl((r.avatar_path as string) ?? null),
        tierKey: band?.key ?? null,
        tierLabel: band?.label ?? null,
        tierColor: band?.color ?? null,
        city: (r.city as string) ?? null,
        badgeKeys: badgesByPlayer.get(r.id as string) ?? [],
      };
    });

    return { players, total };
  } catch {
    return empty;
  }
}

export interface AdminRoleHistoryItem {
  id: string;
  role: GlobalRole;
  status: string;
  reason: string | null;
  approvedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface AdminUserDetail {
  id: string;
  name: string;
  slug: string | null;
  email: string | null;
  city: string | null;
  avatarUrl: string | null;
  accountStatus: AccountStatus;
  statusReason: string | null;
  suspendedUntil: string | null;
  vouchingRestrictedUntil: string | null;
  onboarded: boolean;
  createdAt: string;
  activeRoles: GlobalRole[];
  roleHistory: AdminRoleHistoryItem[];
  skill: {
    hasProfile: boolean;
    csl: number | null;
    sts: number | null;
    skillVerified: boolean;
    verificationType: string | null;
    uniqueVouchers: number | null;
  };
  identityStatus: string | null;
}

export async function getUserAdminDetail(userId: string): Promise<AdminUserDetail | null> {
  try {
    const svc = createServiceClient();
    const { data: p } = await svc
      .from('profiles')
      .select(
        'id, first_name, last_name, nickname, slug, city, avatar_path, account_status, status_reason, suspended_until, vouching_restricted_until, onboarded_at, created_at',
      )
      .eq('id', userId)
      .maybeSingle();
    if (!p) return null;
    const prof = p as Record<string, unknown>;

    const [rolesRes, skillRes, idRes, emailRes] = await Promise.all([
      svc
        .from('user_roles')
        .select('id, role, status, reason, approved_at, revoked_at, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      svc
        .from('player_skill_profiles')
        .select(
          'community_skill_level, sts, skill_verified, verification_type, unique_voucher_count',
        )
        .eq('player_id', userId)
        .maybeSingle(),
      svc
        .from('identity_verifications')
        .select('status')
        .eq('user_id', userId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      svc.auth.admin.getUserById(userId),
    ]);

    const roleRows = (rolesRes.data ?? []) as {
      id: string;
      role: GlobalRole;
      status: string;
      reason: string | null;
      approved_at: string | null;
      revoked_at: string | null;
      created_at: string;
    }[];
    const skill = skillRes.data as {
      community_skill_level: number | null;
      sts: number | null;
      skill_verified: boolean;
      verification_type: string | null;
      unique_voucher_count: number | null;
    } | null;

    return {
      id: prof.id as string,
      name: displayName(prof as never),
      slug: (prof.slug as string) ?? null,
      email: emailRes.data?.user?.email ?? null,
      city: (prof.city as string) ?? null,
      avatarUrl: avatarUrl((prof.avatar_path as string) ?? null),
      accountStatus: prof.account_status as AccountStatus,
      statusReason: (prof.status_reason as string) ?? null,
      suspendedUntil: (prof.suspended_until as string) ?? null,
      vouchingRestrictedUntil: (prof.vouching_restricted_until as string) ?? null,
      onboarded: !!prof.onboarded_at,
      createdAt: prof.created_at as string,
      activeRoles: roleRows.filter((r) => r.status === 'active').map((r) => r.role),
      roleHistory: roleRows.map((r) => ({
        id: r.id,
        role: r.role,
        status: r.status,
        reason: r.reason,
        approvedAt: r.approved_at,
        revokedAt: r.revoked_at,
        createdAt: r.created_at,
      })),
      skill: {
        hasProfile: !!skill,
        csl: skill?.community_skill_level ?? null,
        sts: skill?.sts ?? null,
        skillVerified: !!skill?.skill_verified,
        verificationType: skill?.verification_type ?? null,
        uniqueVouchers: skill?.unique_voucher_count ?? null,
      },
      identityStatus: (idRes.data as { status: string } | null)?.status ?? null,
    };
  } catch {
    return null;
  }
}
