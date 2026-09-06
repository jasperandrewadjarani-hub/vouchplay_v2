/**
 * Vouch effective-weight model (handover §10.5). Weights are Admin settings (system_settings),
 * passed in here - NEVER hardcoded into domain logic. The chosen weight is copied onto each vouch
 * row as a calculation snapshot for auditability (§10.5), alongside the weight_rule_version.
 *
 * LOCKED invariants (non-negotiable, handover §3.3/§10.5):
 *  - Skill Verified status does NOT affect weight (avoids circular scoring).
 *  - Facebook does NOT affect weight.
 *  - Organizer role does NOT affect weight.
 * Only two inputs move weight: whether the vouch used an approved-Coach toggle, and whether the
 * voucher's IDENTITY is verified (identity affects source credibility, not skill).
 */

export const WEIGHT_RULE_VERSION = 'WEIGHT_V1';

export interface WeightSettings {
  /** Normal player. Default 1.00. */
  normal: number;
  /** Identity-verified player (no coach toggle). Default 1.25. */
  identityVerified: number;
  /** Approved coach using the coach toggle. Default 2.00. */
  coach: number;
  /** Identity-verified coach using the coach toggle. Default 2.50. */
  identityVerifiedCoach: number;
}

export interface WeightInputs {
  /**
   * True only when the voucher is an approved Coach AND turned the coach toggle ON for this vouch.
   * Server must verify the Coach role before setting this true (§10.1).
   */
  usedCoachWeight: boolean;
  /** The VOUCHER's identity-verification status (not the target's). */
  voucherIdentityVerified: boolean;
}

/** Resolve the effective weight for a vouch from its inputs + the Admin weight settings. */
export function effectiveWeight(inputs: WeightInputs, weights: WeightSettings): number {
  if (inputs.usedCoachWeight) {
    return inputs.voucherIdentityVerified ? weights.identityVerifiedCoach : weights.coach;
  }
  return inputs.voucherIdentityVerified ? weights.identityVerified : weights.normal;
}
