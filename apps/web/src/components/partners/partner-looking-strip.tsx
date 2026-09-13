import Link from 'next/link';
import { UserSearch, ChevronRight } from 'lucide-react';
import type { PartnerLookingTournament } from '@/lib/partners/deck';

/**
 * The Players-directory "Looking for a partner" strip (master_plan §2AV, directory follow-up).
 *
 * A discovery aid that sits before the funnel: it names the tournaments where players are looking
 * for a partner right now and links each straight to that tournament's deck. Ordering is decided by
 * the reader (the viewer's own tournaments first). The whole strip is omitted when there is nothing
 * to show, so it never adds empty chrome to the directory - the caller renders it only when the
 * list is non-empty.
 */
export function PartnerLookingStrip({ tournaments }: { tournaments: PartnerLookingTournament[] }) {
  if (tournaments.length === 0) return null;

  return (
    <section
      aria-labelledby="partner-looking-heading"
      className="border-border bg-surface overflow-hidden rounded-2xl border"
    >
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        <UserSearch size={16} className="text-primary" aria-hidden />
        <h2 id="partner-looking-heading" className="text-foreground text-sm font-semibold">
          Looking for a partner
        </h2>
      </div>
      <ul className="divide-border divide-y">
        {tournaments.map((t) => (
          <li key={t.slug}>
            <Link
              href={`/tournaments/${t.slug}/partners`}
              className="hover:bg-surface-muted flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors"
            >
              <span className="min-w-0 flex-1">
                <span className="text-foreground block truncate text-sm font-medium">{t.name}</span>
                <span className="text-foreground-muted block truncate text-xs">{describe(t)}</span>
              </span>
              {t.viewerSearchOpen ? (
                <span className="bg-primary/15 text-primary shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold">
                  Open my deck
                </span>
              ) : (
                <span className="text-primary shrink-0 text-xs font-semibold">Find a partner</span>
              )}
              <ChevronRight size={16} className="text-foreground-muted shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The one-line status under each tournament name. It leads with the viewer's own state when they are
 * involved (entered / already searching), because that is the more actionable fact, then gives the
 * headcount of everyone else looking.
 */
function describe(t: PartnerLookingTournament): string {
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
