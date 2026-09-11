/**
 * Vouch HOLD bookkeeping shared by the guard, the moderation queue and the profile "under review" note
 * (master_plan §2AF velocity hold, §2AJ single-purpose cluster hold). A hold is the one automatic,
 * REVERSIBLE action in the integrity system: the vouch row is set `status='invalidated'` with an
 * `invalidation_reason` of `<prefix><fraud_flag id>`, so the flag that caused it - and only that flag -
 * can release it. Any other `invalidated` row is a moderator's for-cause invalidation and is never
 * touched by the reinstate path. Pure module (no server-only) so the client panel can share the type
 * check.
 */
export const HOLD_REASON_PREFIXES = {
  VELOCITY_BURST: 'velocity_hold:',
  SINGLE_PURPOSE_CLUSTER: 'cluster_hold:',
} as const;

export type HoldFlagType = keyof typeof HOLD_REASON_PREFIXES;

export const HOLD_FLAG_TYPES = Object.keys(HOLD_REASON_PREFIXES) as HoldFlagType[];

/** True for the anomaly flag types whose detector may quarantine vouches. */
export function isHoldFlagType(flagType: string): flagType is HoldFlagType {
  return flagType in HOLD_REASON_PREFIXES;
}

/** The `invalidation_reason` a hold writes for one flag. */
export function holdReason(flagType: HoldFlagType, flagId: string): string {
  return `${HOLD_REASON_PREFIXES[flagType]}${flagId}`;
}

/** True when an `invalidation_reason` was written by a hold (either kind), not by a moderator. */
export function isHoldReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return Object.values(HOLD_REASON_PREFIXES).some((prefix) => reason.startsWith(prefix));
}

/** PostgREST `.or()` filter string matching every hold reason (for bounded HEAD counts). */
export const HOLD_REASON_OR_FILTER = Object.values(HOLD_REASON_PREFIXES)
  .map((prefix) => `invalidation_reason.like.${prefix}%`)
  .join(',');
