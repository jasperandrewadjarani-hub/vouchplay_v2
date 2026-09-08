/**
 * Skill-floor registration gate (organizer global rule). This is a SEPARATE, organizer-configurable
 * hard gate and is deliberately NOT part of the version-locked ELIG_V1 decision-support engine, which
 * never blocks. When the organizer enables the floor for a tournament, a player cannot register in a
 * division whose skill ceiling sits below their own skill (they may always play at their level or
 * higher). Registering into a division above their level is allowed but warned. A player with no
 * known skill (no community and no self-rating) is never blocked, because there is nothing to compare.
 *
 * Effective skill is the player's community skill if known, otherwise their self-rating, regardless of
 * whether that community skill is verified. Open-skill divisions never block or warn.
 */

export type SkillFloorPolicy = 'band' | 'open' | 'custom';

export interface SkillFloorInput {
  /** Community skill ordinal if known, else self-rated ordinal, else null. */
  effectiveSkill: number | null;
  skillPolicy: SkillFloorPolicy;
  divisionMinimumSkill: number | null;
  divisionMaximumSkill: number | null;
  /** The tournament's organizer-set floor toggle. */
  enforce: boolean;
}

export interface SkillFloorResult {
  /** Registration must be refused: the division is entirely below the player's skill. */
  blocked: boolean;
  /** Advisory: the division targets a higher skill than the player's; registration is still allowed. */
  above: boolean;
}

export function evaluateSkillFloor(input: SkillFloorInput): SkillFloorResult {
  const capped = input.skillPolicy !== 'open';
  const known = input.effectiveSkill != null;
  const below =
    input.enforce &&
    capped &&
    known &&
    input.divisionMaximumSkill != null &&
    (input.effectiveSkill as number) > input.divisionMaximumSkill;
  const above =
    capped &&
    known &&
    input.divisionMinimumSkill != null &&
    (input.effectiveSkill as number) < input.divisionMinimumSkill;
  return { blocked: below, above };
}

/** Community skill wins over self-rating; null when the player has neither. */
export function effectivePlayerSkill(
  communitySkillLevel: number | null,
  selfRatedSkill: number | null,
): number | null {
  return communitySkillLevel ?? selfRatedSkill ?? null;
}
