/**
 * Player directory filters (master_plan §2B, extended by §2AG A1/A2/A3/A4) - ALL of the parsing,
 * normalising, matching, ordering and counting, as pure functions.
 *
 * Why one module: the URL, the chips in the summary row, the count on the Filters button and the
 * rows the query returns are four views of the same filter set, and they must not be able to
 * disagree. §1Z applied the same discipline to the organizer's queues after four dropdowns and a
 * list drifted apart.
 *
 * Nothing here touches Supabase, React or `next/*` - it is unit-tested in `filters.test.ts`.
 */

import { SKILL_BANDS, type SkillBand } from '@vouchplay/config';

// ----------------------------------------------------------------------------
// Sorting (§2AG A1, D3/D6)
// ----------------------------------------------------------------------------

/**
 * Public sort options plus one staff-only extra. `sts_desc` orders the directory by trust
 * CONFIDENCE, which §8.4 forbids showing to the public (it reads as a skill leaderboard) - it exists
 * only for staff moderation use and is gated at both parse time (below) and again in `queries.ts`.
 */
export type PlayerSort =
  'new_unvouched' | 'newest' | 'oldest' | 'name' | 'most_vouched' | 'sts_desc';

/** New-and-unvouched-first is the locked default (D6): a deliberate nudge to get newcomers vouched. */
export const DEFAULT_PLAYER_SORT: PlayerSort = 'new_unvouched';

const PUBLIC_SORTS: PlayerSort[] = ['new_unvouched', 'newest', 'oldest', 'name', 'most_vouched'];
const STAFF_ONLY_SORTS: PlayerSort[] = ['sts_desc'];
const ALL_SORTS: PlayerSort[] = [...PUBLIC_SORTS, ...STAFF_ONLY_SORTS];

/** Minimal per-player facts needed to order the directory - a projection, not a full row. */
export interface SortableRow {
  id: string;
  onboardedAt: string | null;
  displayName: string;
}

/**
 * The ids matching `rows`, ordered per `sort`. `index` supplies the facts that do not live on the
 * profile row itself (vouches received, STS); a row absent from `index` is treated as unrated/
 * unvouched, which is the correct, safe default for both.
 */
export function orderIdsForSort(
  rows: SortableRow[],
  index: Record<string, SkillIndexEntry>,
  sort: PlayerSort,
): string[] {
  const facts = rows.map((r) => {
    const entry = index[r.id];
    return {
      id: r.id,
      onboardedAt: r.onboardedAt,
      displayName: r.displayName,
      vouchesReceived: entry?.vouchesReceived ?? 0,
      sts: entry?.sts ?? 0,
    };
  });

  const byOnboardedDesc = (a: (typeof facts)[number], b: (typeof facts)[number]) =>
    (b.onboardedAt ?? '').localeCompare(a.onboardedAt ?? '');
  const byOnboardedAsc = (a: (typeof facts)[number], b: (typeof facts)[number]) =>
    (a.onboardedAt ?? '').localeCompare(b.onboardedAt ?? '');
  const byNameAsc = (a: (typeof facts)[number], b: (typeof facts)[number]) =>
    a.displayName.localeCompare(b.displayName);

  let sorted: typeof facts;
  switch (sort) {
    case 'newest':
      sorted = [...facts].sort(byOnboardedDesc);
      break;
    case 'oldest':
      sorted = [...facts].sort(byOnboardedAsc);
      break;
    case 'name':
      sorted = [...facts].sort(byNameAsc);
      break;
    case 'most_vouched':
      sorted = [...facts].sort((a, b) => b.vouchesReceived - a.vouchesReceived || byNameAsc(a, b));
      break;
    case 'sts_desc':
      sorted = [...facts].sort((a, b) => b.sts - a.sts || byNameAsc(a, b));
      break;
    case 'new_unvouched':
    default:
      // Unvouched (0 received) first, then most-recently-onboarded first within each group (D6).
      sorted = [...facts].sort((a, b) => {
        const aUnvouched = a.vouchesReceived === 0 ? 0 : 1;
        const bUnvouched = b.vouchesReceived === 0 ? 0 : 1;
        if (aUnvouched !== bUnvouched) return aUnvouched - bUnvouched;
        return byOnboardedDesc(a, b);
      });
  }
  return sorted.map((r) => r.id);
}

/** Validate a `sort` value, gating the staff-only option (D3: never public). */
export function resolveSort(raw: string | undefined, staff: boolean): PlayerSort {
  if (!raw || !(ALL_SORTS as string[]).includes(raw)) return DEFAULT_PLAYER_SORT;
  if (!staff && (STAFF_ONLY_SORTS as string[]).includes(raw)) return DEFAULT_PLAYER_SORT;
  return raw as PlayerSort;
}

// ----------------------------------------------------------------------------
// The filter set
// ----------------------------------------------------------------------------

export interface PlayerFilters {
  /** Free text over name / nickname / city. */
  q?: string;
  /** Normalised city key (see `normalizeCityKey`), not the raw spelling. */
  city?: string;
  sex?: 'male' | 'female';
  /**
   * Selected skill bands by ordinal. Empty/absent means any. Multi-select rather than a min/max
   * range: seven named discrete values read better as chips than as two ends of a slider (§2B).
   */
  skills?: number[];
  /**
   * Skill-Trust Score range, 0..5 (§2AG A2). Either end may be set alone - `stsMin` only means "at
   * least"; `stsMax` only means "at most". Absent on both sides means any. This is a FILTER, never a
   * sort (§8.4).
   */
  stsMin?: number;
  stsMax?: number;
  /** Vouches RECEIVED range (D4's counterpart), 0..50; 50 stands for "50+" (no upper bound). */
  vouchesMin?: number;
  vouchesMax?: number;
  /** Vouches GIVEN range (D4: "total number of vouches" = given), same 0..50/"50+" shape. */
  givenMin?: number;
  givenMax?: number;
  /** Club slug. */
  club?: string;
  identityVerified?: boolean;
  coach?: boolean;
  lookingForPartner?: boolean;
  openForSponsorship?: boolean;
  /** Onboarded within the admin `new_account_badge_days` window (D5, §2AG A3). */
  newOnly?: boolean;
  /** A tournament id (D7). Server-gated: applied only for staff or that tournament's organizers -
   *  never trust the client, so this field alone must never be treated as authorization. */
  tournament?: string;
  /** Public sort choice, default `new_unvouched` (D6). Not a filter: excluded from
   *  `activeFilterCount` / chips / `clearFilter`, and never part of "how many filters are applied". */
  sort?: PlayerSort;
  page?: number;
}

export const STS_MIN = 0;
export const STS_MAX = 5;
export const STS_STEP = 0.5;

/** Vouch-count range bounds shared by both the received and given sliders (§2AG A2). The top bucket
 *  is inclusive-and-up ("50+"), so a max at this value means "no upper bound". */
export const VOUCHES_MIN = 0;
export const VOUCHES_MAX = 50;
export const VOUCHES_STEP = 1;

/** The skill ordinals that exist, ascending. Order is LOCKED (§3.1). */
export const SKILL_ORDINALS: number[] = SKILL_BANDS.map((b) => b.ordinal);

const MIN_ORDINAL = Math.min(...SKILL_ORDINALS);
const MAX_ORDINAL = Math.max(...SKILL_ORDINALS);

export function skillLabel(ordinal: number): string {
  return SKILL_BANDS.find((b) => b.ordinal === ordinal)?.label ?? `Level ${ordinal}`;
}

export function skillBand(ordinal: number): SkillBand | undefined {
  return SKILL_BANDS.find((b) => b.ordinal === ordinal);
}

// ----------------------------------------------------------------------------
// Cities
// ----------------------------------------------------------------------------

/**
 * Collapse the many spellings of one city into a single key.
 *
 * The live directory holds `Zamboanga`, `Zamboanga City`, `Zamboanga city`, `zamboanga city`,
 * `zamboanga` and `City of Zamboanga` - one place typed six ways, because the city field is free
 * text with a datalist. A filter that offered six rows for one city would be worse than no filter,
 * so options are grouped by this key and matched with a case-insensitive contains.
 */
export function normalizeCityKey(city: string | null | undefined): string {
  if (!city) return '';
  let s = city.trim().toLowerCase().replace(/\s+/g, ' ');
  s = s.replace(/^city of /, '');
  s = s.replace(/ city$/, '');
  return s.trim();
}

export interface CityOption {
  /** Normalised key; this is what goes in the URL and into the `ilike` match. */
  key: string;
  /** The spelling to show: the most common one, ties broken alphabetically so it is deterministic. */
  label: string;
  count: number;
}

/** Group raw city strings into one option per real place, most populated first. */
export function buildCityOptions(cities: (string | null | undefined)[]): CityOption[] {
  const groups = new Map<string, { total: number; spellings: Map<string, number> }>();
  for (const raw of cities) {
    const key = normalizeCityKey(raw);
    if (!key) continue;
    const label = (raw ?? '').trim();
    const g = groups.get(key) ?? { total: 0, spellings: new Map<string, number>() };
    g.total += 1;
    g.spellings.set(label, (g.spellings.get(label) ?? 0) + 1);
    groups.set(key, g);
  }

  const options: CityOption[] = [];
  for (const [key, g] of groups) {
    const ranked = [...g.spellings.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    options.push({ key, label: ranked[0]?.[0] ?? key, count: g.total });
  }
  return options.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// ----------------------------------------------------------------------------
// Skill + STS + vouch-count matching
// ----------------------------------------------------------------------------

/**
 * A player's skill for the purpose of SEARCH, using the app-wide precedence: what the community says
 * if the community has said anything, otherwise their own self-rating (the same order
 * `player_fits_division()` and `evaluateSkillFloor` use).
 *
 * Null means genuinely unknown, and an unknown skill does NOT match a skill filter. That is the
 * opposite of the eligibility rule, deliberately: eligibility must never BLOCK somebody on a fact
 * nobody has established, while a search for "Novice players" should not return a player nobody has
 * ever rated. Different question, different default.
 */
export function effectiveSkillOrdinal(
  communitySkillLevel: number | null | undefined,
  selfRatedSkill: number | null | undefined,
): number | null {
  if (typeof communitySkillLevel === 'number') return communitySkillLevel;
  if (typeof selfRatedSkill === 'number') return selfRatedSkill;
  return null;
}

export function matchesSkill(ordinal: number | null, selected: number[] | undefined): boolean {
  if (!selected || selected.length === 0) return true;
  if (ordinal == null) return false;
  return selected.includes(ordinal);
}

/** @deprecated kept for callers still passing a single minimum; `idsMatchingIndexFilters` uses the
 *  two-sided `inRange` below instead. */
export function matchesSts(sts: number | null | undefined, minSts: number | undefined): boolean {
  if (!minSts || minSts <= 0) return true;
  return (sts ?? 0) >= minSts;
}

/** Two-sided inclusive range check; either bound may be absent ("no limit on that side"). */
export function inRange(value: number, min: number | undefined, max: number | undefined): boolean {
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

/** One directory player's filterable + orderable facts (§2AG A1/A2). */
export interface SkillIndexEntry {
  effectiveSkill: number | null;
  sts: number;
  /** Unique active vouchers RECEIVED (`unique_voucher_count`/evidence count), 0 if none. */
  vouchesReceived: number;
  /** Active vouches this player has GIVEN (D4), 0 if none. */
  vouchesGiven: number;
  onboardedAt: string | null;
  displayName: string;
}

/**
 * Whether the skill/STS-range/vouches-range filters are active at all, and if so, the ids matching
 * every active one (AND across kinds). Returns null when nothing in this group is active.
 *
 * Effective skill is a per-row fallback across two tables, which PostgREST cannot express, so the
 * set is computed here from a cached index and intersected before the page query runs. Sound while
 * the directory is small; past roughly a thousand players this belongs in a SQL view or an RPC
 * rather than an `in(...)` list - see the note in `queries.ts`.
 */
export function idsMatchingIndexFilters(
  index: Record<string, SkillIndexEntry>,
  f: Pick<
    PlayerFilters,
    'skills' | 'stsMin' | 'stsMax' | 'vouchesMin' | 'vouchesMax' | 'givenMin' | 'givenMax'
  >,
): string[] | null {
  const skillActive = Boolean(f.skills && f.skills.length > 0);
  const stsActive = Boolean(
    (f.stsMin && f.stsMin > STS_MIN) || (f.stsMax != null && f.stsMax < STS_MAX),
  );
  const vouchesActive = Boolean(
    (f.vouchesMin && f.vouchesMin > VOUCHES_MIN) ||
    (f.vouchesMax != null && f.vouchesMax < VOUCHES_MAX),
  );
  const givenActive = Boolean(
    (f.givenMin && f.givenMin > VOUCHES_MIN) || (f.givenMax != null && f.givenMax < VOUCHES_MAX),
  );
  if (!skillActive && !stsActive && !vouchesActive && !givenActive) return null;

  const out: string[] = [];
  for (const [id, entry] of Object.entries(index)) {
    if (skillActive && !matchesSkill(entry.effectiveSkill, f.skills)) continue;
    if (stsActive && !inRange(entry.sts, f.stsMin, f.stsMax)) continue;
    if (vouchesActive && !inRange(entry.vouchesReceived, f.vouchesMin, f.vouchesMax)) continue;
    if (givenActive && !inRange(entry.vouchesGiven, f.givenMin, f.givenMax)) continue;
    out.push(id);
  }
  return out;
}

/** Intersect two id restrictions, where null means "unrestricted". */
export function intersectIds(a: string[] | null, b: string[] | null): string[] | null {
  if (a === null) return b;
  if (b === null) return a;
  const set = new Set(b);
  return a.filter((id) => set.has(id));
}

// ----------------------------------------------------------------------------
// Parsing (URL -> filters)
// ----------------------------------------------------------------------------

export type SearchParamRecord = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  const t = typeof s === 'string' ? s.trim() : '';
  return t ? t : undefined;
}

function flag(v: string | string[] | undefined): boolean {
  return one(v) === '1';
}

/** Round to the STS step and clamp, so a hand-edited URL cannot produce 0.37 or 900. */
export function clampSts(value: number): number {
  if (!Number.isFinite(value)) return STS_MIN;
  const stepped = Math.round(value / STS_STEP) * STS_STEP;
  const clamped = Math.min(STS_MAX, Math.max(STS_MIN, stepped));
  return Number(clamped.toFixed(1));
}

/** Round to the vouch-count step and clamp to 0..50, so a hand-edited URL cannot produce -5 or 9000. */
export function clampVouches(value: number): number {
  if (!Number.isFinite(value)) return VOUCHES_MIN;
  const stepped = Math.round(value / VOUCHES_STEP) * VOUCHES_STEP;
  return Math.min(VOUCHES_MAX, Math.max(VOUCHES_MIN, stepped));
}

export function parseSkills(raw: string | undefined): number[] | undefined {
  if (!raw) return undefined;
  const parsed = raw
    .split(',')
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isInteger(n) && SKILL_ORDINALS.includes(n));
  const unique = Array.from(new Set(parsed)).sort((a, b) => a - b);
  return unique.length > 0 ? unique : undefined;
}

/** Parse one side of a range param, dropping it when it does not narrow the full span. */
function parseStsBound(raw: string | undefined, isMax: boolean): number | undefined {
  if (raw == null) return undefined;
  const v = clampSts(Number(raw));
  if (isMax) return v < STS_MAX ? v : undefined;
  return v > STS_MIN ? v : undefined;
}

function parseVouchesBound(raw: string | undefined, isMax: boolean): number | undefined {
  if (raw == null) return undefined;
  const v = clampVouches(Number(raw));
  if (isMax) return v < VOUCHES_MAX ? v : undefined;
  return v > VOUCHES_MIN ? v : undefined;
}

export interface ParsePlayerFiltersOptions {
  /** Whether the requesting viewer is staff - gates `sort=sts_desc` (D3). Default false. */
  staff?: boolean;
}

export function parsePlayerFilters(
  sp: SearchParamRecord,
  opts: ParsePlayerFiltersOptions = {},
): PlayerFilters {
  const sexRaw = one(sp.sex);
  const sex = sexRaw === 'male' || sexRaw === 'female' ? sexRaw : undefined;

  let skills = parseSkills(one(sp.skill));
  // Back-compatibility: `?minSkill=3` links were shared before §2B replaced the self-rated
  // "minimum skill" select with band chips. Map the old value onto "that band and up" so a
  // bookmarked or pasted search still returns players instead of silently ignoring the parameter.
  if (!skills) {
    const legacy = Number(one(sp.minSkill));
    if (Number.isInteger(legacy) && legacy >= MIN_ORDINAL && legacy <= MAX_ORDINAL) {
      skills = SKILL_ORDINALS.filter((o) => o >= legacy);
    }
  }

  // Back-compatibility: `?minSts=` was the single-thumb filter before §2AG A2 replaced it with a
  // dual-range. A bookmarked link still works, mapped onto the new lower bound.
  const legacyMinSts = one(sp.minSts);
  const stsMin = parseStsBound(one(sp.stsMin) ?? legacyMinSts, false);
  const stsMax = parseStsBound(one(sp.stsMax), true);

  const vouchesMin = parseVouchesBound(one(sp.vouchesMin), false);
  const vouchesMax = parseVouchesBound(one(sp.vouchesMax), true);
  const givenMin = parseVouchesBound(one(sp.givenMin), false);
  const givenMax = parseVouchesBound(one(sp.givenMax), true);

  const pageNum = Number(one(sp.page));
  const sort = resolveSort(one(sp.sort), opts.staff ?? false);

  return {
    q: one(sp.q),
    city: normalizeCityKey(one(sp.city)) || undefined,
    sex,
    skills,
    stsMin,
    stsMax,
    vouchesMin,
    vouchesMax,
    givenMin,
    givenMax,
    club: one(sp.club),
    identityVerified: flag(sp.identityVerified),
    coach: flag(sp.coach),
    lookingForPartner: flag(sp.lookingForPartner),
    openForSponsorship: flag(sp.openForSponsorship),
    newOnly: flag(sp.new),
    tournament: one(sp.tournament),
    sort,
    page: Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1,
  };
}

// ----------------------------------------------------------------------------
// Serialising (filters -> URL)
// ----------------------------------------------------------------------------

export interface QueryOptions {
  page?: number;
  /** Compact is the default directory view (§1S); only `detailed` is written to the URL. */
  compact?: boolean;
}

export function playerFiltersToQuery(f: PlayerFilters, opts: QueryOptions = {}): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.city) p.set('city', f.city);
  if (f.sex) p.set('sex', f.sex);
  if (f.skills && f.skills.length > 0) p.set('skill', f.skills.join(','));
  if (f.stsMin && f.stsMin > STS_MIN) p.set('stsMin', String(f.stsMin));
  if (f.stsMax != null && f.stsMax < STS_MAX) p.set('stsMax', String(f.stsMax));
  if (f.vouchesMin && f.vouchesMin > VOUCHES_MIN) p.set('vouchesMin', String(f.vouchesMin));
  if (f.vouchesMax != null && f.vouchesMax < VOUCHES_MAX) p.set('vouchesMax', String(f.vouchesMax));
  if (f.givenMin && f.givenMin > VOUCHES_MIN) p.set('givenMin', String(f.givenMin));
  if (f.givenMax != null && f.givenMax < VOUCHES_MAX) p.set('givenMax', String(f.givenMax));
  if (f.club) p.set('club', f.club);
  if (f.identityVerified) p.set('identityVerified', '1');
  if (f.coach) p.set('coach', '1');
  if (f.lookingForPartner) p.set('lookingForPartner', '1');
  if (f.openForSponsorship) p.set('openForSponsorship', '1');
  if (f.newOnly) p.set('new', '1');
  if (f.tournament) p.set('tournament', f.tournament);
  if (f.sort && f.sort !== DEFAULT_PLAYER_SORT) p.set('sort', f.sort);
  if (opts.compact === false) p.set('view', 'detailed');
  const page = opts.page ?? f.page ?? 1;
  if (page > 1) p.set('page', String(page));
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

// ----------------------------------------------------------------------------
// Describing what is on (the button count and the removable chips)
// ----------------------------------------------------------------------------

/**
 * How many filters are applied, for the badge on the Filters button.
 *
 * The free-text search is excluded on purpose: it is already visible in its own box, so counting it
 * would tell somebody they have "1 filter" they cannot find in the filter panel. `sort` is likewise
 * excluded - it is not a filter (§2AG A1).
 */
export function activeFilterCount(f: PlayerFilters): number {
  let n = 0;
  if (f.city) n += 1;
  if (f.sex) n += 1;
  if (f.skills && f.skills.length > 0) n += 1;
  if ((f.stsMin && f.stsMin > STS_MIN) || (f.stsMax != null && f.stsMax < STS_MAX)) n += 1;
  if (
    (f.vouchesMin && f.vouchesMin > VOUCHES_MIN) ||
    (f.vouchesMax != null && f.vouchesMax < VOUCHES_MAX)
  )
    n += 1;
  if ((f.givenMin && f.givenMin > VOUCHES_MIN) || (f.givenMax != null && f.givenMax < VOUCHES_MAX))
    n += 1;
  if (f.club) n += 1;
  if (f.identityVerified) n += 1;
  if (f.coach) n += 1;
  if (f.lookingForPartner) n += 1;
  if (f.openForSponsorship) n += 1;
  if (f.newOnly) n += 1;
  if (f.tournament) n += 1;
  return n;
}

export function hasAnyFilter(f: PlayerFilters): boolean {
  return Boolean(f.q) || activeFilterCount(f) > 0;
}

/** Which key a chip's X clears. `skills` clears the whole band selection; `sts`/`vouches`/`given`
 *  each clear both ends of their range at once. */
export type FilterChipKey =
  | 'q'
  | 'city'
  | 'sex'
  | 'skills'
  | 'sts'
  | 'vouches'
  | 'given'
  | 'club'
  | 'identityVerified'
  | 'coach'
  | 'lookingForPartner'
  | 'openForSponsorship'
  | 'newOnly'
  | 'tournament';

export interface FilterChip {
  key: FilterChipKey;
  label: string;
}

export interface ChipLookups {
  cityOptions?: CityOption[];
  clubOptions?: { slug: string; name: string }[];
  tournamentOptions?: { id: string; name: string }[];
}

const SEX_LABEL: Record<string, string> = { male: 'Men', female: 'Women' };

/** Render a two-sided range as "X - Y", "≥X" (bounded below only) or "≤Y" (bounded above only). */
function rangeLabel(prefix: string, min: number | undefined, max: number | undefined): string {
  if (min != null && max != null) return `${prefix} ${min}–${max}`;
  if (min != null) return `${prefix} ≥${min}`;
  return `${prefix} ≤${max}`;
}

function stsRangeLabel(min: number | undefined, max: number | undefined): string {
  const fmt = (v: number) => v.toFixed(1);
  if (min != null && max != null) return `STS ${fmt(min)}–${fmt(max)}`;
  if (min != null) return `STS ≥${fmt(min)}`;
  return `STS ≤${fmt(max as number)}`;
}

/**
 * The applied filters as removable chips. Every applied filter appears here, including the text
 * search: a filter you cannot see is a filter you cannot undo, and the old panel hid all of them
 * behind a closed disclosure (§2B). `sort` never appears - it is not a filter.
 */
export function describeActiveFilters(f: PlayerFilters, lookups: ChipLookups = {}): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.q) chips.push({ key: 'q', label: `"${f.q}"` });
  if (f.city) {
    const label = lookups.cityOptions?.find((c) => c.key === f.city)?.label ?? f.city;
    chips.push({ key: 'city', label });
  }
  if (f.sex) chips.push({ key: 'sex', label: SEX_LABEL[f.sex] ?? f.sex });
  if (f.skills && f.skills.length > 0) {
    const names = f.skills.map(skillLabel);
    chips.push({
      key: 'skills',
      label: names.length <= 2 ? names.join(', ') : `${names.length} skill levels`,
    });
  }
  if ((f.stsMin && f.stsMin > STS_MIN) || (f.stsMax != null && f.stsMax < STS_MAX)) {
    chips.push({ key: 'sts', label: stsRangeLabel(f.stsMin, f.stsMax) });
  }
  if (
    (f.vouchesMin && f.vouchesMin > VOUCHES_MIN) ||
    (f.vouchesMax != null && f.vouchesMax < VOUCHES_MAX)
  ) {
    chips.push({ key: 'vouches', label: rangeLabel('Vouches', f.vouchesMin, f.vouchesMax) });
  }
  if (
    (f.givenMin && f.givenMin > VOUCHES_MIN) ||
    (f.givenMax != null && f.givenMax < VOUCHES_MAX)
  ) {
    chips.push({ key: 'given', label: rangeLabel('Given', f.givenMin, f.givenMax) });
  }
  if (f.club) {
    const label = lookups.clubOptions?.find((c) => c.slug === f.club)?.name ?? f.club;
    chips.push({ key: 'club', label });
  }
  if (f.identityVerified) chips.push({ key: 'identityVerified', label: 'Identity verified' });
  if (f.coach) chips.push({ key: 'coach', label: 'Coach' });
  if (f.lookingForPartner) chips.push({ key: 'lookingForPartner', label: 'Looking for partner' });
  if (f.openForSponsorship) chips.push({ key: 'openForSponsorship', label: 'Open to sponsorship' });
  if (f.newOnly) chips.push({ key: 'newOnly', label: 'New this week' });
  if (f.tournament) {
    const label =
      lookups.tournamentOptions?.find((t) => t.id === f.tournament)?.name ?? 'Tournament';
    chips.push({ key: 'tournament', label });
  }
  return chips;
}

/** Remove one filter, returning a new set. Page resets, because page 4 of a wider result is not
 *  the page the viewer was looking at. */
export function clearFilter(f: PlayerFilters, key: FilterChipKey): PlayerFilters {
  const next: PlayerFilters = { ...f, page: 1 };
  switch (key) {
    case 'q':
      delete next.q;
      break;
    case 'city':
      delete next.city;
      break;
    case 'sex':
      delete next.sex;
      break;
    case 'skills':
      delete next.skills;
      break;
    case 'sts':
      delete next.stsMin;
      delete next.stsMax;
      break;
    case 'vouches':
      delete next.vouchesMin;
      delete next.vouchesMax;
      break;
    case 'given':
      delete next.givenMin;
      delete next.givenMax;
      break;
    case 'club':
      delete next.club;
      break;
    case 'tournament':
      delete next.tournament;
      break;
    default:
      next[key] = false;
  }
  return next;
}
