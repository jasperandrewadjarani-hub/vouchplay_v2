import { describe, expect, it } from 'vitest';
import {
  TOURNAMENT_DEMAND_DIVISIONS,
  demandDivisionLabel,
  isTournamentDemandDivision,
} from './demand-interest';

describe('tournament demand taxonomy', () => {
  it('has the complete planning-only standard set in deterministic order', () => {
    expect(TOURNAMENT_DEMAND_DIVISIONS).toHaveLength(18);
    expect(TOURNAMENT_DEMAND_DIVISIONS[0]).toEqual({
      key: 'beginner_men',
      label: "Beginner Men's",
    });
    expect(TOURNAMENT_DEMAND_DIVISIONS.at(-1)).toEqual({
      key: 'age_50_plus_mixed',
      label: '50+ Mixed',
    });
  });

  it('accepts only canonical keys and resolves labels without inventing divisions', () => {
    expect(isTournamentDemandDivision('advanced_women')).toBe(true);
    expect(isTournamentDemandDivision('open_pro')).toBe(false);
    expect(demandDivisionLabel('age_50_plus_men')).toBe("50+ Men's");
    expect(demandDivisionLabel('unknown')).toBeNull();
  });
});
