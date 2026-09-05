import { unstable_cache } from 'next/cache';
import type { GlobalRole, ProfileRow } from '@vouchplay/db';
import { createPublicClient } from '@/lib/supabase/public';
import { createServiceClient } from '@/lib/supabase/service';
import {
  PLAYER_CARD_COLUMNS,
  PLAYER_PROFILE_COLUMNS,
  toPlayerCardDTO,
  toPlayerProfileDTO,
  type PlayerCardDTO,
  type PlayerProfileDTO,
  type ProfileExtras,
  type ViewerContext,
} from './dto';

export const PLAYERS_LIST_TAG = 'players:list';
export const playerTag = (slug: string) => `player:${slug}`;

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
// Public-by-design badge facts (§8.2). Read server-side with a tight projection;
// only booleans ever reach the client via the DTO. See notes.md for the RLS-clean
// hardening (migration 0003 `public_player_facts()`), to replace this in the fold-in step.
// ----------------------------------------------------------------------------

interface BadgeFacts {
  roles: GlobalRole[];
  identityVerified: boolean;
}

const emptyFacts = (): BadgeFacts => ({ roles: [], identityVerified: false });

/** Bulk-load active roles + identity-approved flag for a set of user ids (no N+1). */
const fetchBadgeFacts = unstable_cache(
  async (ids: string[]): Promise<Record<string, BadgeFacts>> => {
    const out: Record<string, BadgeFacts> = {};
    if (ids.length === 0) return out;
    for (const id of ids) out[id] = emptyFacts();
    try {
      const svc = createServiceClient();
      const [rolesRes, idRes] = await Promise.all([
        svc.from('user_roles').select('user_id, role').eq('status', 'active').in('user_id', ids),
        svc
          .from('identity_verifications')
          .select('user_id')
          .eq('status', 'approved')
          .in('user_id', ids),
      ]);
      for (const r of rolesRes.data ?? []) {
        const row = r as { user_id: string; role: GlobalRole };
        (out[row.user_id] ??= emptyFacts()).roles.push(row.role);
      }
      for (const v of idRes.data ?? []) {
        const row = v as { user_id: string };
        (out[row.user_id] ??= emptyFacts()).identityVerified = true;
      }
    } catch {
      // Facts are non-critical decoration; render cards without badges rather than failing.
    }
    return out;
  },
  ['player-badge-facts'],
  { revalidate: 60, tags: [PLAYERS_LIST_TAG] },
);

/** Ids of users who currently hold a given active role (for role filters). */
const fetchUserIdsWithRole = unstable_cache(
  async (role: GlobalRole): Promise<string[]> => {
    try {
      const svc = createServiceClient();
      const { data } = await svc.from('user_roles').select('user_id').eq('status', 'active').eq('role', role);
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
async function fetchListRows(f: PlayerFilters, restrictIds: string[] | null): Promise<RawListResult> {
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

  const facts = await fetchBadgeFacts(rows.map((r) => r.id));
  const players = rows.map((row) => {
    const f = facts[row.id] ?? emptyFacts();
    const extras: ProfileExtras = { roles: f.roles, identityVerified: f.identityVerified };
    return toPlayerCardDTO(row, extras, viewer);
  });

  // Verified/high-confidence first within the recency-ordered page (§8.4), no STS ranking.
  players.sort((a, b) => Number(b.identityVerified) - Number(a.identityVerified));

  const page = Math.max(1, filters.page ?? 1);
  return { players, total, page, pageSize: PAGE_SIZE, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
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

  const facts = await fetchBadgeFacts([row.id]);
  const f = facts[row.id] ?? emptyFacts();
  const extras: ProfileExtras = { roles: f.roles, identityVerified: f.identityVerified };
  return toPlayerProfileDTO(row, extras, viewer);
}

/** Lightweight fetch for metadata generation (§28) — reuses the cached profile read. */
export async function getPlayerMetaBySlug(slug: string): Promise<PlayerProfileDTO | null> {
  return getPlayerBySlug(slug, { viewerId: null, isStaff: false });
}
