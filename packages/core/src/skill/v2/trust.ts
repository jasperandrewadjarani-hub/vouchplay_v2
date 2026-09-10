/**
 * Voucher trust `VT(u)` in [0,1] (master_plan §2AF.1).
 *
 * WHY: V1 treats every vouch as equally credible (flat credential weight only), so N fake or
 * coordinated accounts count as N real opinions. VT answers "how much should this WITNESS's word be
 * worth at all", independent of what they said - built only from signals a fresh Sybil account cannot
 * cheaply forge (a real-world anchor, or standing earned from OTHER accounts' vouches) plus a mild
 * account-age factor. This is the first of the two independence levers (the second is `independence.ts`).
 */

import type { V2Params, V2Voucher } from './types';

/** `min(1, ratio)` that treats a non-positive divisor as "already saturated" instead of NaN/Infinity. */
function saturatedRatio(numerator: number, divisor: number): number {
  if (!(divisor > 0)) return numerator > 0 ? 1 : 0;
  if (!(numerator > 0)) return 0;
  return Math.min(1, numerator / divisor);
}

/**
 * `VT = maturity * (anchored ? 1 : (standing > 0 ? unanchoredFactor + (1-unanchoredFactor)*standingComponent : unknownFactor))`,
 * per §2AF.1. Malformed inputs (NaN, negative age/standing) are treated as 0 rather than propagating
 * NaN through the aggregation - a corrupt fact should make a voucher look untrusted, never crash.
 */
export function voucherTrust(u: V2Voucher, p: V2Params): number {
  const accountAgeDays =
    Number.isFinite(u.accountAgeDays) && u.accountAgeDays > 0 ? u.accountAgeDays : 0;
  const standingRaw = Number.isFinite(u.standingRaw) && u.standingRaw > 0 ? u.standingRaw : 0;

  const maturity = 0.5 + 0.5 * saturatedRatio(accountAgeDays, p.trustMaturityDays);
  const standingComponent = saturatedRatio(standingRaw, p.trustStandingSaturation);

  const anchoredFactor = u.anchored
    ? 1
    : standingRaw > 0
      ? p.trustUnanchoredFactor + (1 - p.trustUnanchoredFactor) * standingComponent
      : p.trustUnknownFactor;

  const vt = maturity * anchoredFactor;
  if (!Number.isFinite(vt)) return 0;
  return Math.min(1, Math.max(0, vt));
}
