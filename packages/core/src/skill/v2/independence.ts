/**
 * Independence `IND(v)` in (0,1] (master_plan §2AF.2) - the second lever, alongside `trust.ts`, that
 * turns "N vouches" into "how much NEW evidence is this".
 *
 * WHY: a lone fake witness is caught by low VT, but a coordinated GROUP of real-looking accounts (a
 * club "gang") each individually clears VT. Independence collapses a block of same-club voices toward
 * a handful of independent-equivalents: reciprocal (mutual) vouches are discounted outright, and within
 * a club bloc each additional voice - ordered by trust, most-credible first - is worth geometrically
 * less (`blocDecay^rank`), capping any bloc's total contribution at `1/(1-blocDecay)` regardless of
 * size (default 0.6 -> 2.5). This is the direct counter to the "12 club-mates vouch a rival up" attack
 * documented in §2AF's worked example.
 */

import type { V2Params, V2Voucher, V2Vouch } from './types';

/**
 * Assigns each VOUCHER (propagated to every vouch they gave on this target) to at most one club - the
 * club, among the voucher's own memberships, that supplies the most vouches on this same target. Ties
 * resolve to the smallest club id (deterministic, §2AF.2: "greedy, deterministic by club id"). A
 * voucher with no club memberships is left unassigned (`null`) and receives no bloc decay - bloc decay
 * only ever discounts a club-coordinated bloc, never a clubless individual.
 *
 * Exported separately (not inlined into `independence`) so tests can assert the assignment itself,
 * independent of the decay math.
 */
export function assignBlocs(
  vouches: V2Vouch[],
  vouchers: Map<string, V2Voucher>,
): Map<string, string | null> {
  // How many vouches on this target come from a voucher who is a member of each club - the raw
  // "bloc size" a voucher's own clubs compete on.
  const clubVouchCounts = new Map<string, number>();
  for (const vouch of vouches) {
    const voucher = vouchers.get(vouch.voucherId);
    if (!voucher) continue;
    for (const clubId of voucher.clubIds) {
      clubVouchCounts.set(clubId, (clubVouchCounts.get(clubId) ?? 0) + 1);
    }
  }

  const voucherClubAssignment = new Map<string, string | null>();
  const result = new Map<string, string | null>();

  for (const vouch of vouches) {
    let assigned = voucherClubAssignment.get(vouch.voucherId);
    if (assigned === undefined) {
      const voucher = vouchers.get(vouch.voucherId);
      let bestClubId: string | null = null;
      let bestCount = -1;
      for (const clubId of voucher?.clubIds ?? []) {
        const count = clubVouchCounts.get(clubId) ?? 0;
        if (
          count > bestCount ||
          (count === bestCount && bestClubId !== null && clubId < bestClubId)
        ) {
          bestCount = count;
          bestClubId = clubId;
        }
      }
      assigned = bestClubId;
      voucherClubAssignment.set(vouch.voucherId, assigned);
    }
    result.set(vouch.id, assigned);
  }

  return result;
}

/**
 * Full independence multiplier per vouch: reciprocal discount, then club-bloc geometric decay. Pure
 * function of the already-computed `trust` map (VT is what orders a bloc, most-credible voice first)
 * so this module never recomputes trust itself.
 */
export function independence(
  vouches: V2Vouch[],
  vouchers: Map<string, V2Voucher>,
  trust: Map<string, number>,
  p: V2Params,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const vouch of vouches) {
    result.set(vouch.id, vouch.reciprocal ? p.reciprocalMultiplier : 1);
  }

  const blocs = assignBlocs(vouches, vouchers);
  const grouped = new Map<string, V2Vouch[]>();
  for (const vouch of vouches) {
    const clubId = blocs.get(vouch.id);
    if (!clubId) continue; // unassigned (clubless) vouchers get no bloc decay
    const list = grouped.get(clubId);
    if (list) {
      list.push(vouch);
    } else {
      grouped.set(clubId, [vouch]);
    }
  }

  for (const list of grouped.values()) {
    const ordered = [...list].sort((a, b) => {
      const trustDiff = (trust.get(b.voucherId) ?? 0) - (trust.get(a.voucherId) ?? 0);
      if (trustDiff !== 0) return trustDiff;
      // Deterministic tie-break, ordinary string comparison (not locale-sensitive localeCompare).
      if (a.voucherId < b.voucherId) return -1;
      if (a.voucherId > b.voucherId) return 1;
      return 0;
    });
    ordered.forEach((vouch, rank) => {
      const current = result.get(vouch.id) ?? 1;
      result.set(vouch.id, current * Math.pow(p.blocDecay, rank));
    });
  }

  return result;
}
