import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

/** Mirrors `getViewerUnpaidSlots()`'s return shape (master_plan §2AP F) - not imported as a type so
 *  this component only needs the shape, not the server-only module itself. */
export interface UnpaidSlotsSummary {
  count: number;
  first: { tournamentName: string; slug: string; registrationId: string | null } | null;
}

/**
 * Unpaid-slot banner (master_plan §2AS Finding 4/Decision B): the first link in the app-shell's
 * mutually-exclusive nudge chain, ahead of every reputation strip - an unsecured slot can lapse and
 * cost the player their place outright, which outranks "your vouches count for less right now". Reads
 * as a warning, not advice: white on `--danger`, one line, no wrap - a call to action to pay and
 * secure the slot, not a suggestion.
 */
export function UnpaidSlotStrip({ summary }: { summary: UnpaidSlotsSummary }) {
  if (!summary.first) return null;
  const href = summary.first.registrationId
    ? `/tournaments/${summary.first.slug}?entered=${summary.first.registrationId}#my-registrations`
    : `/tournaments/${summary.first.slug}`;
  return (
    <div className="bg-danger border-b border-black/10">
      <div className="mx-auto flex min-h-11 w-full max-w-6xl items-center gap-2 px-4 text-white">
        <ShieldAlert size={16} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs font-medium sm:text-sm">
          {summary.count > 1
            ? `You have ${summary.count} unsecured slots`
            : `Your slot for ${summary.first.tournamentName} isn't secured`}
        </span>
        <Link
          href={href}
          className="text-danger inline-flex h-8 shrink-0 items-center rounded-full bg-white px-3 text-xs font-semibold"
        >
          Pay now
        </Link>
      </div>
    </div>
  );
}
