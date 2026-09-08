/**
 * Demand keys for a tournament's OWN divisions (Phase 14 follow-up).
 *
 * Interest is normally collected against the fixed planning taxonomy in `demand-interest.ts`. Once an
 * organizer has configured real divisions, the options must follow those instead, so the counts they
 * see map onto the event they are actually running. Stored keys must satisfy the column/RPC pattern
 * `^[a-z0-9_]{3,64}$`, which a raw UUID fails on its hyphens - so a division key is the id with the
 * hyphens stripped and a `div_` prefix. That is stable, reversible, and needs no schema change.
 */

const PREFIX = 'div_';
const HEX32 = /^[0-9a-f]{32}$/;

/** `div_` + the division uuid with hyphens removed. Returns null for a malformed id. */
export function demandKeyForDivision(divisionId: string): string | null {
  const compact = divisionId.trim().toLowerCase().replace(/-/g, '');
  return HEX32.test(compact) ? `${PREFIX}${compact}` : null;
}

export function isDivisionDemandKey(key: string): boolean {
  return key.startsWith(PREFIX) && HEX32.test(key.slice(PREFIX.length));
}

/** True when this key refers to that division. Compares on the compact form, so callers never need
 *  to reassemble a uuid. */
export function demandKeyMatchesDivision(key: string, divisionId: string): boolean {
  const expected = demandKeyForDivision(divisionId);
  return expected !== null && expected === key;
}
