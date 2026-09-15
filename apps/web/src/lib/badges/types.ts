/**
 * Shared badge shapes (master_plan §2BK). Plain types, safe to import from client and server code.
 * Lanes: data/server produces these; badge UI, the Players tab and admin consume them.
 */

export interface BadgeMeta {
  /** Event / tournament name for title and event badges. */
  event?: string;
  division?: string;
  tournamentId?: string;
  /** Pioneer number (1-based). */
  number?: number;
  /** Community skill band key for `tier_crown` / `level_up`. */
  tier?: string;
  /** Tour Regular level: 1 (5 events), 2 (15), 3 (30). */
  level?: number;
  /** Podium medal. */
  medal?: 'silver' | 'bronze';
  /** Display label for `event:<tournamentId>` badges. */
  label?: string;
}

export interface BadgeView {
  /** `player_badges.id` */
  id: string;
  key: string;
  /** Resolved display name (event badges use `meta.label`). */
  name: string;
  /** Champion titles in window, events for Tour Regular, etc. Always >= 1. */
  tally: number;
  meta: BadgeMeta;
  awardedAt: string;
  expiresAt: string | null;
  source: 'auto' | 'grant';
  /** Only ever true in the owner's own views. */
  hidden: boolean;
  pinned: boolean;
}

export interface BadgeProgress {
  key: string;
  name: string;
  /** One short line: what is left to do, e.g. "2 more official titles". */
  hint: string;
  /** 0-100. */
  pct: number;
}

export interface BadgeCase {
  /** Live badges, card order (pinned → rarity → newest). Includes hidden ones only for the owner. */
  earned: BadgeView[];
  /** Owner only: expired badges. */
  past: BadgeView[];
  /** Owner only: up to 3 nearest locked badges. */
  progress: BadgeProgress[];
  pinnedKey: string | null;
}

/** Admin view of one player's badge rows, including revoked / blocked ones. */
export interface AdminPlayerBadge extends BadgeView {
  revokedAt: string | null;
  revokeReason: string | null;
  autoBlocked: boolean;
  grantedByName: string | null;
  grantReason: string | null;
}

export interface BadgeHolder {
  playerBadgeId: string;
  playerId: string;
  playerName: string;
  playerSlug: string | null;
  avatarUrl: string | null;
  source: 'auto' | 'grant';
  tally: number;
  meta: BadgeMeta;
  awardedAt: string;
  expiresAt: string | null;
}

/** The signed-in player's "Your game" card on the Players tab (§2BK F). */
export interface ViewerGame {
  displayName: string;
  nickname: string | null;
  initials: string;
  avatarUrl: string | null;
  slug: string | null;
  /** Community band key + label + colour, or null when unrated. */
  tier: { key: string; label: string; color: string } | null;
  sts: number | null;
  /** Players board rank with movement (positive = climbed), or null when not ranked. */
  rank: { position: number; delta: number | null } | null;
  uniqueVouchers: number;
  /** The Proven threshold (Admin setting) - the "trusted rating" target. */
  provenTarget: number;
  communityRatingPrivate: boolean;
}

export type BadgeActionResult = { ok: true; message?: string } | { ok: false; error: string };
