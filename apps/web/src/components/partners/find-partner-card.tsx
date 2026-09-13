import { UserSearch } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';

/**
 * Tournament-page entry point (master_plan §2AV B) - replaces the global looking-for-partner toggle
 * on this page (that flag stays on the Players page, unchanged). One path only: this always links to
 * the deck page, which itself shows the opt-in panel when the viewer has no open search yet - no
 * modal here (Decision B). The caller computes the visibility gate (enabled, an open doubles division,
 * registration open, onboarded viewer) and simply omits this component otherwise - same pattern as
 * `PlayerCard`'s `showCommunitySkill`.
 */
export function FindPartnerCard({
  tournamentSlug,
  lookingCount,
  viewerSearchOpen,
  openMatches,
}: {
  tournamentSlug: string;
  lookingCount: number;
  viewerSearchOpen: boolean;
  openMatches: number;
}) {
  const href = `/tournaments/${tournamentSlug}/partners`;

  return (
    <div className="border-border bg-surface rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <UserSearch size={16} className="text-primary" aria-hidden />
            Find a partner
          </p>
          <p className="text-foreground-muted mt-0.5 text-xs">
            {lookingCount > 0
              ? `${lookingCount} player${lookingCount === 1 ? '' : 's'} ${
                  lookingCount === 1 ? 'is' : 'are'
                } looking for a partner`
              : 'Be the first to look for a partner'}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {viewerSearchOpen && openMatches > 0 && (
            <span className="bg-primary/15 text-primary rounded-full px-2.5 py-1 text-xs font-semibold">
              {openMatches} match{openMatches === 1 ? '' : 'es'}
            </span>
          )}
          <ButtonLink href={href} variant={viewerSearchOpen ? 'secondary' : 'primary'}>
            {viewerSearchOpen ? "See who's looking" : 'Find a partner'}
          </ButtonLink>
        </span>
      </div>
    </div>
  );
}
