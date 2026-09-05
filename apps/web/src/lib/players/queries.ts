import { unstable_cache } from 'next/cache';
import type { GlobalRole, ProfileRow } from '@vouchplay/db';
import { createPublicClient } from '@/lib/supabase/public';
import { createServiceClient } from '@/lib/supabase/service';
import { avatarUrl } from '@/lib/storage';
import {
  PLAYER_CARD_COLUMNS,
  PLAYER_PROFILE_COLUMNS,
  toPlayerCardDTO,
  toPlayerProfileDTO,
  type PlayerCardDTO,
  type PlayerProfileDTO,
  type ProfileExtras,
  type SkillSnapshot,
  type ViewerContext,
} from './dto';

export const PLAYERS_LIST_TAG = 'players:list';
export const playerTag = (slug: string) => `player:${slug}`;
export const commentsTag = (id: string) => `player-comments:${id}`;

export const PAGE_SIZE = 24;

export interface PlayerFilters {
  q?: string;
  city?: string;
  sex?: 'male' | 'female';
  minSkill?: number; // self-rated ordinal 0..6
  identityVerified?: boolean;
  coach?: boolean;
  lookingForPartner?: boolean;
  openForSponsorship?: boolean;
  page?: number;
}

/** Stable, order-independent cache key for a filter set. */
function filtersKey(f: PlayerFilters): string {
  return JSON.stringify({
    q: f.q?.trim().toLowerCase() ?? '',
    city: f.city?.trim().toLowerCase() ?? '',
    sex: f.sex ?? '',
    minSkill: f.minSkill ?? '',
    identityVerified: f.identityVerified ? 1 : 0,
    coach: f.coach ? 1 : 0,
    lfp: f.lookingForPartner ? 1 : 0,
    ofs: f.openForSponsorship ? 1 : 0,
    page: f.page ?? 1,
  });
}

// ----------------------------------------------------------------------------
// Public-by-design badge facts (§8.2). RLS-clean: read through the anon client via the
// `public_player_facts()` SECURITY DEFINER RPC (migration 0003), which returns ONLY safe booleans
// — never the sensitive columns of user_roles / identity_verifications. The service client is no
// longer on the per-card badge path (only the opt-in role/identity FILTER id-lists below still use
// it, reading a single safe `user_id` column).
// ----------------------------------------------------------------------------

interface BadgeFacts {
  roles: GlobalRole[];
  identityVerified: boolean;
}

interface PublicFactRow {
  user_id: string;
  is_coach: boolean;
  is_organizer: boolean;
  identity_verified: boolean;
}

const emptyFacts = (): BadgeFacts => ({ roles: [], identityVerified: false });

/** Bulk-load public badge facts for a set of user ids via the anon RPC (no N+1, RLS-clean). */
const fetchBadgeFacts = unstable_cache(
  async (ids: string[]): Promise<Record<string, BadgeFacts>> => {
    const out: Record<string, BadgeFacts> = {};
    if (ids.length === 0) return out;
    for (const id of ids) out[id] = emptyFacts();
    try {
      const supabase = createPublicClient();
      const { data, error } = await supabase.rpc('public_player_facts', { ids });
      if (error || !data) return out;
      for (const row of data as PublicFactRow[]) {
        const f = (out[row.user_id] ??= emptyFacts());
        if (row.is_coach) f.roles.push('coach');
        if (row.is_organizer) f.roles.push('organizer');
        f.identityVerified = !!row.identity_verified;
      }
    } catch {
      // Facts are non-critical decoration; render cards without badges rather than failing.
    }
    return out;
  },
  ['player-badge-facts'],
  { revalidate: 60, tags: [PLAYERS_LIST_TAG] },
);

/**
 * Bulk-load computed skill snapshots (player_skill_profiles) for a set of ids. PUBLIC-safe aggregate
 * (no voucher identity), read via the anon client. Returns {} when the table isn't present yet.
 */
const fetchSkillSnapshots = unstable_cache(
  async (ids: string[]): Promise<Record<string, SkillSnapshot>> => {
    const out: Record<string, SkillSnapshot> = {};
    if (ids.length === 0) return out;
    try {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from('player_skill_profiles')
        .select(
          'player_id, community_skill_level, sts, skill_verified, unique_voucher_count, distribution',
        )
        .in('player_id', ids);
      for (const r of data ?? []) {
        const row = r as {
          player_id: string;
          community_skill_level: number | null;
          sts: number | string;
          skill_verified: boolean;
          unique_voucher_count: number;
          distribution: Record<string, number> | null;
        };
        out[row.player_id] = {
          communitySkillLevel: row.community_skill_level,
          sts: Number(row.sts),
          skillVerified: row.skill_verified,
          uniqueVoucherCount: row.unique_voucher_count,
          distribution: row.distribution ?? {},
        };
      }
    } catch {
      // Table not present yet (pre-0004) or unavailable → no computed skill; cards fall back to self-rated.
    }
    return out;
  },
  ['player-skill-snapshots'],
  { revalidate: 60, tags: [PLAYERS_LIST_TAG] },
);

/** Ids of users who currently hold a given active role (for role filters). */
const fetchUserIdsWithRole = unstable_cache(
  async (role: GlobalRole): Promise<string[]> => {
    try {
      const svc = createServiceClient();
      const { data } = await svc
        .from('user_roles')
        .select('user_id')
        .eq('status', 'active')
        .eq('role', role);
      return (data ?? []).map((r) => (r as { user_id: string }).user_id);
    } catch {
      return [];
    }
  },
  ['player-role-ids'],
  { revalidate: 60, tags: [PLAYERS_LIST_TAG] },
);

/** Ids of users with an approved identity verification (for the Identity Verified filter). */
const fetchVerifiedUserIds = unstable_cache(
  async (): Promise<string[]> => {
    try {
      const svc = createServiceClient();
      const { data } = await svc
        .from('identity_verifications')
        .select('user_id')
        .eq('status', 'approved');
      return Array.from(new Set((data ?? []).map((r) => (r as { user_id: string }).user_id)));
    } catch {
      return [];
    }
  },
  ['player-verified-ids'],
  { revalidate: 60, tags: [PLAYERS_LIST_TAG] },
);

// ----------------------------------------------------------------------------
// Directory listing (cache-first public read; §34A.5 PUBLIC_REVALIDATED)
// ----------------------------------------------------------------------------

interface RawListResult {
  rows: ProfileRow[];
  total: number;
}

/**
 * Fetch a page of public directory rows (RLS-enforced anon read). Cached; caller applies the
 * viewer-specific DTO projection OUTSIDE the cache so the cache stays public/shareable.
 */
async function fetchListRows(
  f: PlayerFilters,
  restrictIds: string[] | null,
): Promise<RawListResult> {
  try {
    const supabase = createPublicClient();
    let query = supabase
      .from('profiles')
      .select(PLAYER_CARD_COLUMNS, { count: 'exact' })
      .eq('account_status', 'active')
      .not('onboarded_at', 'is', null)
      // Directory opt-out (profile_visibility.directory): list unless explicitly 'hidden'.
      .or('profile_visibility->>directory.is.null,profile_visibility->>directory.neq.hidden');

    if (restrictIds) {
      if (restrictIds.length === 0) return { rows: [], total: 0 };
      query = query.in('id', restrictIds);
    }
    if (f.q && f.q.trim()) {
      const term = f.q.trim().replace(/[%,()]/g, ' ');
      query = query.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,nickname.ilike.%${term}%,city.ilike.%${term}%`,
      );
    }
    if (f.city && f.city.trim()) query = query.ilike('city', `%${f.city.trim()}%`);
    if (f.sex) query = query.eq('sex', f.sex);
    if (typeof f.minSkill === 'number') query = query.gte('self_rated_skill', f.minSkill);
    if (f.lookingForPartner) query = query.eq('looking_for_partner', true);
    if (f.openForSponsorship) query = query.eq('open_for_sponsorship', true);

    const page = Math.max(1, f.page ?? 1);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Default sort (§8.4): recent activity; verified-first is applied as an in-page tiebreak after
    // badge facts load. Never rank by STS / popularity.
    const { data, count } = await query.order('updated_at', { ascending: false }).range(from, to);
    return { rows: (data as ProfileRow[] | null) ?? [], total: count ?? 0 };
  } catch {
    return { rows: [], total: 0 };
  }
}

export interface PlayerListPage {
  players: PlayerCardDTO[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export async function listPlayers(
  filters: PlayerFilters,
  viewer: ViewerContext,
): Promise<PlayerListPage> {
  // Role / identity filters constrain the id set first.
  let restrictIds: string[] | null = null;
  if (filters.coach) {
    restrictIds = await fetchUserIdsWithRole('coach');
  }
  if (filters.identityVerified) {
    const verified = await fetchVerifiedUserIds();
    restrictIds = restrictIds ? restrictIds.filter((id) => verified.includes(id)) : verified;
  }

  const key = filtersKey(filters) + '|restrict:' + (restrictIds ? restrictIds.join(',') : 'none');
  const cached = unstable_cache(() => fetchListRows(filters, restrictIds), [key], {
    revalidate: 60,
    tags: [PLAYERS_LIST_TAG],
  });
  const { rows, total } = await cached();

  const ids = rows.map((r) => r.id);
  const [facts, skills] = await Promise.all([fetchBadgeFacts(ids), fetchSkillSnapshots(ids)]);
  const players = rows.map((row) => {
    const f = facts[row.id] ?? emptyFacts();
    const extras: ProfileExtras = {
      roles: f.roles,
      identityVerified: f.identityVerified,
      skill: skills[row.id] ?? null,
    };
    return toPlayerCardDTO(row, extras, viewer);
  });

  // Verified/high-confidence first within the recency-ordered page (§8.4), no STS ranking.
  players.sort((a, b) => Number(b.identityVerified) - Number(a.identityVerified));

  const page = Math.max(1, filters.page ?? 1);
  return {
    players,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

// ----------------------------------------------------------------------------
// Single public profile (§9, §28). Cached per slug (tag `player:{slug}`).
// ----------------------------------------------------------------------------

async function fetchProfileRowBySlug(slug: string): Promise<ProfileRow | null> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from('profiles')
      .select(PLAYER_PROFILE_COLUMNS)
      .eq('slug', slug)
      .eq('account_status', 'active')
      .not('onboarded_at', 'is', null)
      .maybeSingle();
    return (data as ProfileRow | null) ?? null;
  } catch {
    return null;
  }
}

export async function getPlayerBySlug(
  slug: string,
  viewer: ViewerContext,
): Promise<PlayerProfileDTO | null> {
  const cached = unstable_cache(() => fetchProfileRowBySlug(slug), ['player-profile', slug], {
    revalidate: 60,
    tags: [playerTag(slug)],
  });
  const row = await cached();
  if (!row) return null;

  const [facts, skills] = await Promise.all([
    fetchBadgeFacts([row.id]),
    fetchSkillSnapshots([row.id]),
  ]);
  const f = facts[row.id] ?? emptyFacts();
  const extras: ProfileExtras = {
    roles: f.roles,
    identityVerified: f.identityVerified,
    skill: skills[row.id] ?? null,
  };
  return toPlayerProfileDTO(row, extras, viewer);
}

/** Lightweight fetch for metadata generation (§28) — reuses the cached profile read. */
export async function getPlayerMetaBySlug(slug: string): Promise<PlayerProfileDTO | null> {
  return getPlayerBySlug(slug, { viewerId: null, isStaff: false });
}

// ----------------------------------------------------------------------------
// Vouch comments (§9.3) — always attributed; public read of active comments.
// ----------------------------------------------------------------------------

export interface PlayerComment {
  id: string;
  authorName: string;
  authorSlug: string | null;
  authorInitials: string;
  authorAvatarUrl: string | null;
  date: string;
  body: string;
}

export async function getPlayerComments(targetId: string): Promise<PlayerComment[]> {
  const cached = unstable_cache(
    async (): Promise<PlayerComment[]> => {
      try {
        const supabase = createPublicClient();
        const { data: comments } = await supabase
          .from('vouch_comments')
          .select('id, author_id, body, created_at')
          .eq('target_id', targetId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(50);
        const rows = (comments ?? []) as Array<{
          id: string;
          author_id: string;
          body: string;
          created_at: string;
        }>;
        if (rows.length === 0) return [];

        const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
        const { data: authors } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, nickname, slug, avatar_path')
          .in('id', authorIds);
        const byId = new Map(
          (authors ?? []).map((a) => {
            const row = a as {
              id: string;
              first_name: string | null;
              last_name: string | null;
              nickname: string | null;
              slug: string | null;
              avatar_path: string | null;
            };
            return [row.id, row];
          }),
        );

        return rows.map((r) => {
          const a = byId.get(r.author_id);
          const name =
            [a?.first_name, a?.last_name].filter(Boolean).join(' ').trim() ||
            a?.nickname ||
            'VouchPlay player';
          const initials =
            `${a?.first_name?.[0] ?? ''}${a?.last_name?.[0] ?? ''}`.toUpperCase() ||
            (a?.nickname?.[0] ?? '?').toUpperCase();
          return {
            id: r.id,
            authorName: name,
            authorSlug: a?.slug ?? null,
            authorInitials: initials,
            authorAvatarUrl: avatarUrl(a?.avatar_path),
            date: r.created_at,
            body: r.body,
          };
        });
      } catch {
        return [];
      }
    },
    ['player-comments', targetId],
    { revalidate: 60, tags: [commentsTag(targetId)] },
  );
  return cached();
}
