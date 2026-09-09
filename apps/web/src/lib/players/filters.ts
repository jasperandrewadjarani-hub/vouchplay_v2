/**
 * Player directory filters (master_plan §2B) - ALL of the parsing, normalising, matching and
 * counting, as pure functions.
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
  /** Minimum Skill-Trust Score, 0..5. Zero means any - it is a filter, never a sort (§8.4). */
  minSts?: number;
  /** Club slug. */
  club?: string;
  identityVerified?: boolean;
  coach?: boolean;
  lookingForPartner?: boolean;
  openForSponsorship?: boolean;
  page?: number;
}

export const STS_MIN = 0;
export const STS_MAX = 5;
export const STS_STEP = 0.5;

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
// Skill + STS matching
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

export function matchesSts(sts: number | null | undefined, minSts: number | undefined): boolean {
  if (!minSts || minSts <= 0) return true;
  return (sts ?? 0) >= minSts;
}

/** One directory player's filterable skill facts. */
export interface SkillIndexEntry {
  effectiveSkill: number | null;
  sts: number;
}

/**
 * The ids matching the skill / STS filters, or null when neither is active.
 *
 * Effective skill is a per-row fallback across two tables, which PostgREST cannot express, so the
 * set is computed here from a cached index and intersected before the page query runs. Sound while
 * the directory is small (163 profiles today); past roughly a thousand players this belongs in a
 * SQL view or an RPC rather than an `in(...)` list - see the note in `queries.ts`.
 */
export function idsMatchingSkillFilters(
  index: Record<string, SkillIndexEntry>,
  f: Pick<PlayerFilters, 'skills' | 'minSts'>,
): string[] | null {
  const skillActive = Boolean(f.skills && f.skills.length > 0);
  const stsActive = Boolean(f.minSts && f.minSts > 0);
  if (!skillActive && !stsActive) return null;

  const out: string[] = [];
  for (const [id, entry] of Object.entries(index)) {
    if (skillActive && !matchesSkill(entry.effectiveSkill, f.skills)) continue;
    if (stsActive && !matchesSts(entry.sts, f.minSts)) continue;
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

export function parseSkills(raw: string | undefined): number[] | undefined {
  if (!raw) return undefined;
  const parsed = raw
    .split(',')
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isInteger(n) && SKILL_ORDINALS.includes(n));
  const unique = Array.from(new Set(parsed)).sort((a, b) => a - b);
  return unique.length > 0 ? unique : undefined;
}

export function parsePlayerFilters(sp: SearchParamRecord): PlayerFilters {
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

  const stsRaw = one(sp.minSts);
  const minStsNum = stsRaw != null ? clampSts(Number(stsRaw)) : 0;

  const pageNum = Number(one(sp.page));

  return {
    q: one(sp.q),
    city: normalizeCityKey(one(sp.city)) || undefined,
    sex,
    skills,
    minSts: minStsNum > 0 ? minStsNum : undefined,
    club: one(sp.club),
    identityVerified: flag(sp.identityVerified),
    coach: flag(sp.coach),
    lookingForPartner: flag(sp.lookingForPartner),
    openForSponsorship: flag(sp.openForSponsorship),
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
  if (f.minSts && f.minSts > 0) p.set('minSts', String(f.minSts));
  if (f.club) p.set('club', f.club);
  if (f.identityVerified) p.set('identityVerified', '1');
  if (f.coach) p.set('coach', '1');
  if (f.lookingForPartner) p.set('lookingForPartner', '1');
  if (f.openForSponsorship) p.set('openForSponsorship', '1');
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
 * would tell somebody they have "1 filter" they cannot find in the filter panel.
 */
export function activeFilterCount(f: PlayerFilters): number {
  let n = 0;
  if (f.city) n += 1;
  if (f.sex) n += 1;
  if (f.skills && f.skills.length > 0) n += 1;
  if (f.minSts && f.minSts > 0) n += 1;
  if (f.club) n += 1;
  if (f.identityVerified) n += 1;
  if (f.coach) n += 1;
  if (f.lookingForPartner) n += 1;
  if (f.openForSponsorship) n += 1;
  return n;
}

export function hasAnyFilter(f: PlayerFilters): boolean {
  return Boolean(f.q) || activeFilterCount(f) > 0;
}

/** Which key a chip's X clears. `skills` clears the whole band selection. */
export type FilterChipKey =
  | 'q'
  | 'city'
  | 'sex'
  | 'skills'
  | 'minSts'
  | 'club'
  | 'identityVerified'
  | 'coach'
  | 'lookingForPartner'
  | 'openForSponsorship';

export interface FilterChip {
  key: FilterChipKey;
  label: string;
}

export interface ChipLookups {
  cityOptions?: CityOption[];
  clubOptions?: { slug: string; name: string }[];
}

const SEX_LABEL: Record<string, string> = { male: 'Men', female: 'Women' };

/**
 * The applied filters as removable chips. Every applied filter appears here, including the text
 * search: a filter you cannot see is a filter you cannot undo, and the old panel hid all of them
 * behind a closed disclosure (§2B).
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
  if (f.minSts && f.minSts > 0) chips.push({ key: 'minSts', label: `STS ${f.minSts.toFixed(1)}+` });
  if (f.club) {
    const label = lookups.clubOptions?.find((c) => c.slug === f.club)?.name ?? f.club;
    chips.push({ key: 'club', label });
  }
  if (f.identityVerified) chips.push({ key: 'identityVerified', label: 'Identity verified' });
  if (f.coach) chips.push({ key: 'coach', label: 'Coach' });
  if (f.lookingForPartner) chips.push({ key: 'lookingForPartner', label: 'Looking for partner' });
  if (f.openForSponsorship) chips.push({ key: 'openForSponsorship', label: 'Open to sponsorship' });
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
    case 'minSts':
      delete next.minSts;
      break;
    case 'club':
      delete next.club;
      break;
    default:
      next[key] = false;
  }
  return next;
}
