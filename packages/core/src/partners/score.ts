/**
 * Partner matchmaking score (master_plan §2AV D) - pure, deterministic scoring for the "swipe to
 * partner" deck. Sums seven independently-tunable terms (weights read once per deck load from
 * `system_settings`, see `packages/config/src/settings.ts` `partner_weight_*`) so the ranking is
 * fully explainable and testable term-by-term. Never throws: a malformed candidate should sink to
 * the bottom of the deck, not break it for everyone else.
 */

export interface PartnerWeights {
  slot: number;
  divisionOverlap: number;
  skillProximity: number;
  reciprocity: number;
  city: number;
  trust: number;
  freshness: number;
}

export const DEFAULT_PARTNER_WEIGHTS: PartnerWeights = {
  slot: 5,
  divisionOverlap: 3,
  skillProximity: 3,
  reciprocity: 3,
  city: 1,
  trust: 1,
  freshness: 1,
};

export interface PartnerScoreInput {
  /** Divisions both players want and both fit. */
  commonDivisions: { id: string; recommendedForViewer: boolean }[];
  /** The candidate's live open-seat entry; counts only when its divisionId is a common division. */
  candidateSeat: { divisionId: string; paid: boolean } | null;
  /** Skill ordinals 0-6 (community level first, self-rated as fallback); null = unknown. */
  viewerSkill: number | null;
  candidateSkill: number | null;
  candidateSwipedRightOnViewer: boolean;
  sameCity: boolean;
  sameRegion: boolean;
  candidateIdentityVerified: boolean;
  candidateCoachVouched: boolean;
  candidateStsAtOrAboveThreshold: boolean;
  /** ISO timestamps. */
  candidateSearchLastActiveAt: string;
  now: string;
}

export interface PartnerScore {
  score: number;
  terms: Record<keyof PartnerWeights, number>;
}

const FRESHNESS_FULL_HOURS = 24;
const FRESHNESS_ZERO_HOURS = 168; // 7 days

function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

function parseTimeMs(iso: string): number {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function slotTerm(input: PartnerScoreInput, weights: PartnerWeights): number {
  const seat = input.candidateSeat;
  if (!seat) return 0;
  const inCommonDivision = input.commonDivisions.some((d) => d.id === seat.divisionId);
  if (!inCommonDivision) return 0;
  return seat.paid ? weights.slot : weights.slot / 2;
}

function divisionOverlapTerm(input: PartnerScoreInput, weights: PartnerWeights): number {
  return input.commonDivisions.reduce(
    (sum, d) => sum + weights.divisionOverlap * (d.recommendedForViewer ? 2 : 1),
    0,
  );
}

function skillProximityTerm(input: PartnerScoreInput, weights: PartnerWeights): number {
  if (input.viewerSkill == null || input.candidateSkill == null) return 0;
  const gap = Math.abs(input.viewerSkill - input.candidateSkill);
  if (gap === 0) return weights.skillProximity;
  if (gap === 1) return weights.skillProximity / 2;
  return 0;
}

function reciprocityTerm(input: PartnerScoreInput, weights: PartnerWeights): number {
  return input.candidateSwipedRightOnViewer ? weights.reciprocity : 0;
}

function cityTerm(input: PartnerScoreInput, weights: PartnerWeights): number {
  if (input.sameCity) return weights.city;
  if (input.sameRegion) return weights.city / 2;
  return 0;
}

function trustTerm(input: PartnerScoreInput, weights: PartnerWeights): number {
  const fraction =
    0.4 * (input.candidateIdentityVerified ? 1 : 0) +
    0.3 * (input.candidateCoachVouched ? 1 : 0) +
    0.3 * (input.candidateStsAtOrAboveThreshold ? 1 : 0);
  return fraction * weights.trust;
}

function freshnessTerm(input: PartnerScoreInput, weights: PartnerWeights): number {
  const lastActiveMs = parseTimeMs(input.candidateSearchLastActiveAt);
  const nowMs = parseTimeMs(input.now);
  if (!Number.isFinite(lastActiveMs) || !Number.isFinite(nowMs)) return 0;
  const ageHours = (nowMs - lastActiveMs) / (1000 * 60 * 60);
  if (ageHours <= FRESHNESS_FULL_HOURS) return weights.freshness;
  if (ageHours >= FRESHNESS_ZERO_HOURS) return 0;
  const fraction =
    (FRESHNESS_ZERO_HOURS - ageHours) / (FRESHNESS_ZERO_HOURS - FRESHNESS_FULL_HOURS);
  return weights.freshness * fraction;
}

/** Sum of the seven terms, each independently explainable for the deck's "why this order" needs. */
export function scorePartnerCandidate(
  input: PartnerScoreInput,
  weights: PartnerWeights = DEFAULT_PARTNER_WEIGHTS,
): PartnerScore {
  try {
    const terms: Record<keyof PartnerWeights, number> = {
      slot: round3(slotTerm(input, weights)),
      divisionOverlap: round3(divisionOverlapTerm(input, weights)),
      skillProximity: round3(skillProximityTerm(input, weights)),
      reciprocity: round3(reciprocityTerm(input, weights)),
      city: round3(cityTerm(input, weights)),
      trust: round3(trustTerm(input, weights)),
      freshness: round3(freshnessTerm(input, weights)),
    };
    const score = round3(Object.values(terms).reduce((sum, v) => sum + v, 0));
    return { score, terms };
  } catch {
    const zeroTerms: Record<keyof PartnerWeights, number> = {
      slot: 0,
      divisionOverlap: 0,
      skillProximity: 0,
      reciprocity: 0,
      city: 0,
      trust: 0,
      freshness: 0,
    };
    return { score: 0, terms: zeroTerms };
  }
}

/** Desc by score, then most recently active first - ties go to whoever is more likely still around. */
export function comparePartnerScores(
  a: { score: number; lastActiveAt: string },
  b: { score: number; lastActiveAt: string },
): number {
  if (b.score !== a.score) return b.score - a.score;
  const aMs = parseTimeMs(a.lastActiveAt);
  const bMs = parseTimeMs(b.lastActiveAt);
  const safeA = Number.isFinite(aMs) ? aMs : -Infinity;
  const safeB = Number.isFinite(bMs) ? bMs : -Infinity;
  return safeB - safeA;
}
