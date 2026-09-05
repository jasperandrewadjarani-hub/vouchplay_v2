/**
 * Canonical skill bands (handover §3.1). Ordinal values are LOCKED and must not be reordered.
 * `Open` and `Age-Defined` are eligibility concepts, NOT skill levels, and are intentionally absent.
 */

export const SKILL_BANDS = [
  { ordinal: 0, key: 'newbie', label: 'Newbie', color: '#94a3b8', blurb: 'Just picked up a paddle.' },
  { ordinal: 1, key: 'beginner', label: 'Beginner', color: '#22c55e', blurb: 'Learning the rules and basic shots.' },
  { ordinal: 2, key: 'novice', label: 'Novice', color: '#14b8a6', blurb: 'Consistent rallies, developing strategy.' },
  { ordinal: 3, key: 'low_intermediate', label: 'Low Intermediate', color: '#3b82f6', blurb: 'Reliable serves, dinks and third shots.' },
  { ordinal: 4, key: 'high_intermediate', label: 'High Intermediate', color: '#8b5cf6', blurb: 'Controls pace, places shots, reads the game.' },
  { ordinal: 5, key: 'advanced', label: 'Advanced', color: '#f97316', blurb: 'Tournament-level power and shot selection.' },
  { ordinal: 6, key: 'pro', label: 'Pro', color: '#e11d48', blurb: 'Elite, competes at the highest level.' },
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
