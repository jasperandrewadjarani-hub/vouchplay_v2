import { describe, expect, it } from 'vitest';
import { buildDefaultDivisionPreset } from './default-divisions';

describe('buildDefaultDivisionPreset', () => {
  it('creates five skill bands across men, women, and mixed doubles', () => {
    const rows = buildDefaultDivisionPreset(20);

    expect(rows).toHaveLength(15);
    expect(rows.map((row) => row.minimum_skill)).toEqual([
      1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5,
    ]);
    expect(rows.slice(0, 3).map((row) => row.sex_classification)).toEqual([
      'men',
      'women',
      'mixed',
    ]);
    expect(rows.every((row) => row.minimum_skill === row.maximum_skill)).toBe(true);
    expect(rows.every((row) => row.format === 'doubles' && row.team_size === 2)).toBe(true);
    expect(rows.every((row) => row.capacity_teams === 20 && row.status === 'draft')).toBe(true);
  });

  it('rejects invalid operational capacity values', () => {
    expect(() => buildDefaultDivisionPreset(0)).toThrow(/positive whole number/i);
    expect(() => buildDefaultDivisionPreset(2.5)).toThrow(/positive whole number/i);
  });
});
