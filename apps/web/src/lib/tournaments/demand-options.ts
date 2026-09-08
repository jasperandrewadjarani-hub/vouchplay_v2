import {
  TOURNAMENT_DEMAND_DIVISIONS,
  demandKeyForDivision,
  legacyDemandAliases,
  mergeDemandCounts,
  type DemandDivisionShape,
} from '@vouchplay/core';
import { skillByOrdinal } from '@vouchplay/config';
import type { DivisionDTO } from './dto';

/**
 * The interest options a visitor picks from, and the labels the aggregate breakdown renders.
 *
 * Once an organizer configures real divisions the options follow those, so the demand they read maps
 * onto the event they are actually running. Only when no divisions exist do we fall back to the fixed
 * planning taxonomy. Both surfaces derive from this one function so the picker and the breakdown can
 * never drift apart.
 */
export interface DemandOption {
  key: string;
  label: string;
  /** Skill-band colour for the meter, or null to use the brand primary. */
  color: string | null;
}

const PUBLIC_DIVISION_STATUSES = (d: DivisionDTO) =>
  d.status !== 'draft' && d.status !== 'cancelled';

function taxonomyColor(key: string): string | null {
  const prefix = key.replace(/_(men|women|mixed)$/, '');
  const band = [0, 1, 2, 3, 4, 5, 6]
    .map((o) => skillByOrdinal(o))
    .find((b) => b && b.key === prefix);
  return band?.color ?? null;
}

function divisionColor(d: DivisionDTO): string | null {
  if (d.skillPolicy === 'band' && d.minimumSkill != null) {
    return skillByOrdinal(d.minimumSkill)?.color ?? null;
  }
  return null;
}

export function demandOptions(divisions: DivisionDTO[]): DemandOption[] {
  const real = divisions.filter(PUBLIC_DIVISION_STATUSES);
  if (real.length > 0) {
    return real
      .map((d) => {
        const key = demandKeyForDivision(d.id);
        return key ? { key, label: d.name, color: divisionColor(d) } : null;
      })
      .filter((o): o is DemandOption => o !== null);
  }
  return TOURNAMENT_DEMAND_DIVISIONS.map((d) => ({
    key: d.key,
    label: d.label,
    color: taxonomyColor(d.key),
  }));
}

/**
 * Fold interest recorded under the old planning taxonomy into the organizer's real divisions, so the
 * breakdown shows one row per division instead of "Novice Men's 6" beside "Men's Doubles Novice 0".
 *
 * The matching itself is pure and unit-tested in `@vouchplay/core`; this only supplies the shapes,
 * because skill-band keys live in `@vouchplay/config`. A legacy key with no single obvious division
 * keeps its own row rather than being guessed into one.
 */
export function mergeLegacyDemand(
  counts: Readonly<Record<string, number>>,
  divisions: DivisionDTO[],
): Record<string, number> {
  const shapes: DemandDivisionShape[] = divisions.filter(PUBLIC_DIVISION_STATUSES).flatMap((d) => {
    const key = demandKeyForDivision(d.id);
    if (!key) return [];
    // Only a single-band division can stand in for a single-band taxonomy entry.
    const singleBand =
      d.skillPolicy === 'band' && d.minimumSkill != null && d.maximumSkill === d.minimumSkill;
    return [
      {
        key,
        skillBandKey: singleBand ? (skillByOrdinal(d.minimumSkill as number)?.key ?? null) : null,
        sex: d.sexClassification,
        hasAgeFloor: d.minimumAge != null,
      },
    ];
  });
  if (shapes.length === 0) return { ...counts };
  return mergeDemandCounts(counts, legacyDemandAliases(Object.keys(counts), shapes));
}

/** Label for a stored key, including keys from divisions that have since been removed. */
export function demandLabel(key: string, options: DemandOption[]): string {
  const match = options.find((o) => o.key === key);
  if (match) return match.label;
  const taxonomy = TOURNAMENT_DEMAND_DIVISIONS.find((d) => d.key === key);
  return taxonomy?.label ?? 'Other';
}
