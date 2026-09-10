import type { SkillAlgorithmVersion } from '@vouchplay/config';

/**
 * The public skill-version accessor (master_plan §2AF rollout step 2): every public reader of
 * Community Skill Level / STS / Skill Verified goes through `pickActiveSkill` so the
 * `skill_algorithm_active_version` Admin setting is the ONE place that decides which numbers a viewer
 * sees, with no per-reader drift.
 *
 * `pickActiveSkill` is a PURE function (no I/O, no settings reads) so it is exhaustively unit-tested
 * here; `selectSkillProfiles` is the one shared, fail-open Supabase read that feeds it (§2R pattern:
 * until migration 0034 is applied, or on any other undefined-column error, a V2 read falls back to the
 * V1 columns and the caller is told the version it actually got).
 */

/** `player_skill_profiles` row shape this module reads. V2 columns are optional because callers
 *  select them only when routing to STS_V2, and because migration 0034 may not be applied yet. */
export interface SkillProfileRow {
  community_skill_level: number | null;
  sts: number | string | null;
  unique_voucher_count: number | null;
  skill_verified: boolean | null;
  /** Present only when the version-routed select included the six V2 columns (STS_V2, §2AF E2). */
  community_skill_level_v2?: number | null;
  sts_v2?: number | string | null;
  n_eff_v2?: number | null;
  weight_sum_v2?: number | null;
  /** Written by `recompute.ts`; carries `skillVerified` (V2) alongside the raw blend components,
   *  since migration 0034 does not add a separate `skill_verified_v2` column (§2AF E2). */
  components_v2?: { skillVerified?: boolean } | null;
  calculated_v2_at?: string | null;
}

export interface ActiveSkill {
  communitySkillLevel: number | null;
  sts: number | null;
  /** V1: `unique_voucher_count`. V2: `round(n_eff_v2)` - the honest "N independent players" number
   *  the profile page shows (§2AF "Workflow and UX"). */
  evidenceCount: number | null;
  skillVerified: boolean;
  /** The version actually used - STS_V1 unless `version` was 'STS_V2' AND the row carried computed
   *  V2 values (never a bare request for V2 that silently produced V2-shaped nulls). */
  version: SkillAlgorithmVersion;
}

const EMPTY_ACTIVE_SKILL: ActiveSkill = {
  communitySkillLevel: null,
  sts: null,
  evidenceCount: null,
  skillVerified: false,
  version: 'STS_V1',
};

function toNumberOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function v1Skill(row: SkillProfileRow): ActiveSkill {
  return {
    communitySkillLevel: row.community_skill_level ?? null,
    sts: toNumberOrNull(row.sts),
    evidenceCount: row.unique_voucher_count ?? null,
    skillVerified: row.skill_verified === true,
    version: 'STS_V1',
  };
}

/**
 * Picks the skill numbers a viewer should see, honouring `skill_algorithm_active_version`
 * (master_plan §2AF rollout step 2).
 *
 * - `version === 'STS_V1'` (default): unchanged V1 behaviour, byte-identical to before STS_V2 existed.
 * - `version === 'STS_V2'`: uses the V2 columns ONLY when they are actually present (not null/undefined
 *   on at least one of the three headline fields) - i.e. migration 0034 is applied AND this player has
 *   been through a V2 recompute. Otherwise it falls back to V1 (§2AF rollout: "until Jasper applies
 *   0034 the V2 write no-ops and nothing breaks" - the read side mirrors that same fail-open rule).
 */
export function pickActiveSkill(
  row: SkillProfileRow | null,
  version: SkillAlgorithmVersion,
): ActiveSkill {
  if (!row) return EMPTY_ACTIVE_SKILL;

  if (version === 'STS_V2') {
    const hasV2 =
      row.community_skill_level_v2 != null || row.sts_v2 != null || row.n_eff_v2 != null;
    if (hasV2) {
      const nEff = toNumberOrNull(row.n_eff_v2);
      return {
        communitySkillLevel: row.community_skill_level_v2 ?? null,
        sts: toNumberOrNull(row.sts_v2),
        evidenceCount: nEff != null ? Math.round(nEff) : null,
        skillVerified: row.components_v2?.skillVerified === true,
        version: 'STS_V2',
      };
    }
  }

  return v1Skill(row);
}

/** Column names read from `player_skill_profiles`, joined for a `.select()` string. */
const V1_SKILL_COLUMNS = [
  'community_skill_level',
  'sts',
  'unique_voucher_count',
  'skill_verified',
] as const;

const V2_SKILL_COLUMNS = [
  'community_skill_level_v2',
  'sts_v2',
  'n_eff_v2',
  'weight_sum_v2',
  'components_v2',
  'calculated_v2_at',
] as const;

/**
 * The exact `player_skill_profiles` columns to select for a given active version - the V1 list alone,
 * or the V1 list plus the six V2 columns (§2AF E2). Callers append their own key column (e.g.
 * `player_id`) and any non-versioned extras (e.g. `distribution`) with a comma.
 */
export function skillProfileColumns(version: SkillAlgorithmVersion): string {
  const cols: readonly string[] =
    version === 'STS_V2' ? [...V1_SKILL_COLUMNS, ...V2_SKILL_COLUMNS] : V1_SKILL_COLUMNS;
  return cols.join(', ');
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

/**
 * Structural, NOT generic over the row type: Supabase's client falls back to an opaque
 * `GenericStringError[]` data type whenever `.select()` is called with a runtime (non-literal) column
 * string - which every version-routed query here does, since the column list depends on which version
 * is active. Keeping this shape untyped-over-`data` lets a plain `svc.from(...).select(columns)...`
 * satisfy `runQuery` with NO cast at any call site; `selectSkillProfiles` does the one, single,
 * intentional cast when it reads `.data` (same convention every other query file in this codebase
 * uses for untyped Supabase rows).
 */
export interface PostgrestLikeResponse {
  data: unknown[] | null;
  error: PostgrestLikeError | null;
}

export interface SkillProfileSelectResult<T> {
  rows: T[];
  /** The version actually served - `STS_V1` when the caller asked for V2 but the columns do not
   *  exist yet (undefined_column, migration 0034 not applied). */
  version: SkillAlgorithmVersion;
}

/**
 * The ONE shared, fail-open `player_skill_profiles` read (master_plan §2AF E3: "implement this once
 * ... and reuse"). `runQuery(columns)` should apply whatever `.eq()`/`.in()`/`.order()`/`.limit()` the
 * caller needs on top of `.from('player_skill_profiles').select(columns)` and execute it - this
 * function only decides WHICH columns to ask for and whether to retry.
 *
 * Never lets a missing V2 column (Postgres 42703 undefined_column - migration 0034 not applied) reach
 * the caller as an error: it retries once with the V1 column list and reports back the version it
 * actually got, so every caller downstream (readers AND `pickActiveSkill`) stays correct without its
 * own try/catch (§2R "fail open").
 */
export async function selectSkillProfiles<T = SkillProfileRow>(
  version: SkillAlgorithmVersion,
  runQuery: (columns: string) => PromiseLike<PostgrestLikeResponse>,
  extraColumns = '',
): Promise<SkillProfileSelectResult<T>> {
  const columnsFor = (v: SkillAlgorithmVersion) => {
    const base = skillProfileColumns(v);
    return extraColumns ? `${base}, ${extraColumns}` : base;
  };

  const first = await runQuery(columnsFor(version));
  if (first.error) {
    if (version === 'STS_V2' && first.error.code === '42703') {
      // The V2 columns do not exist yet (migration 0034 not applied) - fail open to V1, §2R.
      const fallback = await runQuery(columnsFor('STS_V1'));
      if (fallback.error) return { rows: [], version: 'STS_V1' };
      return { rows: (fallback.data as T[] | null) ?? [], version: 'STS_V1' };
    }
    return { rows: [], version };
  }
  return { rows: (first.data as T[] | null) ?? [], version };
}
