import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

/** Mirrors `listPartnerSearchers`'s return shape (`@/lib/partners/deck`, a parallel lane) structurally
 *  rather than by import, so this component compiles against the contract before that lane lands. */
export interface PartnerSearcherRow {
  slug: string;
  displayName: string;
  divisions: string[];
  hasSeat: boolean;
}

/**
 * Organizer-side "Looking for partners" (master_plan §2AV H) - a compact, collapsed-by-default list
 * inside Manage → Registrations. Organizer "Suggest partner" is deferred; this is read-only.
 */
export function PartnerSearchersPanel({
  count,
  players,
  slug,
}: {
  count: number;
  players: PartnerSearcherRow[];
  /** Tournament slug, for the announcement shortcut into Manage → Announcements. */
  slug: string;
}) {
  if (count === 0) return null;
  return (
    <details className="group border-border bg-surface rounded-xl border p-3.5">
      <summary className="text-foreground flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
        Looking for partners ({count})
        <ChevronDown
          size={16}
          className="text-foreground-muted shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-3 space-y-3">
        <ul className="border-border divide-border divide-y overflow-hidden rounded-lg border">
          {players.map((p) => (
            <li key={p.slug} className="flex items-center justify-between gap-2 p-2.5 text-sm">
              <span className="min-w-0">
                <Link
                  href={`/players/${p.slug}`}
                  className="text-foreground truncate font-medium hover:underline"
                >
                  {p.displayName}
                </Link>
                <span className="text-foreground-muted block truncate text-xs">
                  {p.divisions.join(', ')}
                </span>
              </span>
              {p.hasSeat && (
                <span className="bg-success/15 text-success shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  Has a seat
                </span>
              )}
            </li>
          ))}
        </ul>
        <Link
          href={`/tournaments/${slug}/manage#announcements`}
          className="text-primary text-xs font-medium hover:underline"
        >
          Post an announcement
        </Link>
      </div>
    </details>
  );
}
