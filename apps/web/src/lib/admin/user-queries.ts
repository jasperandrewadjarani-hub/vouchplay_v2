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

/**
 * Bounded above which the admin badge-tagging list is fetched, filtered (tier / "no badges yet") and
 * paginated in memory rather than in SQL. Community tier lives in `player_skill_profiles` and "no
 * badges" needs an anti-join against `player_badges` - PostgREST cannot express either against the
 * `profiles` query below in one round trip, and the same trade-off is already accepted elsewhere in
 * this codebase for admin-scale lists (see `idsMatchingIndexFilters` in `lib/players/filters.ts`).
 * VouchPlay's whole player base is currently in the hundreds, far under this cap.
 */
const BADGE_TAG_CANDIDATE_CAP = 2000;

/**
 * Players for Admin → Badges' single-screen Tag flow (master_plan §2BL E). Unlike `searchUsers` /
 * the public directory, this deliberately includes players hidden from the directory (admins tag
 * everyone, not just who a visitor can see) and never applies `account_status`/visibility filters.
 * `ids` (used for the "Selected (n)" quick filter and the review sheet) returns exactly those players,
 * unpaginated, ignoring every other filter.
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

    let sel = svc
      .from('profiles')
      .select('id, first_name, last_name, nickname, slug, city, avatar_path')
      .not('onboarded_at', 'is', null)
      .order('created_at', { ascending: false });

    if (byIds) {
      sel = sel.in('id', opts.ids as string[]);
    } else {
      const q = opts.q?.trim();
      if (q) {
        const like = `%${q}%`;
        sel = sel.or(
          `first_name.ilike.${like},last_name.ilike.${like},nickname.ilike.${like},slug.ilike.${like}`,
        );
      }
      if (opts.city?.trim()) sel = sel.ilike('city', `%${opts.city.trim()}%`);
      sel = sel.limit(BADGE_TAG_CANDIDATE_CAP);
    }

    const { data, error } = await sel;
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) return empty;
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

    let all: AdminBadgeTagPlayer[] = rows.map((r) => {
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

    if (opts.tier != null) all = all.filter((p) => tierByPlayer.get(p.id) === opts.tier);
    if (opts.noBadges) all = all.filter((p) => p.badgeKeys.length === 0);

    const total = all.length;
    if (byIds) return { players: all, total };
    const from = (page - 1) * pageSize;
    return { players: all.slice(from, from + pageSize), total };
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
