import 'server-only';

/**
 * Intentional §16A boundary. There is no bid source table yet, so this adapter always returns an
 * unavailable state and never invents rows. The UI must remain hidden behind the false-by-default
 * leaderboard_most_bidded_enabled flag until Gamified Bidding ships.
 */
export async function getMostBiddedAdapter(): Promise<{
  available: false;
  entries: never[];
  reason: 'BIDDING_NOT_IMPLEMENTED';
}> {
  return { available: false, entries: [], reason: 'BIDDING_NOT_IMPLEMENTED' };
}
