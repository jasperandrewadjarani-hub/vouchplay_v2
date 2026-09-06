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
 */

export const ELIGIBILITY_ALGORITHM_VERSION = 'ELIG_V1';

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
  | 'DUPLICATE_REGISTRATION';

/** Neutral, evidence-based reason codes that explain a REVIEW / SKILL_MISMATCH (§25.4, §25.6). */
export type EligibilityReasonCode =
  | 'SKILL_ABOVE_DIVISION_MAX'
  | 'STS_BELOW_REQUIRED'
  | 'LOW_CONFIDENCE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'UNRATED'
  | 'SKILL_VERIFIED_REQUIRED_MISSING'
  | 'AGE_UNKNOWN';

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
 *  2. Skill: CSL above the division max -> SKILL_MISMATCH.
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
    if (player.communitySkillLevel > (rules.maximumSkill as number)) {
      reasonCodes.push('SKILL_ABOVE_DIVISION_MAX');
      result = 'SKILL_MISMATCH';
    }
  }

  // ---- Review gates (§25.4): evidence, confidence, verification ----
  if (player.communitySkillLevel == null) {
    reasonCodes.push('UNRATED');
  } else if (player.uniqueVoucherCount < thresholds.minEvidenceVouchers) {
    reasonCodes.push('INSUFFICIENT_EVIDENCE');
  }

  const requiredSts = rules.minimumSts;
  if (requiredSts != null && player.sts < requiredSts) {
    reasonCodes.push('STS_BELOW_REQUIRED');
  } else if (player.sts < thresholds.reviewBelowSts) {
    reasonCodes.push('LOW_CONFIDENCE');
  }

  if (rules.skillVerifiedRequired && !player.skillVerified) {
    reasonCodes.push('SKILL_VERIFIED_REQUIRED_MISSING');
  }

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
  if (players.length !== rules.teamSize) teamHard.push('INVALID_TEAM_SIZE');
  if (hardContext?.registrationClosed) teamHard.push('REGISTRATION_CLOSED');
  if (hardContext?.duplicateRegistration) teamHard.push('DUPLICATE_REGISTRATION');

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
