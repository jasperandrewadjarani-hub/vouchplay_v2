import { describe, expect, it } from 'vitest';
import {
  pickActiveSkill,
  skillProfileColumns,
  selectSkillProfiles,
  type SkillProfileRow,
} from './active-skill';

const V1_ONLY: SkillProfileRow = {
  community_skill_level: 3,
  sts: 4.2,
  unique_voucher_count: 6,
  skill_verified: true,
};

const V2_COMPUTED: SkillProfileRow = {
  ...V1_ONLY,
  community_skill_level: 2, // V1 stayed inflated; V2 shrank toward the self-rating
  community_skill_level_v2: 1,
  sts_v2: 1.5,
  n_eff_v2: 2.6,
  weight_sum_v2: 2.6,
  components_v2: { skillVerified: false },
  calculated_v2_at: '2026-09-11T00:00:00.000Z',
};

describe('pickActiveSkill', () => {
  it('returns the empty snapshot for a player with no skill profile row', () => {
    expect(pickActiveSkill(null, 'STS_V1')).toEqual({
      communitySkillLevel: null,
      sts: null,
      evidenceCount: null,
      skillVerified: false,
      version: 'STS_V1',
    });
    expect(pickActiveSkill(null, 'STS_V2')).toEqual({
      communitySkillLevel: null,
      sts: null,
      evidenceCount: null,
      skillVerified: false,
      version: 'STS_V1',
    });
  });

  it('reads V1 columns byte-identically when the active version is STS_V1', () => {
    const result = pickActiveSkill(V1_ONLY, 'STS_V1');
    expect(result).toEqual({
      communitySkillLevel: 3,
      sts: 4.2,
      evidenceCount: 6,
      skillVerified: true,
      version: 'STS_V1',
    });
  });

  it('falls back to V1 when STS_V2 is requested but the row has no V2 values (0034 not applied yet, or this player not yet recomputed)', () => {
    const result = pickActiveSkill(V1_ONLY, 'STS_V2');
    expect(result).toEqual({
      communitySkillLevel: 3,
      sts: 4.2,
      evidenceCount: 6,
      skillVerified: true,
      version: 'STS_V1',
    });
  });

  it('falls back to V1 when the V2 columns exist but are all still null (row selected, not yet computed)', () => {
    const row: SkillProfileRow = {
      ...V1_ONLY,
      community_skill_level_v2: null,
      sts_v2: null,
      n_eff_v2: null,
      weight_sum_v2: null,
      components_v2: null,
      calculated_v2_at: null,
    };
    expect(pickActiveSkill(row, 'STS_V2').version).toBe('STS_V1');
  });

  it('uses V2 values when present, rounding n_eff_v2 into evidenceCount', () => {
    const result = pickActiveSkill(V2_COMPUTED, 'STS_V2');
    expect(result).toEqual({
      communitySkillLevel: 1,
      sts: 1.5,
      evidenceCount: 3, // round(2.6)
      skillVerified: false,
      version: 'STS_V2',
    });
  });

  it('reads V2 skillVerified from components_v2, defaulting to false when absent', () => {
    const row: SkillProfileRow = { ...V2_COMPUTED, components_v2: null };
    expect(pickActiveSkill(row, 'STS_V2').skillVerified).toBe(false);
    const verified: SkillProfileRow = {
      ...V2_COMPUTED,
      components_v2: { skillVerified: true },
    };
    expect(pickActiveSkill(verified, 'STS_V2').skillVerified).toBe(true);
  });

  it('coerces a string sts value (as Postgres numeric often arrives) to a number', () => {
    const row: SkillProfileRow = { ...V1_ONLY, sts: '3.5' as unknown as number };
    expect(pickActiveSkill(row, 'STS_V1').sts).toBe(3.5);
  });
});

describe('skillProfileColumns', () => {
  it('returns only the V1 columns for STS_V1', () => {
    const cols = skillProfileColumns('STS_V1');
    expect(cols).toBe('community_skill_level, sts, unique_voucher_count, skill_verified');
    expect(cols).not.toContain('_v2');
  });

  it('returns the V1 columns plus all six V2 columns for STS_V2', () => {
    const cols = skillProfileColumns('STS_V2');
    for (const c of [
      'community_skill_level',
      'sts',
      'unique_voucher_count',
      'skill_verified',
      'community_skill_level_v2',
      'sts_v2',
      'n_eff_v2',
      'weight_sum_v2',
      'components_v2',
      'calculated_v2_at',
    ]) {
      expect(cols).toContain(c);
    }
  });
});

describe('selectSkillProfiles', () => {
  it('passes the V1 column list straight through on success', async () => {
    const seen: string[] = [];
    const result = await selectSkillProfiles('STS_V1', async (columns) => {
      seen.push(columns);
      return { data: [{ ok: true }], error: null };
    });
    expect(seen).toEqual([skillProfileColumns('STS_V1')]);
    expect(result).toEqual({ rows: [{ ok: true }], version: 'STS_V1' });
  });

  it('falls back to V1 columns on a 42703 undefined_column error while requesting V2', async () => {
    const seen: string[] = [];
    const result = await selectSkillProfiles('STS_V2', async (columns) => {
      seen.push(columns);
      if (columns.includes('_v2')) {
        return { data: null, error: { code: '42703', message: 'column does not exist' } };
      }
      return { data: [{ ok: true }], error: null };
    });
    expect(seen).toEqual([skillProfileColumns('STS_V2'), skillProfileColumns('STS_V1')]);
    expect(result).toEqual({ rows: [{ ok: true }], version: 'STS_V1' });
  });

  it('does not retry a non-42703 error, and returns an empty result rather than throwing', async () => {
    const calls: string[] = [];
    const result = await selectSkillProfiles('STS_V2', async (columns) => {
      calls.push(columns);
      return { data: null, error: { code: '42P01', message: 'relation missing' } };
    });
    expect(calls).toHaveLength(1);
    expect(result).toEqual({ rows: [], version: 'STS_V2' });
  });

  it('appends extra non-versioned columns (e.g. distribution) to both the primary and fallback query', async () => {
    const seen: string[] = [];
    await selectSkillProfiles(
      'STS_V2',
      async (columns) => {
        seen.push(columns);
        return columns.includes('_v2')
          ? { data: null, error: { code: '42703' } }
          : { data: [], error: null };
      },
      'player_id, distribution',
    );
    expect(seen[0]).toContain('player_id, distribution');
    expect(seen[1]).toContain('player_id, distribution');
    expect(seen[1]).not.toContain('_v2');
  });
});
