/**
 * Vouch effective-weight model (handover §10.5). Weights are Admin settings (system_settings),
 * passed in here - NEVER hardcoded into domain logic. The chosen weight is copied onto each vouch
 * row as a calculation snapshot for auditability (§10.5), alongside the weight_rule_version.
 *
 * LOCKED invariants (non-negotiable, handover §3.3/§10.5):
 *  - Skill Verified status does NOT affect weight (avoids circular scoring).
 *  - Facebook does NOT affect weight.
 *  - Organizer role does NOT affect weight.
 * The four base rows above are unchanged. A fifth, admin-tunable factor on the same *source
 * credibility* axis was added in v1.67 (owner-directed amendment, master_plan §2AN, handover §10.5):
 * whether the voucher is a MINIMAL account - no profile photo, no approved identity verification, and
 * no active vouch received from anyone yet (`lib/vouches/voucher-power.ts`). Skill-Verified, Facebook,
 * and Organizer role still never affect weight - nothing above changes that.
 */

export const WEIGHT_RULE_VERSION = 'WEIGHT_V1.1';

export interface WeightSettings {
  /** Normal player. Default 1.00. */
  normal: number;
  /** Identity-verified player (no coach toggle). Default 1.25. */
  identityVerified: number;
  /** Approved coach using the coach toggle. Default 2.00. */
  coach: number;
  /** Identity-verified coach using the coach toggle. Default 2.50. */
  identityVerifiedCoach: number;
  /**
   * Fifth source-credibility factor (v1.67, §2AN). Multiplies whichever of the four rows above
   * applies when the voucher is a minimal account. Default 0.50; 1 disables it.
   */
  minimalAccountMultiplier: number;
}

export interface WeightInputs {
  /**
   * True only when the voucher is an approved Coach AND turned the coach toggle ON for this vouch.
   * Server must verify the Coach role before setting this true (§10.1).
   */
  usedCoachWeight: boolean;
  /** The VOUCHER's identity-verification status (not the target's). */
  voucherIdentityVerified: boolean;
  /**
   * True when the voucher is currently a MINIMAL account (v1.67, §2AN): no profile photo, no approved
   * identity verification, and no active vouch received from anyone yet. See
   * `lib/vouches/voucher-power.ts`. Optional/undefined behaves exactly like `false`.
   */
  voucherMinimalAccount?: boolean;
}

/** Resolve the effective weight for a vouch from its inputs + the Admin weight settings. */
export function effectiveWeight(inputs: WeightInputs, weights: WeightSettings): number {
  const base = inputs.usedCoachWeight
    ? inputs.voucherIdentityVerified
      ? weights.identityVerifiedCoach
      : weights.coach
    : inputs.voucherIdentityVerified
      ? weights.identityVerified
      : weights.normal;
  if (!inputs.voucherMinimalAccount) return base;
  // The vouches.effective_weight column is numeric(4,2) - round to match what is actually stored.
  return Math.round(base * weights.minimalAccountMultiplier * 100) / 100;
}
