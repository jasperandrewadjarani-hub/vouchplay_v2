/**
 * Folding legacy planning-taxonomy demand keys onto an organizer's real divisions.
 *
 * Interest was first collected against the fixed planning taxonomy (`novice_men`, `advanced_mixed`,
 * `age_50_plus_women`, ...). Once an organizer configures real divisions, new interest is recorded
 * against `div_<uuid>` keys instead. Both then exist for the same tournament, and the breakdown showed
 * them as separate rows - "Novice Men's 6" sitting next to "Men's Doubles Novice 0" - which reads as
 * two different things when it is one.
 *
 * This resolves a legacy key to the division that means the same thing, so the counts add up. It is
 * pure and framework-free; the caller supplies the division shapes because skill-band keys live in
 * `@vouchplay/config`.
 *
 * Deliberately conservative - an alias is only produced when EXACTLY ONE division matches. An
 * ambiguous or absent match leaves the legacy key standing on its own row, so a recorded interest is
 * never silently moved into a division the organizer did not clearly mean. Nothing here touches
 * eligibility, registration, or scoring: demand is a planning signal only.
 */

export interface DemandDivisionShape {
  /** The division's own demand key (`div_` + uuid without hyphens). */
  key: string;
  /**
   * The division's single skill band key (e.g. `low_intermediate`), or null when the division spans a
   * range or is open. Only a single-band division can stand in for a single-band taxonomy entry.
   */
  skillBandKey: string | null;
  /** `men` | `women` | `mixed` | `genderless`. */
  sex: string;
  /** True when the division has a minimum age, i.e. it is the event's age-restricted division. */
  hasAgeFloor: boolean;
}

const CATEGORIES = ['men', 'women', 'mixed'] as const;
const AGE_PREFIX = 'age_';

/** Split `low_intermediate_men` into `['low_intermediate', 'men']`. Null when it is not that shape. */
function splitTaxonomyKey(key: string): [string, string] | null {
  for (const category of CATEGORIES) {
    const suffix = `_${category}`;
    if (key.endsWith(suffix)) return [key.slice(0, -suffix.length), category];
  }
  return null;
}

function onlyMatch(divisions: DemandDivisionShape[]): string | null {
  return divisions.length === 1 ? divisions[0]!.key : null;
}

/**
 * Map legacy taxonomy keys onto division keys: `{ novice_men: 'div_abc...' }`.
 *
 * Age keys (`age_50_plus_men`) match on the age floor and category rather than the exact age, because
 * the taxonomy offers one fixed age bracket while an organizer picks their own (a 45+ division here).
 * The signal being merged is "these people want the men's age division", which is what a planner needs.
 */
export function legacyDemandAliases(
  legacyKeys: readonly string[],
  divisions: readonly DemandDivisionShape[],
): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const legacyKey of legacyKeys) {
    const parts = splitTaxonomyKey(legacyKey);
    if (!parts) continue;
    const [prefix, category] = parts;
    const target = prefix.startsWith(AGE_PREFIX)
      ? onlyMatch(divisions.filter((d) => d.hasAgeFloor && d.sex === category))
      : onlyMatch(
          divisions.filter(
            (d) => !d.hasAgeFloor && d.sex === category && d.skillBandKey === prefix,
          ),
        );
    if (target) aliases[legacyKey] = target;
  }
  return aliases;
}

/**
 * Apply the aliases to a `{ key: count }` breakdown, summing merged rows and dropping the legacy keys
 * that were folded in. Keys with no alias pass through untouched.
 */
export function mergeDemandCounts(
  counts: Readonly<Record<string, number>>,
  aliases: Readonly<Record<string, string>>,
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const [key, count] of Object.entries(counts)) {
    const target = aliases[key] ?? key;
    merged[target] = (merged[target] ?? 0) + count;
  }
  return merged;
}
