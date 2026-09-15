/**
 * Badge catalog (master_plan §2BK).
 *
 * The catalog is fixed vocabulary - names, families, art parameters and rarity. Every NUMBER a rule uses
 * (title counts, windows, cut-offs) is an Admin setting in `settings.ts` (group `badges`), never here.
 *
 * Visual language: the frame shape is the family, the metal is the badge, the rim is the rarity. Because
 * shape carries meaning, badges stay readable without colour and at 16 px.
 *
 * Badges are recognition only. They never affect STS, vouch weight, eligibility or Skill Verified.
 */

export type BadgeFamily = 'glory' | 'community' | 'growth' | 'roles' | 'special';
export type BadgeFrame = 'shield' | 'medal' | 'hex' | 'tile' | 'star';
export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type BadgeMetal =
  | 'gold'
  | 'silver'
  | 'bronze'
  | 'teal'
  | 'cyan'
  | 'blue'
  | 'copper'
  | 'pink'
  | 'lime'
  | 'green'
  | 'violet'
  | 'indigo'
  | 'slate'
  | 'rose'
  | 'onyx'
  | 'amethyst'
  | 'sky'
  | 'ember';
export type BadgeGlyph =
  | 'trophy'
  | 'crown'
  | 'medal'
  | 'star'
  | 'hands'
  | 'calendar'
  | 'spark'
  | 'voice'
  | 'flag'
  | 'og'
  | 'captain'
  | 'rings'
  | 'trend'
  | 'chevrons'
  | 'proven'
  | 'cap'
  | 'clipboard'
  | 'whistle'
  | 'megaphone'
  | 'laurel'
  | 'gem'
  | 'ticket';

export interface BadgeFamilyDef {
  key: BadgeFamily;
  name: string;
  frame: BadgeFrame;
  description: string;
}

export const BADGE_FAMILIES: Record<BadgeFamily, BadgeFamilyDef> = {
  glory: {
    key: 'glory',
    name: 'Glory',
    frame: 'shield',
    description: 'Official tournament results',
  },
  community: {
    key: 'community',
    name: 'Community',
    frame: 'medal',
    description: 'How you show up for others',
  },
  growth: { key: 'growth', name: 'Growth', frame: 'hex', description: 'Your game moving forward' },
  roles: { key: 'roles', name: 'Roles', frame: 'tile', description: 'What you do in the scene' },
  special: {
    key: 'special',
    name: 'Special',
    frame: 'star',
    description: 'Admin honours, rare by design',
  },
};

/** [light, mid, dark] - light draws the glyph and the rare/legendary inner rim; mid → dark fills. */
export const BADGE_METALS: Record<BadgeMetal, readonly [string, string, string]> = {
  gold: ['#fde68a', '#f59e0b', '#92400e'],
  silver: ['#f1f5f9', '#94a3b8', '#334155'],
  bronze: ['#fed7aa', '#c2703d', '#5c2a0e'],
  teal: ['#99f6e4', '#14b8a6', '#134e4a'],
  cyan: ['#a5f3fc', '#06b6d4', '#164e63'],
  blue: ['#bfdbfe', '#3b82f6', '#1e3a8a'],
  copper: ['#fecaca', '#d9774a', '#6b2410'],
  pink: ['#fbcfe8', '#ec4899', '#831843'],
  lime: ['#ecfccb', '#84cc16', '#365314'],
  green: ['#bbf7d0', '#22c55e', '#14532d'],
  violet: ['#ddd6fe', '#8b5cf6', '#3b0764'],
  indigo: ['#c7d2fe', '#6366f1', '#312e81'],
  slate: ['#e2e8f0', '#64748b', '#1e293b'],
  rose: ['#fecdd3', '#f43f5e', '#881337'],
  onyx: ['#fde68a', '#1f2937', '#030712'],
  amethyst: ['#f5d0fe', '#c026d3', '#4a044e'],
  sky: ['#e0f2fe', '#38bdf8', '#0c4a6e'],
  ember: ['#fed7aa', '#ea580c', '#431407'],
};

export const BADGE_RARITY_RANK: Record<BadgeRarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export interface BadgeDef {
  /** Stable key stored in `player_badges.badge_key`. Event badges are `event:<tournamentId>`. */
  key: string;
  name: string;
  family: BadgeFamily;
  metal: BadgeMetal;
  glyph: BadgeGlyph;
  rarity: BadgeRarity;
  /** How the badge is normally obtained. Admins can still tag and untag ANY badge (§2BK B). */
  normally: 'auto' | 'grant';
  /** A tournament title: an admin tag must name the event (covers events outside VouchPlay). */
  titleBadge: boolean;
  /** Carries an expiry from its rule (e.g. Champion 12 months, Rising 30 days). */
  timeBound: boolean;
  /** Rendered on the avatar (crown) instead of in the card's badge row. */
  avatarOnly?: boolean;
  /** One short sentence shown when the rule's numbers are not needed. Numbers come from settings. */
  summary: string;
}

export const BADGES: readonly BadgeDef[] = [
  {
    key: 'champion',
    name: 'Champion',
    family: 'glory',
    metal: 'gold',
    glyph: 'trophy',
    rarity: 'rare',
    normally: 'auto',
    titleBadge: true,
    timeBound: true,
    summary: 'Won an official tournament title.',
  },
  {
    key: 'legend',
    name: 'Legend',
    family: 'glory',
    metal: 'gold',
    glyph: 'crown',
    rarity: 'legendary',
    normally: 'auto',
    titleBadge: true,
    timeBound: false,
    summary: 'Won several official championships.',
  },
  {
    key: 'podium',
    name: 'Podium',
    family: 'glory',
    metal: 'silver',
    glyph: 'medal',
    rarity: 'common',
    normally: 'auto',
    titleBadge: true,
    timeBound: true,
    summary: 'Finished 2nd or 3rd in an official tournament.',
  },
  {
    key: 'mvp',
    name: 'MVP',
    family: 'glory',
    metal: 'gold',
    glyph: 'star',
    rarity: 'epic',
    normally: 'auto',
    titleBadge: true,
    timeBound: false,
    summary: 'Named MVP by a tournament organizer.',
  },
  {
    key: 'fairplay',
    name: 'Fair Play',
    family: 'glory',
    metal: 'teal',
    glyph: 'hands',
    rarity: 'rare',
    normally: 'auto',
    titleBadge: true,
    timeBound: false,
    summary: 'Received an official Sportsmanship award.',
  },
  {
    key: 'regular',
    name: 'Tour Regular',
    family: 'glory',
    metal: 'bronze',
    glyph: 'calendar',
    rarity: 'common',
    normally: 'auto',
    titleBadge: false,
    timeBound: false,
    summary: 'Keeps showing up to official tournaments.',
  },

  {
    key: 'top_contributor',
    name: 'Top Contributor',
    family: 'community',
    metal: 'cyan',
    glyph: 'spark',
    rarity: 'epic',
    normally: 'auto',
    titleBadge: false,
    timeBound: false,
    summary: 'Among the top contributors this season.',
  },
  {
    key: 'trusted_voice',
    name: 'Trusted Voice',
    family: 'community',
    metal: 'blue',
    glyph: 'voice',
    rarity: 'rare',
    normally: 'auto',
    titleBadge: false,
    timeBound: false,
    summary: 'Gives many honest, standing vouches.',
  },
  {
    key: 'pioneer',
    name: 'Pioneer',
    family: 'community',
    metal: 'copper',
    glyph: 'flag',
    rarity: 'epic',
    normally: 'auto',
    titleBadge: false,
    timeBound: false,
    summary: 'One of the first players on VouchPlay.',
  },
  {
    key: 'og',
    name: 'OG',
    family: 'community',
    metal: 'ember',
    glyph: 'og',
    rarity: 'legendary',
    normally: 'grant',
    titleBadge: false,
    timeBound: false,
    summary: 'In the scene for years, playing before most others started.',
  },
  {
    key: 'captain',
    name: 'Club Captain',
    family: 'community',
    metal: 'sky',
    glyph: 'captain',
    rarity: 'common',
    normally: 'auto',
    titleBadge: false,
    timeBound: false,
    summary: 'Runs a club on VouchPlay.',
  },
  {
    key: 'matchmaker',
    name: 'Matchmaker',
    family: 'community',
    metal: 'pink',
    glyph: 'rings',
    rarity: 'common',
    normally: 'auto',
    titleBadge: false,
    timeBound: false,
    summary: 'Swipe matches that made it to a tournament.',
  },

  {
    key: 'rising',
    name: 'Rising',
    family: 'growth',
    metal: 'lime',
    glyph: 'trend',
    rarity: 'rare',
    normally: 'auto',
    titleBadge: false,
    timeBound: true,
    summary: 'One of the fastest climbers this month.',
  },
  {
    key: 'level_up',
    name: 'Level Up',
    family: 'growth',
    metal: 'green',
    glyph: 'chevrons',
    rarity: 'common',
    normally: 'auto',
    titleBadge: false,
    timeBound: true,
    summary: 'Community skill moved up a tier.',
  },
  {
    key: 'proven',
    name: 'Proven',
    family: 'growth',
    metal: 'teal',
    glyph: 'proven',
    rarity: 'common',
    normally: 'auto',
    titleBadge: false,
    timeBound: false,
    summary: 'Rating backed by many different players.',
  },
  {
    key: 'tier_crown',
    name: 'Top of Tier',
    family: 'growth',
    metal: 'gold',
    glyph: 'crown',
    rarity: 'epic',
    normally: 'auto',
    titleBadge: false,
    timeBound: true,
    avatarOnly: true,
    summary: 'Highest STS in their skill tier.',
  },

  {
    key: 'coach',
    name: 'Coach',
    family: 'roles',
    metal: 'violet',
    glyph: 'cap',
    rarity: 'rare',
    normally: 'auto',
    titleBadge: false,
    timeBound: false,
    summary: 'Approved coach on VouchPlay.',
  },
  {
    key: 'organizer',
    name: 'Organizer',
    family: 'roles',
    metal: 'indigo',
    glyph: 'clipboard',
    rarity: 'rare',
    normally: 'auto',
    titleBadge: false,
    timeBound: false,
    summary: 'Runs tournaments on VouchPlay.',
  },
  {
    key: 'referee',
    name: 'Referee',
    family: 'roles',
    metal: 'slate',
    glyph: 'whistle',
    rarity: 'common',
    normally: 'grant',
    titleBadge: false,
    timeBound: false,
    summary: 'Officiates matches.',
  },
  {
    key: 'ambassador',
    name: 'Ambassador',
    family: 'roles',
    metal: 'rose',
    glyph: 'megaphone',
    rarity: 'rare',
    normally: 'grant',
    titleBadge: false,
    timeBound: false,
    summary: 'Grows the scene in their city.',
  },

  {
    key: 'hof',
    name: 'Hall of Fame',
    family: 'special',
    metal: 'onyx',
    glyph: 'laurel',
    rarity: 'legendary',
    normally: 'grant',
    titleBadge: false,
    timeBound: false,
    summary: 'Lasting impact on Philippine pickleball.',
  },
  {
    key: 'supporter',
    name: 'Supporter',
    family: 'special',
    metal: 'amethyst',
    glyph: 'gem',
    rarity: 'epic',
    normally: 'grant',
    titleBadge: false,
    timeBound: false,
    summary: 'Backs the community as a sponsor or patron.',
  },
] as const;

/** Template for `event:<tournamentId>` commemorative badges; the name comes from the stored meta label. */
export const EVENT_BADGE: BadgeDef = {
  key: 'event',
  name: 'Event badge',
  family: 'special',
  metal: 'bronze',
  glyph: 'ticket',
  rarity: 'common',
  normally: 'auto',
  titleBadge: false,
  timeBound: false,
  summary: 'Entered a flagship tournament.',
};

export const EVENT_BADGE_PREFIX = 'event:';

export function isEventBadgeKey(key: string): boolean {
  return key.startsWith(EVENT_BADGE_PREFIX);
}

/** Resolve a stored key to its definition (event badges share one template). Null for unknown keys. */
export function badgeDef(key: string): BadgeDef | null {
  if (isEventBadgeKey(key)) return EVENT_BADGE;
  return BADGES.find((b) => b.key === key) ?? null;
}

/** Keys of every catalog badge (excluding per-tournament event keys). */
export const BADGE_KEYS: readonly string[] = BADGES.map((b) => b.key);
