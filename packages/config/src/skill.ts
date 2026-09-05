/**
 * Canonical skill bands (handover §3.1). Ordinal values are LOCKED and must not be reordered.
 * `Open` and `Age-Defined` are eligibility concepts, NOT skill levels, and are intentionally absent.
 */

export const SKILL_BANDS = [
  { ordinal: 0, key: 'newbie', label: 'Newbie' },
  { ordinal: 1, key: 'beginner', label: 'Beginner' },
  { ordinal: 2, key: 'novice', label: 'Novice' },
  { ordinal: 3, key: 'low_intermediate', label: 'Low Intermediate' },
  { ordinal: 4, key: 'high_intermediate', label: 'High Intermediate' },
  { ordinal: 5, key: 'advanced', label: 'Advanced' },
  { ordinal: 6, key: 'pro', label: 'Pro' },
] as const;

export type SkillBand = (typeof SKILL_BANDS)[number];
export type SkillKey = SkillBand['key'];
export type SkillOrdinal = SkillBand['ordinal'];

/** Lowest ordinal that tournament divisions default to (handover §3.1: start at Beginner). */
export const DEFAULT_DIVISION_MIN_ORDINAL: SkillOrdinal = 1;

export function skillByOrdinal(ordinal: number): SkillBand | undefined {
  return SKILL_BANDS.find((b) => b.ordinal === ordinal);
}

export function skillByKey(key: SkillKey): SkillBand | undefined {
  return SKILL_BANDS.find((b) => b.key === key);
}

/**
 * Verification is two independent concepts (handover §3.2, §72). Never merge these, and never let
 * Skill Verified feed back into vouch weight.
 */
export type SkillVerificationType = 'none' | 'community' | 'admin_override';
