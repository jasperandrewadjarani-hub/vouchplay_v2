/**
 * Versioned, framework-free planning taxonomy for tournament demand. It is intentionally separate
 * from a tournament's configured divisions and never participates in eligibility or scoring.
 */
const SKILLS = [
  ['beginner', 'Beginner'],
  ['novice', 'Novice'],
  ['low_intermediate', 'Low Intermediate'],
  ['high_intermediate', 'High Intermediate'],
  ['advanced', 'Advanced'],
] as const;
const CATEGORIES = [
  ['men', "Men's"],
  ['women', "Women's"],
  ['mixed', 'Mixed'],
] as const;

export interface TournamentDemandDivision {
  key: string;
  label: string;
}

export const TOURNAMENT_DEMAND_DIVISIONS: readonly TournamentDemandDivision[] = [
  ...SKILLS.flatMap(([skillKey, skillLabel]) =>
    CATEGORIES.map(([categoryKey, categoryLabel]) => ({
      key: `${skillKey}_${categoryKey}`,
      label: `${skillLabel} ${categoryLabel}`,
    })),
  ),
  ...CATEGORIES.map(([categoryKey, categoryLabel]) => ({
    key: `age_50_plus_${categoryKey}`,
    label: `50+ ${categoryLabel}`,
  })),
];

const KEYS = new Set(TOURNAMENT_DEMAND_DIVISIONS.map((division) => division.key));

export function isTournamentDemandDivision(value: unknown): value is string {
  return typeof value === 'string' && KEYS.has(value);
}

export function demandDivisionLabel(key: string): string | null {
  return TOURNAMENT_DEMAND_DIVISIONS.find((division) => division.key === key)?.label ?? null;
}
