import { unstable_cache } from 'next/cache';
import type { ClubRow, ClubRole, ClubMembershipStatus } from '@vouchplay/db';
import { createPublicClient } from '@/lib/supabase/public';
import { createClient } from '@/lib/supabase/server';
import { avatarUrl } from '@/lib/storage';
import type { ClubRef } from '@/lib/players/dto';
import {
  CLUB_CARD_COLUMNS,
  CLUB_DETAIL_COLUMNS,
  toClubCardDTO,
  type ClubCardDTO,
  type ClubDetailDTO,
  type ClubMemberDTO,
  type ClubViewer,
} from './dto';

export const CLUBS_LIST_TAG = 'clubs:list';
export const clubTag = (slug: string) => `club:${slug}`;
export const clubMembersTag = (id: string) => `club-members:${id}`;
export const userClubsTag = (userId: string) => `user-clubs:${userId}`;
export const PAGE_SIZE = 24;

export interface ClubFilters {
  q?: string;
  city?: string;
  verifiedOnly?: boolean;
  page?: number;
}

interface MiniProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  slug: string | null;
  avatar_path: string | null;
}

function displayName(p: MiniProfile | undefined): string {
  return (
    [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() ||
    p?.nickname ||
    'VouchPlay player'
  );
}
function initialsFor(p: MiniProfile | undefined): string {
  return (
    `${p?.first_name?.[0] ?? ''}${p?.last_name?.[0] ?? ''}`.toUpperCase() ||
    (p?.nickname?.[0] ?? '?').toUpperCase()
  );
}

async function resolveProfiles(client: ReturnType<typeof createPublicClient>, ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, MiniProfile>();
  if (unique.length === 0) return map;
  const { data } = await client
    .from('profiles')
    .select('id, first_name, last_name, nickname, slug, avatar_path')
    .in('id', unique);
  for (const r of data ?? []) {
    const row = r as MiniProfile & { id: string };
    map.set(row.id, row);
  }
  return map;
}

/** Active-membership counts for a set of club ids (RLS: active memberships are public). */
async function activeMemberCounts(
  client: ReturnType<typeof createPublicClient>,
  clubIds: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (clubIds.length === 0) return out;
  const { data } = await client
    .from('club_memberships')
    .select('club_id')
    .in('club_id', clubIds)
    .eq('status', 'active');
  for (const r of data ?? []) {
    const id = (r as { club_id: string }).club_id;
    out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Directory
// ----------------------------------------------------------------------------
export interface ClubListPage {
  clubs: ClubCardDTO[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

async function fetchClubList(f: ClubFilters): Promise<{ rows: ClubRow[]; total: number }> {
  try {
    const supabase = createPublicClient();
    let query = supabase
      .from('clubs')
      .select(CLUB_CARD_COLUMNS, { count: 'exact' })
      .eq('activity_status', 'active');
    if (f.verifiedOnly) query = query.eq('verification_status', 'verified');
    if (f.q && f.q.trim()) {
      const term = f.q.trim().replace(/[%,()]/g, ' ');
      query = query.or(`name.ilike.%${term}%,city.ilike.%${term}%`);
    }
    if (f.city && f.city.trim()) query = query.ilike('city', `%${f.city.trim()}%`);
    const page = Math.max(1, f.page ?? 1);
    const from = (page - 1) * PAGE_SIZE;
    const { data, count } = await query
      .order('verification_status', { ascending: true })
      .order('name', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    return { rows: (data as ClubRow[] | null) ?? [], total: count ?? 0 };
  } catch {
    return { rows: [], total: 0 };
  }
}

export async function listClubs(filters: ClubFilters): Promise<ClubListPage> {
  const key = JSON.stringify({
    q: filters.q?.trim().toLowerCase() ?? '',
    city: filters.city?.trim().toLowerCase() ?? '',
    verified: filters.verifiedOnly ? 1 : 0,
    page: filters.page ?? 1,
  });
  const cached = unstable_cache(() => fetchClubList(filters), ['clubs-list', key], {
    revalidate: 60,
    tags: [CLUBS_LIST_TAG],
  });
  const { rows, total } = await cached();
  const supabase = createPublicClient();
  const counts = await activeMemberCounts(
    supabase,
    rows.map((r) => r.id),
  );
  const clubs = rows.map((row) => toClubCardDTO(row, counts[row.id] ?? 0));
  const page = Math.max(1, filters.page ?? 1);
  return {
    clubs,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

// ----------------------------------------------------------------------------
// Single club page (§15.5)
// ----------------------------------------------------------------------------
async function fetchClubRow(slug: string): Promise<ClubRow | null> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from('clubs')
      .select(CLUB_DETAIL_COLUMNS)
      .eq('slug', slug)
      .maybeSingle();
    return (data as ClubRow | null) ?? null;
  } catch {
    return null;
  }
}

export async function getClubBySlug(
  slug: string,
  viewer: ClubViewer,
): Promise<ClubDetailDTO | null> {
  const cachedRow = unstable_cache(() => fetchClubRow(slug), ['club-row', slug], {
    revalidate: 60,
    tags: [clubTag(slug)],
  });
  const row = await cachedRow();
  if (!row) return null;
  // Hide deleted/suspended clubs from the public unless staff or a manager.
  if (
    (row.activity_status === 'deleted' || row.activity_status === 'suspended') &&
    !viewer.isStaff
  ) {
    // A manager still needs access; check membership below and gate there.
    const managerBypass = viewer.viewerId ? await viewerMembership(row.id, viewer.viewerId) : null;
    const isMgr =
      managerBypass &&
      ['owner', 'admin'].includes(managerBypass.role) &&
      managerBypass.status === 'active';
    if (!isMgr) return null;
  }

  const supabase = createPublicClient();
  const [{ data: staffMembers }, counts] = await Promise.all([
    supabase
      .from('club_memberships')
      .select('user_id, role, status, created_at')
      .eq('club_id', row.id)
      .eq('status', 'active')
      .in('role', ['owner', 'admin']),
    activeMemberCounts(supabase, [row.id]),
  ]);
  const staffRows = (staffMembers ?? []) as Array<{
    user_id: string;
    role: ClubRole;
    status: ClubMembershipStatus;
    created_at: string;
  }>;
  const profiles = await resolveProfiles(
    supabase,
    staffRows.map((m) => m.user_id),
  );
  const toMember = (m: (typeof staffRows)[number]): ClubMemberDTO => {
    const p = profiles.get(m.user_id);
    return {
      userId: m.user_id,
      name: displayName(p),
      slug: p?.slug ?? null,
      initials: initialsFor(p),
      avatarUrl: avatarUrl(p?.avatar_path),
      role: m.role,
      status: m.status,
      since: m.created_at,
    };
  };
  const owners = staffRows.filter((m) => m.role === 'owner').map(toMember);
  const admins = staffRows.filter((m) => m.role === 'admin').map(toMember);

  const mine = viewer.viewerId ? await viewerMembership(row.id, viewer.viewerId) : null;
  const isOwner = !!mine && mine.role === 'owner' && mine.status === 'active';
  const isManager = !!mine && ['owner', 'admin'].includes(mine.role) && mine.status === 'active';
  const isMember = !!mine && mine.status === 'active';

  return {
    ...toClubCardDTO(row, counts[row.id] ?? 0),
    id: row.id,
    description: row.description,
    contact: row.contact,
    socialLinks: row.social_links ?? {},
    createdAt: row.created_at,
    verificationStatus: row.verification_status,
    activityStatus: row.activity_status,
    owners,
    admins,
    myMembership: mine ? { role: mine.role, status: mine.status } : null,
    isOwner,
    isManager,
    isMember,
    canManage: isManager || viewer.isStaff,
  };
}

/** The viewer's own membership row (any status) — read with their session (RLS: own rows). */
async function viewerMembership(
  clubId: string,
  viewerId: string,
): Promise<{ role: ClubRole; status: ClubMembershipStatus } | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('club_memberships')
      .select('role, status')
      .eq('club_id', clubId)
      .eq('user_id', viewerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as { role: ClubRole; status: ClubMembershipStatus } | null) ?? null;
  } catch {
    return null;
  }
}

/** Full member list for a club's management + member pages (RLS: managers/staff see all). */
export async function getClubMembers(clubId: string): Promise<ClubMemberDTO[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('club_memberships')
      .select('user_id, role, status, created_at')
      .eq('club_id', clubId)
      .order('status', { ascending: true })
      .order('created_at', { ascending: true });
    const rows = (data ?? []) as Array<{
      user_id: string;
      role: ClubRole;
      status: ClubMembershipStatus;
      created_at: string;
    }>;
    if (rows.length === 0) return [];
    const pub = createPublicClient();
    const profiles = await resolveProfiles(
      pub,
      rows.map((m) => m.user_id),
    );
    return rows.map((m) => {
      const p = profiles.get(m.user_id);
      return {
        userId: m.user_id,
        name: displayName(p),
        slug: p?.slug ?? null,
        initials: initialsFor(p),
        avatarUrl: avatarUrl(p?.avatar_path),
        role: m.role,
        status: m.status,
        since: m.created_at,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Bulk-load active club memberships as ClubRefs for a set of users (avoids N+1 in the directory).
 * Two queries total: active memberships for the ids, then the referenced active clubs.
 */
export async function getUserClubsBulk(userIds: string[]): Promise<Record<string, ClubRef[]>> {
  const out: Record<string, ClubRef[]> = {};
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return out;
  try {
    const supabase = createPublicClient();
    const { data: memberships } = await supabase
      .from('club_memberships')
      .select('user_id, club_id, role')
      .in('user_id', ids)
      .eq('status', 'active');
    const mRows = (memberships ?? []) as Array<{
      user_id: string;
      club_id: string;
      role: ClubRole;
    }>;
    if (mRows.length === 0) return out;
    const clubIds = Array.from(new Set(mRows.map((m) => m.club_id)));
    const { data: clubs } = await supabase
      .from('clubs')
      .select('id, slug, name, logo_path, verification_status, activity_status')
      .in('id', clubIds)
      .eq('activity_status', 'active');
    const clubById = new Map(((clubs ?? []) as ClubRow[]).map((c) => [c.id, c]));
    for (const m of mRows) {
      const c = clubById.get(m.club_id);
      if (!c) continue;
      (out[m.user_id] ??= []).push({
        slug: c.slug,
        name: c.name,
        iconUrl: avatarUrl(c.logo_path),
        verified: c.verification_status === 'verified',
        relationship: (m.role ?? 'member') as 'owner' | 'admin' | 'member',
      });
    }
  } catch {
    // Clubs are decoration on player cards — never fail the card render.
  }
  return out;
}

/** A user's active club memberships as ClubRefs for their player card/profile (§8.1). */
export async function getUserClubs(userId: string): Promise<ClubRef[]> {
  const cached = unstable_cache(
    async (): Promise<ClubRef[]> => {
      try {
        const supabase = createPublicClient();
        const { data: memberships } = await supabase
          .from('club_memberships')
          .select('club_id, role')
          .eq('user_id', userId)
          .eq('status', 'active');
        const rows = (memberships ?? []) as Array<{ club_id: string; role: ClubRole }>;
        if (rows.length === 0) return [];
        const roleById = new Map(rows.map((r) => [r.club_id, r.role]));
        const { data: clubs } = await supabase
          .from('clubs')
          .select('id, slug, name, logo_path, verification_status, activity_status')
          .in(
            'id',
            rows.map((r) => r.club_id),
          )
          .eq('activity_status', 'active');
        return ((clubs ?? []) as ClubRow[]).map((c) => ({
          slug: c.slug,
          name: c.name,
          iconUrl: avatarUrl(c.logo_path),
          verified: c.verification_status === 'verified',
          relationship: (roleById.get(c.id) ?? 'member') as 'owner' | 'admin' | 'member',
        }));
      } catch {
        return [];
      }
    },
    ['user-clubs', userId],
    { revalidate: 60, tags: [userClubsTag(userId)] },
  );
  return cached();
}
