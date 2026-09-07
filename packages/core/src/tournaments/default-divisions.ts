import { SKILL_BANDS } from '@vouchplay/config';

const STARTER_SKILL_KEYS = [
  'beginner',
  'novice',
  'low_intermediate',
  'high_intermediate',
  'advanced',
] as const;

const STARTER_SEX_CLASSIFICATIONS = ['men', 'women', 'mixed'] as const;

export interface DefaultDivisionPresetRow {
  name_override: null;
  skill_policy: 'band';
  minimum_skill: number;
  maximum_skill: number;
  format: 'doubles';
  sex_classification: (typeof STARTER_SEX_CLASSIFICATIONS)[number];
  minimum_age: null;
  maximum_age: null;
  team_size: 2;
  capacity_teams: number;
  fee_amount: 0;
  currency: 'PHP';
  skill_verified_required: false;
  minimum_sts: null;
  organizer_approval_required: false;
  status: 'draft';
}

/**
 * Build the canonical starter divisions for a newly created tournament (§18.6). Operational
 * capacity is injected by the caller from system_settings; this pure function owns only the
 * versioned preset shape and ordering.
 */
export function buildDefaultDivisionPreset(capacityTeams: number): DefaultDivisionPresetRow[] {
  if (!Number.isInteger(capacityTeams) || capacityTeams < 1) {
    throw new Error('Default division capacity must be a positive whole number.');
  }

  return STARTER_SKILL_KEYS.flatMap((key) => {
    const band = SKILL_BANDS.find((candidate) => candidate.key === key);
    if (!band) throw new Error(`Missing canonical skill band: ${key}`);

    return STARTER_SEX_CLASSIFICATIONS.map((sexClassification) => ({
      name_override: null,
      skill_policy: 'band' as const,
      minimum_skill: band.ordinal,
      maximum_skill: band.ordinal,
      format: 'doubles' as const,
      sex_classification: sexClassification,
      minimum_age: null,
      maximum_age: null,
      team_size: 2 as const,
      capacity_teams: capacityTeams,
      fee_amount: 0 as const,
      currency: 'PHP' as const,
      skill_verified_required: false as const,
      minimum_sts: null,
      organizer_approval_required: false as const,
      status: 'draft' as const,
    }));
  });
}
