/**
 * Does this player meet the division's own rules? (master_plan §2D)
 *
 * This is the TypeScript twin of the `player_fits_division()` SQL function added in migration 0027,
 * and the two must agree. SQL is the last line of defence - it is what makes a rule true even for a
 * request the UI never rendered. This module is what lets the app say WHY before anyone presses
 * anything, which a boolean from the database cannot do.
 *
 * It is deliberately NOT part of ELIG_V1. That engine is version-locked and never blocks; these are
 * the division's own entry conditions, and failing one is not advice, it is a no.
 *
 * The one rule that reads oddly and is correct: **an unknown skill never blocks.** A player who has
 * neither a community skill nor a self-rating has nothing to compare, and refusing them would lock
 * new players out of the tournament they joined VouchPlay to enter.
 */

export type DivisionFitReason = 'sex' | 'sex_unknown' | 'skill_below' | 'skill_above';

export interface DivisionFitInput {
  /** 'male' | 'female' | anything else | null when the player has not said. */
  playerSex: string | null;
  /** Community skill if known, else self-rating, else null. */
  effectiveSkill: number | null;
  sexClassification: string;
  skillPolicy: string;
  divisionMinimumSkill: number | null;
  divisionMaximumSkill: number | null;
}

export interface DivisionFitResult {
  fits: boolean;
  /** Null when it fits. Only the FIRST failing rule is reported - see `evaluateDivisionFit`. */
  reason: DivisionFitReason | null;
}

/**
 * Sex classification first, then the skill band.
 *
 * Only one reason comes back, on purpose. A player told "this is for women AND you are too strong"
 * has to solve two problems to act on it; a player told the first thing that is wrong can act
 * immediately, and if a second rule still fails they are told that next. Sex comes first because it
 * is the rule the player cannot do anything about, so it is the honest headline.
 */
export function evaluateDivisionFit(input: DivisionFitInput): DivisionFitResult {
  const sex = input.sexClassification;
  const singleSex = sex === 'men' || sex === 'women';
  // Told apart on purpose. "This division is for women" is a dead end for someone who simply never
  // filled the field in; "add your gender to your profile" is a door. Roughly a third of accounts
  // have no gender recorded, so this is the common case, not the edge one.
  if (singleSex && !input.playerSex) return { fits: false, reason: 'sex_unknown' };
  if (sex === 'men' && input.playerSex !== 'male') return { fits: false, reason: 'sex' };
  if (sex === 'women' && input.playerSex !== 'female') return { fits: false, reason: 'sex' };

  if (input.skillPolicy !== 'open' && input.effectiveSkill != null) {
    const s = input.effectiveSkill;
    if (input.divisionMinimumSkill != null && s < input.divisionMinimumSkill) {
      return { fits: false, reason: 'skill_below' };
    }
    if (input.divisionMaximumSkill != null && s > input.divisionMaximumSkill) {
      return { fits: false, reason: 'skill_above' };
    }
  }
  return { fits: true, reason: null };
}

export interface FitMessageContext {
  /** Who this is about: the person reading, or the partner they picked. */
  subject: 'you' | 'partner';
  /** The partner's first name, when subject is 'partner'. */
  partnerName?: string | null;
  /** e.g. "Men's Doubles Beginner". */
  divisionName: string;
  /** The band this division is for, e.g. "Beginner", or a range. Null for an open division. */
  bandLabel: string | null;
  /** The player's own level, e.g. "Novice". Null when they have none recorded. */
  playerLevel: string | null;
}

/**
 * A sentence a person can act on, in the words they would use themselves.
 *
 * No codes, no "eligibility", no "criteria". Each message says what is true and what to do instead,
 * because a refusal that does not point somewhere is just a dead end - and the people most likely
 * to hit one of these are the least likely to guess the way out.
 */
export function describeDivisionFit(reason: DivisionFitReason, ctx: FitMessageContext): string {
  const who = ctx.subject === 'you' ? 'You' : ctx.partnerName?.trim() || 'That player';
  const owns = ctx.subject === 'you' ? 'your' : 'their';

  if (reason === 'sex_unknown') {
    return ctx.subject === 'you'
      ? `${ctx.divisionName} is a men's or women's event, and your profile does not say which you play in. Add your gender to your profile and this will open up.`
      : `${who} has not added their gender yet, so they cannot be entered in ${ctx.divisionName}. Ask them to add it to their profile, or choose a mixed division.`;
  }

  if (reason === 'sex') {
    const forWhom = ctx.divisionName.toLowerCase().includes('women')
      ? 'women'
      : ctx.divisionName.toLowerCase().includes('men')
        ? 'men'
        : 'a different category';
    return ctx.subject === 'you'
      ? `${ctx.divisionName} is for ${forWhom}. Look for a division that matches your profile, or a mixed one.`
      : `${who} cannot play in ${ctx.divisionName}, which is for ${forWhom}. Pick a partner who can, or choose a mixed division.`;
  }

  const band = ctx.bandLabel ?? 'this level';
  const level = ctx.playerLevel ? ` ${owns} level is ${ctx.playerLevel}.` : '';

  if (reason === 'skill_below') {
    return ctx.subject === 'you'
      ? `${ctx.divisionName} is for ${band} players and above.${level} Try a division at your own level.`
      : `${who} is below the level ${ctx.divisionName} is for (${band}).${level} Pick a division you can both enter.`;
  }
  return ctx.subject === 'you'
    ? `${ctx.divisionName} is for ${band} players.${level} You play above this division, so enter one at your own level.`
    : `${who} plays above the level ${ctx.divisionName} is for (${band}).${level} Pick a division you can both enter.`;
}
