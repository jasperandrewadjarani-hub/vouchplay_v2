/**
 * Pure, advisory relevance of a club offer to a player (Phase 14A). Targeting only sorts and labels
 * the player browse; it NEVER blocks a response and never touches eligibility or scoring. A player may
 * always respond to any open offer they can see.
 */

export interface OfferTarget {
  city: string | null;
  minSkill: number | null;
  maxSkill: number | null;
}

export interface PlayerContext {
  city: string | null;
  /** Effective skill ordinal (community if known, else self-rated), or null. */
  skill: number | null;
}

export interface OfferRelevance {
  /** Higher is more relevant; used only for sorting the browse list. */
  score: number;
  cityMatch: boolean;
  skillMatch: boolean;
  /** Short, non-blocking label for the card. */
  label: string;
}

function sameCity(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function skillInRange(skill: number | null, min: number | null, max: number | null): boolean {
  if (skill == null) return false;
  if (min != null && skill < min) return false;
  if (max != null && skill > max) return false;
  return min != null || max != null;
}

export function offerRelevanceToPlayer(target: OfferTarget, player: PlayerContext): OfferRelevance {
  const cityMatch = sameCity(target.city, player.city);
  const skillMatch = skillInRange(player.skill, target.minSkill, target.maxSkill);
  const untargeted = !target.city && target.minSkill == null && target.maxSkill == null;
  const score = (cityMatch ? 2 : 0) + (skillMatch ? 1 : 0);
  const label = cityMatch
    ? 'In your city'
    : skillMatch
      ? 'Matches your level'
      : untargeted
        ? 'Open to all'
        : 'Worth a look';
  return { score, cityMatch, skillMatch, label };
}
