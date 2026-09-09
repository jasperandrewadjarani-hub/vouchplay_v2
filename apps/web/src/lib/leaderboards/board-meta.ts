import type { LeaderboardCategory } from '@vouchplay/core';

/**
 * One source of truth for how each board presents itself.
 *
 * The tab label and the board title are deliberately allowed to differ: the tab says "Top
 * Contributors" because that is what a newcomer scanning three tabs understands, while the board
 * keeps its product name "Community Champions" with the locked "Ranked on vouches given" line
 * (handover §1L). The tab is wayfinding, the heading is identity. Both live here so the entry card
 * on Players, the tab strip, and the panel itself cannot drift apart.
 */

export interface BoardMeta {
  category: LeaderboardCategory;
  /** Short label for the tab strip. */
  tabLabel: string;
  /** The board's own name, used as its heading. */
  title: string;
  /** One plain line stating what the board ranks. A title alone does not say that. */
  subtitle: string;
  /** What a person who is not on this board should go and do. */
  cta: { href: string; label: string };
  /** Plural noun for the ranked subjects, used in the stat tiles. */
  unit: string;
  /** Why someone would want to be on it, in one short sentence. */
  hook: string;
}

export const BOARDS: readonly BoardMeta[] = [
  {
    category: 'players',
    tabLabel: 'Top Players',
    title: 'Top Players',
    subtitle: 'Ranked on verified tournament play and official placements.',
    cta: { href: '/tournaments', label: 'Find a tournament' },
    unit: 'players',
    hook: 'Play a tournament to appear here.',
  },
  {
    category: 'community',
    tabLabel: 'Top Contributors',
    title: 'Community Champions',
    subtitle: 'Ranked on vouches given - the players who help build other profiles.',
    cta: { href: '/players', label: 'Find someone you genuinely know' },
    unit: 'contributors',
    hook: 'Vouch for players you have genuinely played with to appear here.',
  },
  {
    category: 'clubs',
    tabLabel: 'Top Clubs',
    title: 'Top Clubs',
    subtitle: 'Ranked on verified club representation across tournaments.',
    cta: { href: '/clubs', label: 'Find a club' },
    unit: 'clubs',
    hook: 'Represent a club at a tournament to appear here.',
  },
] as const;

export function boardMeta(category: LeaderboardCategory): BoardMeta {
  return BOARDS.find((board) => board.category === category) ?? BOARDS[0]!;
}

/** The canonical URL for a board. Each board has its own address, so it is shareable. */
export function boardHref(category: LeaderboardCategory): string {
  return `/leaderboards?category=${category}`;
}

/**
 * Podium presentation for the top three. Rank is carried by the medal name, the tone, the icon and
 * the numeral together, never by colour alone (handover §34A).
 */
export const PODIUM = [
  { rank: 1, medal: 'Gold', ring: 'ring-amber-400', text: 'text-amber-500' },
  { rank: 2, medal: 'Silver', ring: 'ring-slate-400', text: 'text-slate-400' },
  { rank: 3, medal: 'Bronze', ring: 'ring-orange-400', text: 'text-orange-500' },
] as const;

export function podiumStyle(rank: number) {
  return PODIUM.find((p) => p.rank === rank) ?? null;
}

/**
 * Does this board have anything real to rank yet?
 *
 * The Players board scores `participation`, `placement`, `profile` and `skillVerified`. Before any
 * tournament results exist the first two are zero for everyone, so the ranking collapses onto profile
 * completeness while the heading promises "verified tournament play and official placements". That is
 * a ranking making an untrue statement about real people, so the board withholds its list until at
 * least one entry has competitive evidence.
 *
 * The test runs on the published snapshot rather than on a flag, so the board opens by itself on the
 * first snapshot after an organizer awards a placement. Nobody has to remember to switch it on.
 *
 * Community and Clubs are unaffected: contribution and representation are earned from the first row.
 */
export function hasCompetitiveEvidence(
  category: LeaderboardCategory,
  entries: readonly { components: Record<string, number> }[],
): boolean {
  if (category !== 'players') return true;
  return entries.some(
    (entry) => (entry.components.participation ?? 0) > 0 || (entry.components.placement ?? 0) > 0,
  );
}
