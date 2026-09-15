/**
 * Cache tags for player data, in a dependency-free module (master_plan §2BL review).
 *
 * `lib/players/queries.ts` imports `lib/badges/queries.ts` (badges on cards, badge filter), and the badge
 * readers need the players-list tag for their own caches. Keeping the tags here breaks that import cycle.
 * `lib/players/queries.ts` re-exports them, so existing imports keep working.
 */
export const PLAYERS_LIST_TAG = 'players:list';
export const playerTag = (slug: string) => `player:${slug}`;
export const commentsTag = (id: string) => `player-comments:${id}`;
