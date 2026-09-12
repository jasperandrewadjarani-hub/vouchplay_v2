import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

/** Mirrors `getViewerUnpaidSlots()`'s return shape (master_plan §2AP F) - not imported as a type so
 *  this component only needs the shape, not the server-only module itself. */
export interface UnpaidSlotsSummary {
  count: number;
  first: { tournamentName: string; slug: string; registrationId: string | null } | null;
}

/**
 * Unpaid-slot banner (master_plan §2AP F): the first link in the app-shell's mutually-exclusive nudge
 * chain, ahead of every reputation strip - an unsecured slot can lapse and cost the player their place
 * outright, which outranks "your vouches count for less right now". Same amber strip style as
 * `MinimalPowerStrip` in `app-shell.tsx` so the chain reads as one system even though only one link is
 * ever visible at a time.
 */
export function UnpaidSlotStrip({ summary }: { summary: UnpaidSlotsSummary }) {
  if (!summary.first) return null;
  const href = summary.first.registrationId
    ? `/tournaments/${summary.first.slug}?entered=${summary.first.registrationId}#my-registrations`
    : `/tournaments/${summary.first.slug}`;
  return (
    <div className="border-warning/40 bg-warning/10 border-b">
      <div className="text-foreground mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-xs sm:text-sm">
        <ShieldAlert size={16} className="text-warning shrink-0" aria-hidden />
        <span className="min-w-0">
          {summary.count > 1 ? (
            <>You have {summary.count} unsecured slots - </>
          ) : (
            <>Your slot for {summary.first.tournamentName} isn&rsquo;t secured yet - </>
          )}
          <Link
            href={href}
            className="text-warning inline-flex min-h-11 items-center font-semibold underline underline-offset-2"
          >
            Pay now
          </Link>
        </span>
      </div>
    </div>
  );
}
