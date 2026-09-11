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
 *
 * §2AM decision 1 adds mixed-doubles COMPOSITION on top of the existing per-player sex check: a
 * mixed division must end up with one male and one female player. That is a property of the PAIR,
 * so it only fires when the caller is checking a candidate against a specific other seat
 * (`partnerSex` provided) - the same ELIG_V1-mirrored rule lives at the team level as
 * `MIXED_COMPOSITION` in `eligibility.ts`, which is the line of defence that does not depend on the
 * picker having been used at all.
 */

export type DivisionFitReason = 'sex' | 'sex_unknown' | 'skill_too_high' | 'mixed_pair';

export interface DivisionFitInput {
  /** 'male' | 'female' | anything else | null when the player has not said. */
  playerSex: string | null;
  /** Community skill if known, else self-rating, else null. */
  effectiveSkill: number | null;
  sexClassification: string;
  skillPolicy: string;
  divisionMinimumSkill: number | null;
  divisionMaximumSkill: number | null;
  /**
   * The organizer's "Only allow players at each division's level or higher" setting. When it is
   * off, skill never blocks at all. It is the only thing that governs the skill rule.
   */
  enforceSkillFloor: boolean;
  /**
   * §2AM decision 1: the sex of the player ALREADY on the team, supplied when this check is for the
   * OTHER seat of a mixed doubles team. Composition (one male + one female) is a PAIR rule, not a
   * per-player one - so when this is undefined, a mixed division still accepts anyone per player, on
   * purpose. Pass it only when a partner is actually being checked against.
   */
  partnerSex?: 'male' | 'female' | null;
  /** 'singles' | 'doubles' | etc. Composition only applies to doubles; singles has no partner. */
  format?: string;
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

  // §2AM decision 1: mixed doubles is one male + one female, not "anyone". `partnerSex` is only
  // present when this check is FOR a specific other seat (the picker, an invite, an acceptance) -
  // singles has no partner, and a bare per-player fit check (partnerSex undefined) still accepts
  // anyone, because composition is a property of the PAIR, not of either player alone.
  if (sex === 'mixed' && input.partnerSex !== undefined && input.format !== 'singles') {
    if (!input.playerSex) return { fits: false, reason: 'sex_unknown' };
    if (input.partnerSex && input.playerSex === input.partnerSex) {
      return { fits: false, reason: 'mixed_pair' };
    }
  }

  // Playing UP is allowed, always. A Low Intermediate entering a High Intermediate division is
  // choosing a harder game, which no rule should stand in the way of. Only playing DOWN is refused,
  // and only when the organizer has asked for it - that is what their "level or higher" setting says
  // in so many words, and it is the whole of the skill rule.
  if (
    input.enforceSkillFloor &&
    input.skillPolicy !== 'open' &&
    input.effectiveSkill != null &&
    input.divisionMaximumSkill != null &&
    input.effectiveSkill > input.divisionMaximumSkill
  ) {
    return { fits: false, reason: 'skill_too_high' };
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

  // §2AM decision 1. Plain and nameless on purpose - this is a rule about the PAIR, not about
  // either player individually, so it would be wrong to single one of them out as "the problem".
  if (reason === 'mixed_pair') {
    return 'Mixed doubles needs one male and one female player.';
  }

  const band = ctx.bandLabel ?? 'this level';
  // Sentence-cased, because this follows a full stop. "and above. your level is" shipped once.
  const level = ctx.playerLevel
    ? ` ${ctx.subject === 'you' ? 'Your' : 'Their'} level is ${ctx.playerLevel}.`
    : '';

  // The only skill refusal left: the player is too strong for this division. Playing up is allowed,
  // so there is no message for it - there is nothing to refuse.
  return ctx.subject === 'you'
    ? `${ctx.divisionName} is for ${band} players.${level} You can enter any division at your level or above.`
    : `${who} plays above ${ctx.divisionName}, which is for ${band} players.${level} Pick a division at ${owns} level or above.`;
}
