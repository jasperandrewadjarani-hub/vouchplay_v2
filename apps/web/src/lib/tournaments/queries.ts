import { unstable_cache } from 'next/cache';
import type { TournamentRow, DivisionRow, TournamentStatus } from '@vouchplay/db';
import { createPublicClient } from '@/lib/supabase/public';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  TOURNAMENT_CARD_COLUMNS,
  TOURNAMENT_DETAIL_COLUMNS,
  DIVISION_COLUMNS,
  toTournamentCardDTO,
  toDivisionDTO,
  type TournamentCardDTO,
  type TournamentDetailDTO,
  type TournamentViewer,
  type OrganizerDTO,
  type AnnouncementDTO,
} from './dto';

export const TOURNAMENTS_LIST_TAG = 'tournaments:list';
export const tournamentTag = (slug: string) => `tournament:${slug}`;
export const tournamentDivisionsTag = (id: string) => `tournament-divisions:${id}`;
export const tournamentAnnouncementsTag = (id: string) => `tournament-announcements:${id}`;
export const PAGE_SIZE = 24;

// Statuses shown in public discovery (§19). Draft/archived/cancelled excluded.
const DISCOVERABLE: TournamentStatus[] = [
  'published',
  'registration_open',
  'registration_closed',
  'locked',
  'live',
  'completed',
];

export interface TournamentFilters {
  q?: string;
  city?: string;
  page?: number;
}

export interface TournamentListPage {
  tournaments: TournamentCardDTO[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

async function fetchTournamentList(
  f: TournamentFilters,
): Promise<{ rows: TournamentRow[]; total: number }> {
  try {
    const supabase = createPublicClient();
    let query = supabase
      .from('tournaments')
      .select(TOURNAMENT_CARD_COLUMNS, { count: 'exact' })
      .in('status', DISCOVERABLE)
      .eq('visibility', 'public');
    if (f.q && f.q.trim()) {
      const term = f.q.trim().replace(/[%,()]/g, ' ');
      query = query.or(`name.ilike.%${term}%,city.ilike.%${term}%,venue_name.ilike.%${term}%`);
    }
    if (f.city && f.city.trim()) query = query.ilike('city', `%${f.city.trim()}%`);
    const page = Math.max(1, f.page ?? 1);
    const from = (page - 1) * PAGE_SIZE;
    const { data, count } = await query
      .order('start_at', { ascending: true, nullsFirst: false })
      .range(from, from + PAGE_SIZE - 1);
    return { rows: (data as TournamentRow[] | null) ?? [], total: count ?? 0 };
  } catch {
    return { rows: [], total: 0 };
  }
}

export async function listTournaments(filters: TournamentFilters): Promise<TournamentListPage> {
  const key = JSON.stringify({
    q: filters.q?.trim().toLowerCase() ?? '',
    city: filters.city?.trim().toLowerCase() ?? '',
    page: filters.page ?? 1,
  });
  const cached = unstable_cache(() => fetchTournamentList(filters), ['tournaments-list', key], {
    revalidate: 60,
    tags: [TOURNAMENTS_LIST_TAG],
  });
  const { rows, total } = await cached();
  const page = Math.max(1, filters.page ?? 1);
  return {
    tournaments: rows.map(toTournamentCardDTO),
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

interface MiniProfile {
  id: string;
  name: string;
  slug: string | null;
}
async function resolveNames(ids: string[]): Promise<Map<string, MiniProfile>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, MiniProfile>();
  if (unique.length === 0) return map;
  const svc = createServiceClient();
  const { data } = await svc
    .from('profiles')
    .select('id, first_name, last_name, nickname, slug')
    .in('id', unique);
  for (const r of data ?? []) {
    const row = r as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      nickname: string | null;
      slug: string | null;
    };
    const name =
      [row.first_name, row.last_name].filter(Boolean).join(' ').trim() ||
      row.nickname ||
      'VouchPlay player';
    map.set(row.id, { id: row.id, name, slug: row.slug });
  }
  return map;
}

/**
 * Full tournament detail (§17–§19). Uses the caller's session so organizers can view their own
 * drafts (RLS), while anonymous viewers only see non-draft. Interested count is computed server-side
 * (interests are not publicly readable). Returns null when not found / not visible.
 */
export async function getTournamentBySlug(
  slug: string,
  viewer: TournamentViewer,
): Promise<TournamentDetailDTO | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('tournaments')
      .select(TOURNAMENT_DETAIL_COLUMNS)
      .eq('slug', slug)
      .maybeSingle();
    const row = data as TournamentRow | null;
    if (!row) return null;

    const [divRes, orgRes, annRes] = await Promise.all([
      supabase
        .from('divisions')
        .select(DIVISION_COLUMNS)
        .eq('tournament_id', row.id)
        .order('created_at'),
      supabase
        .from('tournament_organizers')
        .select('user_id, permissions, status')
        .eq('tournament_id', row.id)
        .eq('status', 'active'),
      supabase
        .from('tournament_announcements')
        .select('id, title, body, audience, published_at')
        .eq('tournament_id', row.id)
        .order('published_at', { ascending: false })
        .limit(50),
    ]);

    const svc = createServiceClient();
    const { count: interestedCount } = await svc
      .from('tournament_interests')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', row.id);

    let myInterest = false;
    if (viewer.viewerId) {
      const { data: mine } = await supabase
        .from('tournament_interests')
        .select('id')
        .eq('tournament_id', row.id)
        .eq('player_id', viewer.viewerId)
        .is('division_id', null)
        .maybeSingle();
      myInterest = !!mine;
    }

    const orgRows = (orgRes.data ?? []) as Array<{
      user_id: string;
      permissions: Record<string, unknown>;
    }>;
    const names = await resolveNames([row.owner_organizer_id, ...orgRows.map((o) => o.user_id)]);
    const owner = names.get(row.owner_organizer_id) ?? null;

    const organizers: OrganizerDTO[] = [
      {
        userId: row.owner_organizer_id,
        name: owner?.name ?? 'Organizer',
        slug: owner?.slug ?? null,
        isOwner: true,
        permissions: {},
      },
      ...orgRows.map((o) => ({
        userId: o.user_id,
        name: names.get(o.user_id)?.name ?? 'Organizer',
        slug: names.get(o.user_id)?.slug ?? null,
        isOwner: false,
        permissions: o.permissions ?? {},
      })),
    ];

    const isOwner = viewer.viewerId === row.owner_organizer_id;
    const isCo = orgRows.some((o) => o.user_id === viewer.viewerId);
    const announcements: AnnouncementDTO[] = (
      (annRes.data ?? []) as Array<{
        id: string;
        title: string;
        body: string;
        audience: string;
        published_at: string;
      }>
    ).map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      audience: a.audience,
      publishedAt: a.published_at,
    }));

    return {
      ...toTournamentCardDTO(row),
      id: row.id,
      description: row.description,
      venueName: row.venue_name,
      addressText: row.address_text,
      timezone: row.timezone,
      registrationOpenAt: row.registration_open_at,
      registrationCloseAt: row.registration_close_at,
      contact: row.contact,
      termsText: row.terms_text,
      paymentInstructions: row.payment_instructions,
      ownerId: row.owner_organizer_id,
      ownerName: owner?.name ?? null,
      ownerSlug: owner?.slug ?? null,
      maxClubsPerPlayer: row.max_clubs_per_player ?? 3,
      divisions: ((divRes.data ?? []) as unknown as DivisionRow[]).map(toDivisionDTO),
      organizers,
      announcements,
      interestedCount: interestedCount ?? 0,
      myInterest,
      isOwner,
      canManage: isOwner || isCo || viewer.isStaff,
    };
  } catch {
    return null;
  }
}
