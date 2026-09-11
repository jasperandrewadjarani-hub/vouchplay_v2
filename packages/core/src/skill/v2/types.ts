/**
 * STS_V2 - rig-resistant Community Skill engine types (master_plan §2AF).
 *
 * WHY a parallel type set instead of reusing the V1 vouch/weight types (`vouches/sts.ts`,
 * `vouches/weight.ts`): V1's `VouchInput` is already a resolved (skill, weight, voucherId) triple with
 * no notion of trust or independence. V2 needs the raw ingredients - who the voucher IS (anchored,
 * standing, age, clubs) and what the vouch itself looked like (reciprocal, timing) - so the engine can
 * derive trust and independence itself rather than have the caller pre-collapse them. Keeping these
 * types separate also keeps V1 completely untouched (locked, §10), so V2 can be developed, tested, and
 * rolled back independently.
 */

/** A voucher as a witness: the facts needed to judge how much their word is worth (§2AF.1). */
export interface V2Voucher {
  /** Voucher's own account id. */
  id: string;
  /** Has a confirmed/paid registration, approved identity verification, or an active coach role. */
  anchored: boolean;
  /**
   * Pre-aggregated "standing" - vouches this voucher has RECEIVED from other accounts (anchored giver
   * counts 1.0, unanchored 0.5, reciprocal pairs excluded). Computed upstream (app layer, §2AF E3);
   * the engine only reads the number, it never re-derives it from a vouch graph.
   */
  standingRaw: number;
  accountAgeDays: number;
  /** Active club memberships, used for bloc-decay grouping (§2AF.2). Empty array = no club. */
  clubIds: string[];
  /**
   * Active vouches this voucher has GIVEN (to anyone). A single-purpose account exists to vouch one
   * target and has almost none (§2AJ).
   */
  outgoingCount: number;
}

/** One active vouch on a target, as evidence for the aggregation (§2AF.3-4). */
export interface V2Vouch {
  /** Vouch row id - needed to hold/flag specific vouches without exposing voucher identity. */
  id: string;
  voucherId: string;
  /** Skill-band ordinal 0..6 (locked, §3.1). */
  level: number;
  /** Resolved credential weight from the unchanged §10.5 table. */
  credentialWeight: number;
  /** True when the target also has an active vouch for this voucher (mutual pair). */
  reciprocal: boolean;
  /** ISO 8601 timestamp - ordering/velocity math takes `now` as an explicit input, never Date.now(). */
  createdAt: string;
}

/** Trust-model tuning (Admin `system_settings`, operational - not version-locked). */
export interface V2Params {
  /** VT for a voucher with zero standing and no anchor - a totally unknown fresh account. Default 0.25. */
  trustUnknownFactor: number;
  /** Floor of the anchored-factor range for an unanchored voucher WITH some standing. Default 0.6. */
  trustUnanchoredFactor: number;
  /** Standing value at which `standingComponent` saturates to 1. Default 3. */
  trustStandingSaturation: number;
  /** Account age (days) at which `maturity` saturates to 1.0 (from a 0.5 floor). Default 7. */
  trustMaturityDays: number;
  /** Independence multiplier applied to a reciprocal (mutual) vouch. Default 0.5. */
  reciprocalMultiplier: number;
  /** Per-rank decay applied within a club bloc, ordered by trust descending. Default 0.6. */
  blocDecay: number;
  /** Weight given to the target's own self-rating as a Bayesian prior. Default 2.0. */
  priorWeight: number;
  /** Minimum N_eff for Skill Verified (V2). Default 2.0. */
  minIndependentVouchers: number;
  /** Minimum STS_V2 for Skill Verified (V2). Default 3.0. */
  skillVerifiedMinSts: number;
}

/** STS_V2 blend constants - version-locked in `@vouchplay/config`, mirrors V1's `StsConstants` shape. */
export interface V2Constants {
  countDivisor: number;
  weightDivisor: number;
  dispersionDivisor: number;
  countCoefficient: number;
  weightCoefficient: number;
  agreementCoefficient: number;
  scale: number;
}

/** Anomaly-detection thresholds (Admin `system_settings`, §2AF anomaly table). */
export interface AnomalyParams {
  velocityWindowHours: number;
  velocityBurstMin: number;
  velocityLowTrustShare: number;
  velocityLowTrustVt: number;
  swarmMin: number;
  ringReciprocalShare: number;
  blocShare: number;
  /** Band distance that counts as a "spike" for both CLUB_BLOC and SPIKE. */
  spikeBands: number;
  /** SINGLE_PURPOSE_CLUSTER (§2AJ): max active vouches given by a voucher for it to count as single-purpose. */
  clusterMaxOutgoing: number;
  /** SINGLE_PURPOSE_CLUSTER (§2AJ): minimum single-purpose vouches on a target before the cluster is considered. */
  clusterMin: number;
  /** SINGLE_PURPOSE_CLUSTER (§2AJ): minimum share of a target's vouches that must be single-purpose to trigger a hold. */
  clusterShare: number;
}

export type AnomalyFlagType =
  | 'VELOCITY_BURST'
  | 'LOW_TRUST_SWARM'
  | 'RECIPROCAL_RING'
  | 'CLUB_BLOC'
  | 'SPIKE'
  | 'SINGLE_PURPOSE_CLUSTER';

export type AnomalySeverity = 'high' | 'medium' | 'low';

/**
 * A moderation-facing anomaly flag (`fraud_flags`). `reason` MUST stay non-technical and MUST NOT name
 * or identify any voucher (§2AF: "flags name a subject and reasons, never who vouched you") - voucher
 * identity only ever appears, staff-only, inside `evidence.vouchIds` / `holdVouchIds`.
 */
export interface AnomalyFlag {
  type: AnomalyFlagType;
  severity: AnomalySeverity;
  /** Plain language a non-technical moderator understands. Never a voucher name or id. */
  reason: string;
  /** Counts, shares, window bounds, and vouch ids only - staff-only data, never prose. */
  evidence: Record<string, unknown>;
  /** Only VELOCITY_BURST and SINGLE_PURPOSE_CLUSTER ever populate this - the specific vouches to quarantine. */
  holdVouchIds: string[];
}
