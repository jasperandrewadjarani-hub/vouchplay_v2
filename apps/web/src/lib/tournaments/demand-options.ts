import { TOURNAMENT_DEMAND_DIVISIONS, demandKeyForDivision } from '@vouchplay/core';
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

/** Label for a stored key, including keys from divisions that have since been removed. */
export function demandLabel(key: string, options: DemandOption[]): string {
  const match = options.find((o) => o.key === key);
  if (match) return match.label;
  const taxonomy = TOURNAMENT_DEMAND_DIVISIONS.find((d) => d.key === key);
  return taxonomy?.label ?? 'Other';
}
