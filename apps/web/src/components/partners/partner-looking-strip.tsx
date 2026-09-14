import type { PartnerLookingTournament } from '@/lib/partners/deck';

/**
 * The one-line status under each tournament name. It leads with the viewer's own state when they are
 * involved (entered / already searching), because that is the more actionable fact, then gives the
 * headcount of everyone else looking.
 *
 * The row layout this used to describe for (`PartnerLookingStrip`, the Players-directory "Looking
 * for a partner" section) was retired by master_plan §2BC in favour of the "Find a partner" door and
 * its `PartnerTournamentSheet` chooser, which reuses this same line for each tournament row.
 */
export function describe(t: PartnerLookingTournament): string {
  const others =
    t.lookingCount > 0
      ? `${t.lookingCount} player${t.lookingCount === 1 ? '' : 's'} looking`
      : null;

  if (t.viewerSearchOpen) {
    return others ? `You're looking here · ${others}` : "You're looking here";
  }
  if (t.viewerEntered) {
    return others ? `You're entered · ${others}` : "You're entered here";
  }
  return others ?? 'Be the first to look';
}
