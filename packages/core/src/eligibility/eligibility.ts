/**
 * Tournament Eligibility Engine (ELIG_V1) - handover §25, §26.7.
 *
 * This is the product's primary anti-sandbagging module, implemented as PURE, DETERMINISTIC
 * decision-SUPPORT (the same discipline as STS_V1). It NEVER auto-punishes and NEVER labels a person:
 * it turns a player's community skill evidence + a division's rules into a neutral classification
 * (ELIGIBLE / REVIEW / SKILL_MISMATCH / INELIGIBLE_HARD_RULE) plus evidence-based reason codes and
 * advisory flags. The organizer always decides (§25.5). No defamatory wording ever originates here
 * (§25.6) - see labels.ts and the copy guard test.
 *
 * All thresholds are injected from Admin settings (never hardcoded, handover coding standard). The
 * algorithm is version-locked: any change to its semantics is a NEW version - bump
 * ELIGIBILITY_ALGORITHM_VERSION and never mutate historical snapshot meaning.
 *
 * ELIG_V1.1 (master_plan §2AO decision C): an organizer can allow entry exactly one skill level
 * below a player's community-vouched skill (`DivisionEligibilityRules.allowPlayDownOneLevel`). When
 * that flag is set and a player's CSL is EXACTLY one above the division max, the result is REVIEW
 * with reason `PLAYING_DOWN_ONE_LEVEL` instead of SKILL_MISMATCH - the organizer's promised "final
 * skills assessment" becomes a queue item, not just wizard copy. Two or more levels above is still
 * SKILL_MISMATCH regardless of the flag. Historical ELIG_V1 snapshots are untouched by this change;
 * only the live algorithm version and the semantics for new evaluations move.
 */

export const ELIGIBILITY_ALGORITHM_VERSION = 'ELIG_V1.1';

/** Ordered worst -> best is the reverse; severity rank is used for team = worst-of-members (§25.1). */
export type EligibilityResult = 'ELIGIBLE' | 'REVIEW' | 'SKILL_MISMATCH' | 'INELIGIBLE_HARD_RULE';

const SEVERITY: Record<EligibilityResult, number> = {
  ELIGIBLE: 0,
  REVIEW: 1,
  SKILL_MISMATCH: 2,
  INELIGIBLE_HARD_RULE: 3,
};

/** Hard-rule failure codes (§25.2). A hard-rule failure is always INELIGIBLE_HARD_RULE. */
export type HardRuleCode =
  | 'WRONG_SEX'
  | 'AGE_BELOW_MIN'
  | 'AGE_ABOVE_MAX'
  | 'ACCOUNT_NOT_ACTIVE'
  | 'INVALID_TEAM_SIZE'
  | 'REGISTRATION_CLOSED'
  | 'DUPLICATE_REGISTRATION'
  | 'MIXED_COMPOSITION';

/** Neutral, evidence-based reason codes that explain a REVIEW / SKILL_MISMATCH (§25.4, §25.6). */
export type EligibilityReasonCode =
  | 'SKILL_ABOVE_DIVISION_MAX'
  | 'STS_BELOW_REQUIRED'
  | 'LOW_CONFIDENCE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'UNRATED'
  | 'SKILL_VERIFIED_REQUIRED_MISSING'
  | 'AGE_UNKNOWN'
  /** ELIG_V1.1 / §2AO decision C: CSL is exactly one level above the max and the organizer's
   *  play-down-one-level toggle is on - REVIEW, not SKILL_MISMATCH, so it lands in the "needs
   *  review" queue for the promised final skills assessment. */
  | 'PLAYING_DOWN_ONE_LEVEL';

/** Advisory flags (§25.4). Additive signals for the organizer; each forces at least REVIEW. */
export type EligibilityFlag = 'HISTORICAL_SKILL_MISMATCH' | 'UNUSUAL_VOUCH_ACTIVITY';

export type DivisionSkillPolicy = 'band' | 'open' | 'custom';
export type DivisionSexClassification = 'men' | 'women' | 'mixed' | 'genderless';
export type PlayerSex = 'male' | 'female';

/** Admin-tunable thresholds (migration 0011 / system_settings). Never hardcoded in domain logic. */
export interface EligibilityThresholds {
  /** Minimum unique active vouchers to count as "enough evidence" (§25.4). Default 2. */
  minEvidenceVouchers: number;
  /** STS at/above this = confident; below it adds LOW_CONFIDENCE and downgrades to REVIEW. Default 3.0. */
  reviewBelowSts: number;
}

/**
 * The skill-evidence reasons that must be surfaced before registration (§19.4). These are the
 * neutral ELIG_V1 REVIEW conditions a player can improve by collecting genuine vouches; hard-rule
 * and above-band decisions stay on the organizer eligibility surface.
 */
export type RegistrationSkillPromptReasonCode = Extract<
  EligibilityReasonCode,
  | 'STS_BELOW_REQUIRED'
  | 'LOW_CONFIDENCE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'UNRATED'
  | 'SKILL_VERIFIED_REQUIRED_MISSING'
>;

export interface RegistrationSkillPromptInput {
  communitySkillLevel: number | null;
  sts: number;
  uniqueVoucherCount: number;
  skillVerified: boolean;
}

export interface RegistrationSkillPromptRules {
  skillVerifiedRequired: boolean;
  /** Division-specific minimum STS, or null to use the admin review threshold. */
  minimumSts: number | null;
}

export interface RegistrationSkillPromptResult {
  showPrompt: boolean;
  reasonCodes: RegistrationSkillPromptReasonCode[];
}

/**
 * Evaluate the pre-registration skill-evidence prompt (§19.4) using the same injected thresholds as
 * ELIG_V1. Pure and UI-agnostic so the registration panel cannot drift from organizer review logic.
 */
export function evaluateRegistrationSkillPrompt(
  player: RegistrationSkillPromptInput,
  rules: RegistrationSkillPromptRules,
  thresholds: EligibilityThresholds,
): RegistrationSkillPromptResult {
  const reasonCodes: RegistrationSkillPromptReasonCode[] = [];

  if (player.communitySkillLevel == null) {
    reasonCodes.push('UNRATED');
  } else if (player.uniqueVoucherCount < thresholds.minEvidenceVouchers) {
    reasonCodes.push('INSUFFICIENT_EVIDENCE');
  }

  if (rules.minimumSts != null && player.sts < rules.minimumSts) {
    reasonCodes.push('STS_BELOW_REQUIRED');
  } else if (player.sts < thresholds.reviewBelowSts) {
    reasonCodes.push('LOW_CONFIDENCE');
  }

  if (rules.skillVerifiedRequired && !player.skillVerified) {
    reasonCodes.push('SKILL_VERIFIED_REQUIRED_MISSING');
  }

  return { showPrompt: reasonCodes.length > 0, reasonCodes: uniq(reasonCodes) };
}

/** One division's eligibility-relevant rules (already stored on `divisions`, §18). */
export interface DivisionEligibilityRules {
  skillPolicy: DivisionSkillPolicy;
  minimumSkill: number | null;
  maximumSkill: number | null;
  sexClassification: DivisionSexClassification;
  minimumAge: number | null;
  maximumAge: number | null;
  teamSize: number;
  skillVerifiedRequired: boolean;
  /** Division-specific minimum STS, or null to fall back to the admin confidence threshold. */
  minimumSts: number | null;
  /**
   * §2AO decision C / ELIG_V1.1: the tournament's "Allow one level below" toggle
   * (`tournaments.allow_play_down_one_level`). Optional so every existing caller/fixture that omits
   * it keeps today's ELIG_V1 behaviour (undefined is falsy - never widens the floor).
   */
  allowPlayDownOneLevel?: boolean;
}

/** One player's eligibility inputs (§25.3). Skill fields come from player_skill_profiles. */
export interface PlayerEligibilityInput {
  playerId: string;
  /** Community Skill Level ordinal (weighted median), or null when the player has no active vouches. */
  communitySkillLevel: number | null;
  /** Skill-Trust Score 0..5 (confidence, NOT skill). */
  sts: number;
  /** Community/admin Skill-Verified status. */
  skillVerified: boolean;
  /** Self-declared skill ordinal (context only; never overrides community evidence). */
  selfRatedSkill: number | null;
  uniqueVoucherCount: number;
  /** Sex from profiles.sex, or null if not set. */
  sex: PlayerSex | null;
  /** Age computed at the tournament START date (§18.5), or null if DOB is unknown. */
  ageAtStart: number | null;
  /** account_status === 'active'. */
  accountActive: boolean;
  /** An open UNUSUAL_VOUCH_ACTIVITY fraud flag exists for this player (advisory). */
  unusualVouchActivity?: boolean;
  /** Historical results materially conflict with this division (Phase 12; no-op until then). */
  historicalSkillMismatch?: boolean;
}

export interface PlayerEligibility {
  playerId: string;
  result: EligibilityResult;
  hardRuleCodes: HardRuleCode[];
  reasonCodes: EligibilityReasonCode[];
  flags: EligibilityFlag[];
  /** Echo of the evidence the decision used, for the snapshot + organizer UI (neutral facts). */
  communitySkillLevel: number | null;
  sts: number;
  uniqueVoucherCount: number;
  skillVerified: boolean;
}

/** Team-level context a single member cannot know on its own (§25.2). */
export interface TeamHardContext {
  /** Registration window is closed/locked for this division. */
  registrationClosed?: boolean;
  /** This team duplicates/conflicts with an existing registration (§21.4). */
  duplicateRegistration?: boolean;
  /**
   * §2AM decision 2: this team is deliberately short a member because the second seat is open
   * ("enter now, choose a partner later" - a solo-paid doubles entry, or a confirmed partner who
   * just left). A team fewer than `rules.teamSize` is normally INVALID_TEAM_SIZE; when the missing
   * seat is a known, first-class open state rather than a data problem, that hard rule must not fire
   * - the present member(s) are still evaluated and aggregated exactly as today.
   */
  seatOpen?: boolean;
}

export interface TeamEligibility {
  result: EligibilityResult;
  /** Team-level hard-rule failures (size / closed / duplicate). */
  hardRuleCodes: HardRuleCode[];
  reasonCodes: EligibilityReasonCode[];
  flags: EligibilityFlag[];
  players: PlayerEligibility[];
  algorithmVersion: string;
}

function worst(a: EligibilityResult, b: EligibilityResult): EligibilityResult {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

/**
 * Evaluate ONE player against ONE division. Pure. Order of evaluation (§25.2 before §25.4):
 *  1. Hard rules -> INELIGIBLE_HARD_RULE (short-circuits skill evaluation).
 *  2. Skill: CSL above the division max -> SKILL_MISMATCH, unless it is exactly one level above and
 *     the organizer's play-down-one-level toggle is on, in which case -> REVIEW (ELIG_V1.1).
 *  3. Otherwise ELIGIBLE, downgraded to REVIEW by any evidence/confidence/verification gap or flag.
 */
export function evaluatePlayerEligibility(
  player: PlayerEligibilityInput,
  rules: DivisionEligibilityRules,
  thresholds: EligibilityThresholds,
): PlayerEligibility {
  const hardRuleCodes: HardRuleCode[] = [];
  const reasonCodes: EligibilityReasonCode[] = [];
  const flags: EligibilityFlag[] = [];

  // ---- Advisory flags (additive; each forces at least REVIEW below) ----
  if (player.unusualVouchActivity) flags.push('UNUSUAL_VOUCH_ACTIVITY');
  if (player.historicalSkillMismatch) flags.push('HISTORICAL_SKILL_MISMATCH');

  // ---- Hard rules (§25.2) ----
  if (!player.accountActive) hardRuleCodes.push('ACCOUNT_NOT_ACTIVE');

  // Sex restriction only applies to men/women divisions; mixed/genderless impose none per-player.
  if (rules.sexClassification === 'men' && player.sex !== 'male') hardRuleCodes.push('WRONG_SEX');
  if (rules.sexClassification === 'women' && player.sex !== 'female')
    hardRuleCodes.push('WRONG_SEX');

  if (player.ageAtStart != null) {
    if (rules.minimumAge != null && player.ageAtStart < rules.minimumAge)
      hardRuleCodes.push('AGE_BELOW_MIN');
    if (rules.maximumAge != null && player.ageAtStart > rules.maximumAge)
      hardRuleCodes.push('AGE_ABOVE_MAX');
  } else if (rules.minimumAge != null || rules.maximumAge != null) {
    // Age-restricted division but DOB unknown - can't hard-fail; surface for review.
    reasonCodes.push('AGE_UNKNOWN');
  }

  if (hardRuleCodes.length > 0) {
    return {
      playerId: player.playerId,
      result: 'INELIGIBLE_HARD_RULE',
      hardRuleCodes: uniq(hardRuleCodes),
      reasonCodes: uniq(reasonCodes),
      flags: uniq(flags),
      communitySkillLevel: player.communitySkillLevel,
      sts: player.sts,
      uniqueVoucherCount: player.uniqueVoucherCount,
      skillVerified: player.skillVerified,
    };
  }

  // ---- Skill mismatch: CSL strictly above the division maximum (§25.4) ----
  // Only skill-capped policies ('band'/'custom' with a max) can produce SKILL_MISMATCH; 'open' cannot.
  let result: EligibilityResult = 'ELIGIBLE';
  const capApplies = rules.skillPolicy !== 'open' && rules.maximumSkill != null;
  if (capApplies && player.communitySkillLevel != null) {
    const max = rules.maximumSkill as number;
    if (player.communitySkillLevel > max) {
      // ELIG_V1.1 / §2AO decision C: exactly one level above the max, with the organizer's toggle
      // on, is a REVIEW (the promised "final skills assessment") rather than a flat mismatch. Two or
      // more levels above is always SKILL_MISMATCH, toggle or not.
      if (rules.allowPlayDownOneLevel && player.communitySkillLevel === max + 1) {
        reasonCodes.push('PLAYING_DOWN_ONE_LEVEL');
        result = 'REVIEW';
      } else {
        reasonCodes.push('SKILL_ABOVE_DIVISION_MAX');
        result = 'SKILL_MISMATCH';
      }
    }
  }

  // ---- Review gates (§25.4): evidence, confidence, verification ----
  // Shared with the player-facing §19.4 prompt so both surfaces stay on the same ELIG_V1 rules.
  reasonCodes.push(...evaluateRegistrationSkillPrompt(player, rules, thresholds).reasonCodes);

  // A SKILL_MISMATCH stays a mismatch; otherwise any review reason or advisory flag -> REVIEW.
  if (result !== 'SKILL_MISMATCH') {
    const hasReviewReason = reasonCodes.length > 0 || flags.length > 0;
    if (hasReviewReason) result = 'REVIEW';
  }

  return {
    playerId: player.playerId,
    result,
    hardRuleCodes: [],
    reasonCodes: uniq(reasonCodes),
    flags: uniq(flags),
    communitySkillLevel: player.communitySkillLevel,
    sts: player.sts,
    uniqueVoucherCount: player.uniqueVoucherCount,
    skillVerified: player.skillVerified,
  };
}

/**
 * Evaluate a TEAM against a division: the team result is the WORST of its members plus team-level
 * hard rules (invalid size, registration closed, duplicate). Flags/reasons are the union across
 * members and team-level checks (§25.1).
 */
export function evaluateTeamEligibility(args: {
  players: PlayerEligibilityInput[];
  rules: DivisionEligibilityRules;
  thresholds: EligibilityThresholds;
  hardContext?: TeamHardContext;
}): TeamEligibility {
  const { players, rules, thresholds, hardContext } = args;
  const perPlayer = players.map((p) => evaluatePlayerEligibility(p, rules, thresholds));

  const teamHard: HardRuleCode[] = [];
  // §2AM decision 2: a team short of `teamSize` is normally invalid, EXCEPT when the missing seat
  // is a known, first-class open state (seatOpen) rather than a data problem - the present member(s)
  // are still evaluated above. A team that is the WRONG size the other way (too many, or too few
  // without an open seat) still hard-fails exactly as before.
  const short = players.length < rules.teamSize;
  if (players.length !== rules.teamSize && !(hardContext?.seatOpen && short)) {
    teamHard.push('INVALID_TEAM_SIZE');
  }
  if (hardContext?.registrationClosed) teamHard.push('REGISTRATION_CLOSED');
  if (hardContext?.duplicateRegistration) teamHard.push('DUPLICATE_REGISTRATION');

  // §2AM decision 1(d): the ELIG_V1 twin of the picker-side mixed_pair check (division-fit.ts) - the
  // line of defence that fires from the team's own snapshot, independent of whether the picker was
  // used at all. Only fires once both seats are filled and both sexes are actually known; an unknown
  // sex is a per-player REVIEW/hard-rule concern already handled above, not a composition failure.
  if (rules.sexClassification === 'mixed' && rules.teamSize >= 2 && players.length === 2) {
    const [a, b] = players;
    if (a?.sex && b?.sex && a.sex === b.sex) teamHard.push('MIXED_COMPOSITION');
  }

  let result: EligibilityResult = 'ELIGIBLE';
  for (const p of perPlayer) result = worst(result, p.result);
  if (teamHard.length > 0) result = worst(result, 'INELIGIBLE_HARD_RULE');

  const reasonCodes = uniq(perPlayer.flatMap((p) => p.reasonCodes));
  const flags = uniq(perPlayer.flatMap((p) => p.flags));
  const memberHard = uniq(perPlayer.flatMap((p) => p.hardRuleCodes));

  return {
    result,
    hardRuleCodes: uniq([...teamHard, ...memberHard]),
    reasonCodes,
    flags,
    players: perPlayer,
    algorithmVersion: ELIGIBILITY_ALGORITHM_VERSION,
  };
}
