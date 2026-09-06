/**
 * Neutral, evidence-based labels for the Eligibility Engine (handover §25.5, §25.6).
 *
 * HARD PRODUCT RULE (§25.6): the system NEVER emits "sandbagger", "smurf", "cheater", or any
 * accusatory label. Every string here describes EVIDENCE or a RULE, not a person's intent. The copy
 * guard test (eligibility.test.ts) scans the source tree and fails the build if a banned term ever
 * appears in code. Keep all user-facing eligibility wording in this file so it stays reviewable.
 */
import type {
  EligibilityResult,
  HardRuleCode,
  EligibilityReasonCode,
  EligibilityFlag,
} from './eligibility';

/**
 * The person-labels that must never appear as system-generated copy (§25.6). Used by the guard test.
 * These are the accusatory NOUNS the spec forbids ("sandbagger"/"smurf"/"cheater"). Note the feature's
 * own name, "anti-sandbagging", is not a person-label and is allowed in internal comments/spec text.
 */
export const BANNED_ELIGIBILITY_TERMS = ['sandbagger', 'smurf', 'cheater'] as const;

/** Short, neutral heading per result. "Potential Skill Mismatch" is the §25.5 canonical wording. */
export const ELIGIBILITY_RESULT_LABELS: Record<EligibilityResult, string> = {
  ELIGIBLE: 'Eligible',
  REVIEW: 'Needs review',
  SKILL_MISMATCH: 'Potential skill mismatch',
  INELIGIBLE_HARD_RULE: 'Does not meet a division rule',
};

/** One-line neutral explanation shown to organizers for the overall result. */
export const ELIGIBILITY_RESULT_DESCRIPTIONS: Record<EligibilityResult, string> = {
  ELIGIBLE: 'Meets the division rules based on available evidence.',
  REVIEW: 'Worth a look before confirming - see the notes below.',
  SKILL_MISMATCH: 'Community skill evidence sits above this division. Your decision.',
  INELIGIBLE_HARD_RULE: 'A fixed division rule is not met. Overriding requires a reason.',
};

export const HARD_RULE_LABELS: Record<HardRuleCode, string> = {
  WRONG_SEX: 'Does not match the division sex category',
  AGE_BELOW_MIN: 'Below the division minimum age at the start date',
  AGE_ABOVE_MAX: 'Above the division maximum age at the start date',
  ACCOUNT_NOT_ACTIVE: 'Account is not active',
  INVALID_TEAM_SIZE: 'Team size does not match the division',
  REGISTRATION_CLOSED: 'Registration is closed for this division',
  DUPLICATE_REGISTRATION: 'Conflicts with an existing registration',
};

export const REASON_LABELS: Record<EligibilityReasonCode, string> = {
  SKILL_ABOVE_DIVISION_MAX: 'Community skill is above the division maximum',
  STS_BELOW_REQUIRED: 'Skill-Trust Score is below the division requirement',
  LOW_CONFIDENCE: 'Skill-Trust Score is still building (lower confidence)',
  INSUFFICIENT_EVIDENCE: 'Not many vouches yet',
  UNRATED: 'No community skill rating yet',
  SKILL_VERIFIED_REQUIRED_MISSING: 'Division requires Skill-Verified; not verified yet',
  AGE_UNKNOWN: 'Date of birth not on file for an age-restricted division',
};

export const FLAG_LABELS: Record<EligibilityFlag, string> = {
  HISTORICAL_SKILL_MISMATCH: 'Past results differ from this division',
  UNUSUAL_VOUCH_ACTIVITY: 'Recent vouch pattern is worth a look',
};
