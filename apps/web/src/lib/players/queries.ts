import { unstable_cache } from 'next/cache';
import type { GlobalRole, ProfileRow } from '@vouchplay/db';
import type { SkillAlgorithmVersion } from '@vouchplay/config';
import { createPublicClient } from '@/lib/supabase/public';
import { createServiceClient } from '@/lib/supabase/service';
import { avatarUrl } from '@/lib/storage';
import { getVouchSettings, getActiveSkillVersion, getNewAccountBadgeDays } from '@/lib/settings';
import {
  pickActiveSkill,
  selectSkillProfiles,
  type SkillProfileRow,
} from '@/lib/vouches/active-skill';
import { CLUBS_LIST_TAG, getUserClubs, getUserClubsBulk } from '@/lib/clubs/queries';
import { isOrganizerOfTournament } from '@/lib/tournaments/queries';
import {
  PLAYER_CARD_COLUMNS,
  PLAYER_PROFILE_COLUMNS,
  fullName,
  toPlayerCardDTO,
  toPlayerProfileDTO,
  type PlayerCardDTO,
  type PlayerProfileDTO,
  type ProfileExtras,
  type SkillSnapshot,
  type ViewerContext,
} from './dto';
import {
  buildCityOptions,
  effectiveSkillOrdinal,
  idsMatchingIndexFilters,
  intersectIds,
  orderIdsForSort,
  resolveSort,
  type CityOption,
  type PlayerFilters,
  type SkillIndexEntry,
  type SortableRow,
} from './filters';

export const PLAYERS_LIST_TAG = 'players:list';
export const playerTag = (slug: string) => `player:${slug}`;
export const commentsTag = (id: string) => `player-comments:${id}`;

export const PAGE_SIZE = 24;

export type { PlayerFilters, PlayerSort } from './filters';

/**
 * Stable, order-independent cache key for a filter set. `staff` is passed separately (not read off
 * `filters`) because it changes what `sort: 'sts_desc'` is even allowed to mean (§2AG A1, D3) - two
 * requests with identical filters but different viewer privilege must never share a cache entry.
 */
function filtersKey(f: PlayerFilters, staff: boolean): string {
  return JSON.stringify({
    q: f.q?.trim().toLowerCase() ?? '',
    city: f.city?.trim().toLowerCase() ?? '',
    sex: f.sex ?? '',
    skills: [...(f.skills ?? [])].sort((a, b) => a - b).join(','),
    stsMin: f.stsMin ?? 0,
    stsMax: f.stsMax ?? 0,
    vouchesMin: f.vouchesMin ?? 0,
    vouchesMax: f.vouchesMax ?? 0,
    givenMin: f.givenMin ?? 0,
    givenMax: f.givenMax ?? 0,
    club: f.club ?? '',
    identityVerified: f.identityVerified ? 1 : 0,
    coach: f.coach ? 1 : 0,
    lfp: f.lookingForPartner ? 1 : 0,
    ofs: f.openForSponsorship ? 1 : 0,
    newOnly: f.newOnly ? 1 : 0,
    tournament: f.tournament ?? '',
    sort: f.sort ?? 'new_unvouched',
    staff: staff ? 1 : 0,
    page: f.page ?? 1,
  });
}

// ----------------------------------------------------------------------------
// Public-by-design badge facts (§8.2). RLS-clean: read through the anon client via the
// `public_player_facts()` SECURITY DEFINER RPC (migration 0003), which returns ONLY safe booleans
// - never the sensitive columns of user_roles / identity_verifications. The service client is no
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
 *
 * Routes through the `skill_algorithm_active_version` accessor (master_plan §2AF rollout step 2):
 * byte-identical V1 behaviour while the version is `STS_V1` (default); once flipped to `STS_V2`, reads
 * the six v2 columns and falls open to V1 automatically if migration 0034 is not applied (§2R). `version`
 * is a cache-key argument (Next's `unstable_cache` keys on serialized args), so flipping the Admin
 * setting invalidates this cache instead of serving stale V1 numbers for up to 60s.
 */
const fetchSkillSnapshots = unstable_cache(
  async (ids: string[], version: SkillAlgorithmVersion): Promise<Record<string, SkillSnapshot>> => {
    const out: Record<string, SkillSnapshot> = {};
    if (ids.length === 0) return out;
    try {
      const supabase = createPublicClient();
      const { rows } = await selectSkillProfiles<
        SkillProfileRow & { player_id: string; distribution: Record<string, number> | null }
      >(
        version,
        (columns) => supabase.from('player_skill_profiles').select(columns).in('player_id', ids),
        'player_id, distribution',
      );
      for (const row of rows) {
        const active = pickActiveSkill(row, version);
        out[row.player_id] = {
          communitySkillLevel: active.communitySkillLevel,
          sts: active.sts ?? 0,
          skillVerified: active.skillVerified,
          uniqueVoucherCount: active.evidenceCount ?? 0,
          distribution: row.distribution ?? {},
          evidenceCount: active.evidenceCount,
          skillVersion: active.version,
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

/**
 * Whether a player has an identity verification currently pending or under review (master_plan
 * §2AG Phase C). Deliberately NOT cached via `unstable_cache`: it is read for at most one profile
 * per request - the player's OWN profile, for the "ID pending review" chip - never for anyone
 * else's, and never exposes the document path. Fails open to false so a missing bucket/table state
 * before migration 0036 never breaks the profile page.
 */
export async function hasPendingIdentityVerification(userId: string): Promise<boolean> {
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from('identity_verifications')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['pending', 'reviewing'])
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------
// Filter option sources and the skill index (master_plan §2B)
//
// SCALE NOTE, read this before reusing the pattern: the skill index and the club/identity/role
// filters each build an id list that is intersected and handed to `.in('id', ...)`. Effective skill
// is a per-row fallback across `player_skill_profiles` and `profiles`, which PostgREST cannot
// express in one query, so the fallback is resolved here instead. At the directory's real size
// (163 active profiles, 141 skill rows) this is a couple of small cached reads and an `in(...)` of
// at most a few hundred uuids. **It is sound to roughly a thousand players.** Past that the id list
// outgrows a URL and this belongs in a SQL view or a SECURITY DEFINER RPC that filters server-side.
// ----------------------------------------------------------------------------

/**
 * Every directory player's filterable + orderable facts (§2AG A1/A2): community skill where the
 * community has rated them, otherwise their self-rating, plus STS (0 for a player with no skill
 * profile - the same value the chip now renders, §2B), vouches RECEIVED (evidence count) and GIVEN
 * (D4's "total number of vouches"), and the onboarded-at/display-name pair the directory's sort
 * options need. One bounded read of `vouches` (active rows, ≤10000) is grouped by voucher in memory
 * alongside the existing profile/skill reads, on the same 60s cache.
 */
const fetchSkillIndex = unstable_cache(
  async (version: SkillAlgorithmVersion): Promise<Record<string, SkillIndexEntry>> => {
    const out: Record<string, SkillIndexEntry> = {};
    try {
      const supabase = createPublicClient();
      const [profilesRes, { rows: skillRows }, givenRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, self_rated_skill, onboarded_at, first_name, last_name, nickname')
          .eq('account_status', 'active')
          .not('onboarded_at', 'is', null),
        selectSkillProfiles<SkillProfileRow & { player_id: string }>(
          version,
          (columns) => supabase.from('player_skill_profiles').select(columns),
          'player_id',
        ),
        supabase.from('vouches').select('voucher_id').eq('status', 'active').limit(10000),
      ]);

      const skills = new Map<string, { csl: number | null; sts: number; received: number }>();
      for (const row of skillRows) {
        const active = pickActiveSkill(row, version);
        skills.set(row.player_id, {
          csl: active.communitySkillLevel,
          sts: active.sts ?? 0,
          received: active.evidenceCount ?? 0,
        });
      }

      const given = new Map<string, number>();
      for (const r of givenRes.data ?? []) {
        const voucherId = (r as { voucher_id: string }).voucher_id;
        given.set(voucherId, (given.get(voucherId) ?? 0) + 1);
      }

      for (const p of profilesRes.data ?? []) {
        const row = p as {
          id: string;
          self_rated_skill: number | null;
          onboarded_at: string | null;
          first_name: string | null;
          last_name: string | null;
          nickname: string | null;
        };
        const s = skills.get(row.id);
        const name =
          [row.first_name, row.last_name].filter(Boolean).join(' ').trim() ||
          row.nickname ||
          'VouchPlay player';
        out[row.id] = {
          effectiveSkill: effectiveSkillOrdinal(s?.csl ?? null, row.self_rated_skill),
          sts: s?.sts ?? 0,
          vouchesReceived: s?.received ?? 0,
          vouchesGiven: given.get(row.id) ?? 0,
          onboardedAt: row.onboarded_at,
          displayName: name,
        };
      }
    } catch {
      // An unavailable index must not empty the directory; the caller treats {} as "cannot
      // restrict", which returns every player rather than none.
    }
    return out;
  },
  ['player-skill-index'],
  { revalidate: 60, tags: [PLAYERS_LIST_TAG] },
);

/** Ids of the active members of one club (for the club filter). */
const fetchClubMemberIds = unstable_cache(
  async (slug: string): Promise<string[]> => {
    try {
      const supabase = createPublicClient();
      const { data: club } = await supabase
        .from('clubs')
        .select('id')
        .eq('slug', slug)
        .eq('activity_status', 'active')
        .maybeSingle();
      const clubId = (club as { id: string } | null)?.id;
      if (!clubId) return [];
      const { data } = await supabase
        .from('club_memberships')
        .select('user_id')
        .eq('club_id', clubId)
        .eq('status', 'active');
      return Array.from(new Set((data ?? []).map((r) => (r as { user_id: string }).user_id)));
    } catch {
      return [];
    }
  },
  ['player-club-member-ids'],
  { revalidate: 60, tags: [PLAYERS_LIST_TAG] },
);

const TOURNAMENT_FILTER_REGISTRATION_STATUSES = [
  'confirmed',
  'payment_submitted',
  'payment_pending',
  'waitlisted',
] as const;

/**
 * Ids of players on a team with a live registration in one tournament (§2AG A4, D7): the id set the
 * staff/organizer tournament filter restricts to. Service client (bypasses RLS on `registrations`/
 * `team_members`, neither of which is publicly readable) - safe because only ids are returned, and
 * this is applied only after the caller has confirmed the viewer may use this filter at all (see
 * `isOrganizerOfTournament` and the gate in `listPlayers`). Bounded: a tournament's registrations and
 * team rosters are both small relative to the 1k-player ceiling documented above.
 */
const fetchTournamentPlayerIds = unstable_cache(
  async (tournamentId: string): Promise<string[]> => {
    try {
      const svc = createServiceClient();
      const { data: regs } = await svc
        .from('registrations')
        .select('team_id')
        .eq('tournament_id', tournamentId)
        .in('status', TOURNAMENT_FILTER_REGISTRATION_STATUSES)
        .limit(2000);
      const teamIds = Array.from(
        new Set((regs ?? []).map((r) => (r as { team_id: string }).team_id)),
      );
      if (teamIds.length === 0) return [];
      const { data: members } = await svc
        .from('team_members')
        .select('player_id')
        .in('team_id', teamIds)
        .limit(10000);
      return Array.from(
        new Set((members ?? []).map((r) => (r as { player_id: string }).player_id)),
      );
    } catch {
      return [];
    }
  },
  ['player-tournament-ids'],
  { revalidate: 60, tags: [PLAYERS_LIST_TAG] },
);

/**
 * The "New this week" cutoff instant (§2AG A3, D5), rounded to the current minute so the value -
 * and therefore the SQL-level cache key that includes it - does not change on every single request
 * (the 60s list-row cache would otherwise never be reused while the filter is on). A player right at
 * the boundary can be off by well under the existing 60s cache TTL; that is not a correctness issue
 * anywhere else in this app and is not one here either.
 */
async function newAccountCutoffIso(): Promise<string> {
  const days = await getNewAccountBadgeDays();
  const minuteBucket = Math.floor(Date.now() / 60_000) * 60_000;
  return new Date(minuteBucket - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * The cities that actually have players, grouped across spellings. Offering the whole PH city list
 * would be a menu of a hundred places where three have anybody in them (§2B).
 */
export const getDirectoryCityOptions = unstable_cache(
  async (): Promise<CityOption[]> => {
    try {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from('profiles')
        .select('city')
        .eq('account_status', 'active')
        .not('onboarded_at', 'is', null);
      return buildCityOptions((data ?? []).map((r) => (r as { city: string | null }).city));
    } catch {
      return [];
    }
  },
  ['player-city-options'],
  { revalidate: 300, tags: [PLAYERS_LIST_TAG] },
);

export interface ClubOption {
  slug: string;
  name: string;
}

/** Active clubs, for the club filter. */
export const getDirectoryClubOptions = unstable_cache(
  async (): Promise<ClubOption[]> => {
    try {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from('clubs')
        .select('slug, name')
        .eq('activity_status', 'active')
        .order('name', { ascending: true });
      return (data ?? []) as ClubOption[];
    } catch {
      return [];
    }
  },
  ['player-club-options'],
  { revalidate: 300, tags: [CLUBS_LIST_TAG, PLAYERS_LIST_TAG] },
);

// ----------------------------------------------------------------------------
// Directory listing (cache-first public read; §34A.5 PUBLIC_REVALIDATED)
// ----------------------------------------------------------------------------

interface RawListResult {
  rows: ProfileRow[];
  total: number;
}

/**
 * Fetch every public directory row matching the filters (RLS-enforced anon read) - NOT just one
 * page. Cached; caller applies the viewer-specific DTO projection OUTSIDE the cache so the cache
 * stays public/shareable.
 *
 * Deliberately un-paginated at the SQL level (§2AG A1): the sort options (new-unvouched-first,
 * most-vouched, name...) mix a DB column (`onboarded_at`) with cached-index facts (vouches received,
 * STS) that PostgREST cannot ORDER BY together, so the caller sorts in memory and THEN paginates.
 * Supabase/PostgREST's own default row cap (1000) is what actually bounds this query - the same
 * ceiling the skill-index SCALE NOTE above already documents the directory against, so nothing here
 * is a new limit, just the existing one applied one step earlier in the pipeline.
 */
async function fetchListRows(
  f: PlayerFilters,
  restrictIds: string[] | null,
  newSinceIso: string | null,
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
    // `f.city` is the NORMALISED key ("zamboanga"), and a contains match is what makes it find
    // "Zamboanga City", "City of Zamboanga" and "zamboanga" alike (§2B).
    if (f.city && f.city.trim()) query = query.ilike('city', `%${f.city.trim()}%`);
    if (f.sex) query = query.eq('sex', f.sex);
    if (f.lookingForPartner) query = query.eq('looking_for_partner', true);
    if (f.openForSponsorship) query = query.eq('open_for_sponsorship', true);
    // "New this week" (§2AG A3, D5): onboarded within the admin window. `newSinceIso` is computed by
    // the caller (minute-bucketed, so this stays cacheable) from `new_account_badge_days`.
    if (newSinceIso) query = query.gte('onboarded_at', newSinceIso);

    // Base ordering only - the caller re-sorts in memory per the chosen `sort` before paginating
    // (§8.4: never rank by STS/popularity at the SQL level; `updated_at desc` here only decides
    // which rows survive if the true total ever exceeds the row cap above).
    const { data, count } = await query.order('updated_at', { ascending: false });
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

/**
 * Map of target id → remaining update-cooldown ms for every player the viewer currently has an ACTIVE
 * vouch for (master_plan §2U/§2V): 0 means changeable now; a key's absence means "not vouched". One
 * indexed query keyed on the viewer's own id, so it never exposes anyone else's vouching. Service
 * client is safe: the filter is `voucher_id = viewerId`, so only the viewer's own rows can return.
 */
export async function getViewerVouchCooldownMap(viewerId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const [{ data }, settings] = await Promise.all([
      createServiceClient()
        .from('vouches')
        .select('target_id, updated_at')
        .eq('voucher_id', viewerId)
        .eq('status', 'active'),
      getVouchSettings(),
    ]);
    const cooldownMs = settings.limits.updateCooldownDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const r of data ?? []) {
      const row = r as { target_id: string; updated_at: string };
      const remaining = cooldownMs - (now - new Date(row.updated_at).getTime());
      out.set(row.target_id, remaining > 0 ? remaining : 0);
    }
  } catch {
    // Empty map → no "vouched" state shown; safe default.
  }
  return out;
}

/**
 * The viewer's vouch state for one player (master_plan §2U): whether they have an active vouch, and
 * how long until they can change it under the update cooldown (0 = changeable now, null = no vouch).
 * Used by the profile page to colour the button and show the "already vouched" note.
 */
export async function getViewerVouchState(
  targetId: string,
  viewerId: string,
): Promise<{ hasVouched: boolean; canUpdateInMs: number | null }> {
  try {
    const { data } = await createServiceClient()
      .from('vouches')
      .select('updated_at')
      .eq('voucher_id', viewerId)
      .eq('target_id', targetId)
      .eq('status', 'active')
      .maybeSingle();
    if (!data) return { hasVouched: false, canUpdateInMs: null };
    const settings = await getVouchSettings();
    const cooldownMs = settings.limits.updateCooldownDays * 24 * 60 * 60 * 1000;
    const ageMs = Date.now() - new Date((data as { updated_at: string }).updated_at).getTime();
    const remaining = cooldownMs - ageMs;
    return { hasVouched: true, canUpdateInMs: remaining > 0 ? remaining : 0 };
  } catch {
    return { hasVouched: false, canUpdateInMs: null };
  }
}

export async function listPlayers(
  filters: PlayerFilters,
  viewer: ViewerContext,
): Promise<PlayerListPage> {
  // Role, identity, club, skill/STS-range, vouches-range and tournament all live outside `profiles`
  // (or need a server-side gate `profiles` alone cannot express), so each contributes an id set that
  // is intersected before the page query runs. `null` means "this filter is off", which is not the
  // same as an empty list - an empty list is a filter that genuinely matched nobody.
  const skillVersion = await getActiveSkillVersion();
  // D3/§8.4: `sts_desc` is staff-only. `parsePlayerFilters` already gates this at parse time, but a
  // filter set can reach this function from more than one caller, so it is re-checked here too -
  // the sort actually applied must never depend on trusting the caller got the gate right.
  const sort = resolveSort(filters.sort, viewer.isStaff);

  let restrictIds: string[] | null = null;
  if (filters.coach) {
    restrictIds = intersectIds(restrictIds, await fetchUserIdsWithRole('coach'));
  }
  if (filters.identityVerified) {
    restrictIds = intersectIds(restrictIds, await fetchVerifiedUserIds());
  }
  if (filters.club) {
    restrictIds = intersectIds(restrictIds, await fetchClubMemberIds(filters.club));
  }

  const indexFilterActive = Boolean(
    (filters.skills && filters.skills.length > 0) ||
    (filters.stsMin != null && filters.stsMin > 0) ||
    filters.stsMax != null ||
    (filters.vouchesMin != null && filters.vouchesMin > 0) ||
    filters.vouchesMax != null ||
    (filters.givenMin != null && filters.givenMin > 0) ||
    filters.givenMax != null,
  );
  // The sort options that need per-player vouches-received/STS facts, not just the DB row.
  const sortNeedsIndex = sort === 'new_unvouched' || sort === 'most_vouched' || sort === 'sts_desc';
  // Fetched at most once and reused for both filtering and ordering.
  const index = indexFilterActive || sortNeedsIndex ? await fetchSkillIndex(skillVersion) : null;
  if (indexFilterActive && index && Object.keys(index).length > 0) {
    // An index that failed to load is empty, and restricting to nothing would empty the directory
    // for everyone. Leave these filters unapplied rather than lie about the result.
    restrictIds = intersectIds(restrictIds, idsMatchingIndexFilters(index, filters));
  }

  // §2AG A4 (D7): the tournament filter is SERVER-GATED - never trust `filters.tournament` alone.
  // An unauthorized (or anonymous) request for it is served the unfiltered list, exactly as if the
  // param were absent, rather than an error that would confirm the tournament id means anything.
  let tournamentApplied = false;
  if (filters.tournament) {
    const allowed =
      viewer.isStaff ||
      (viewer.viewerId
        ? await isOrganizerOfTournament(viewer.viewerId, filters.tournament)
        : false);
    if (allowed) {
      tournamentApplied = true;
      restrictIds = intersectIds(restrictIds, await fetchTournamentPlayerIds(filters.tournament));
    }
  }

  const newSinceIso = filters.newOnly ? await newAccountCutoffIso() : null;

  const key =
    filtersKey(filters, viewer.isStaff) +
    '|restrict:' +
    (restrictIds ? restrictIds.join(',') : 'none') +
    '|tournamentApplied:' +
    (tournamentApplied ? 1 : 0) +
    '|new:' +
    (newSinceIso ?? '');
  const cached = unstable_cache(() => fetchListRows(filters, restrictIds, newSinceIso), [key], {
    revalidate: 60,
    tags: [PLAYERS_LIST_TAG],
  });
  const { rows, total } = await cached();

  // Sort in memory over the full matching set, THEN paginate (§2AG A1) - the chosen `sort` mixes a
  // DB column (`onboarded_at`) with cached-index facts PostgREST cannot ORDER BY together. See the
  // comment on `fetchListRows` for the row-count ceiling this relies on.
  const sortableRows: SortableRow[] = rows.map((row) => ({
    id: row.id,
    onboardedAt: row.onboarded_at,
    displayName: fullName(row) || row.nickname || 'VouchPlay player',
  }));
  const orderedIds = orderIdsForSort(sortableRows, index ?? {}, sort);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const orderedRows = orderedIds.map((id) => rowById.get(id)).filter((r): r is ProfileRow => !!r);

  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;
  const pageRows = orderedRows.slice(from, from + PAGE_SIZE);

  const ids = pageRows.map((r) => r.id);
  const [facts, skills, clubs, vouchMap, newAccountBadgeDays] = await Promise.all([
    fetchBadgeFacts(ids),
    fetchSkillSnapshots(ids, skillVersion),
    getUserClubsBulk(ids),
    viewer.viewerId
      ? getViewerVouchCooldownMap(viewer.viewerId)
      : Promise.resolve(new Map<string, number>()),
    getNewAccountBadgeDays(),
  ]);
  const players = pageRows.map((row) => {
    const f = facts[row.id] ?? emptyFacts();
    const extras: ProfileExtras = {
      roles: f.roles,
      identityVerified: f.identityVerified,
      skill: skills[row.id] ?? null,
      clubs: clubs[row.id] ?? [],
    };
    const dto = toPlayerCardDTO(row, extras, viewer, newAccountBadgeDays);
    const cooldown = vouchMap.get(row.id);
    dto.viewerHasVouched = vouchMap.has(row.id);
    dto.viewerVouchCanUpdateInMs = cooldown ?? null;
    return dto;
  });

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

  const skillVersion = await getActiveSkillVersion();
  const [facts, skills, clubs, newAccountBadgeDays] = await Promise.all([
    fetchBadgeFacts([row.id]),
    fetchSkillSnapshots([row.id], skillVersion),
    getUserClubs(row.id),
    getNewAccountBadgeDays(),
  ]);
  const f = facts[row.id] ?? emptyFacts();
  const extras: ProfileExtras = {
    roles: f.roles,
    identityVerified: f.identityVerified,
    skill: skills[row.id] ?? null,
    clubs,
  };
  return toPlayerProfileDTO(row, extras, viewer, newAccountBadgeDays);
}

/** Lightweight fetch for metadata generation (§28) - reuses the cached profile read. */
export async function getPlayerMetaBySlug(slug: string): Promise<PlayerProfileDTO | null> {
  return getPlayerBySlug(slug, { viewerId: null, isStaff: false });
}

// ----------------------------------------------------------------------------
// Vouch comments (§9.3) - always attributed; public read of active comments.
// ----------------------------------------------------------------------------

export interface PlayerComment {
  id: string;
  /** The author's user id, so a viewer can be offered edit/delete on their OWN comment only (§2B).
   *  Comments are always attributed, so this exposes nothing the name does not already. */
  authorId: string;
  authorName: string;
  authorSlug: string | null;
  authorInitials: string;
  authorAvatarUrl: string | null;
  date: string;
  /** True when the body has been changed since it was written - shown, not hidden (§2B). */
  edited: boolean;
  body: string;
}

export async function getPlayerComments(targetId: string): Promise<PlayerComment[]> {
  const cached = unstable_cache(
    async (): Promise<PlayerComment[]> => {
      try {
        const supabase = createPublicClient();
        const { data: comments } = await supabase
          .from('vouch_comments')
          .select('id, author_id, body, created_at, updated_at')
          .eq('target_id', targetId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(50);
        const rows = (comments ?? []) as Array<{
          id: string;
          author_id: string;
          body: string;
          created_at: string;
          updated_at: string;
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
          // The 0004 trigger stamps updated_at on every write, including the insert, so "edited"
          // is a real difference rather than a truthy timestamp. A second of slack absorbs the
          // insert's own two writes without labelling a brand-new comment as edited.
          const edited = new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() > 1000;
          return {
            id: r.id,
            authorId: r.author_id,
            authorName: name,
            authorSlug: a?.slug ?? null,
            authorInitials: initials,
            authorAvatarUrl: avatarUrl(a?.avatar_path),
            date: r.created_at,
            edited,
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
