'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import type { PlayerSort } from '@/lib/players/filters';

/**
 * The directory "Sort by" control (master_plan §2AG A1, D6). Lives OUTSIDE the collapsible filter
 * sheet, next to the result count - sort is not a filter (§2B's own distinction: it does not narrow
 * WHO shows up, only the order), and D6's new-unvouched-first default is a deliberate community
 * nudge that needs to stay visible and easy to change, not buried behind a "Filters" tap.
 *
 * `sts_desc` only appears for staff (D3, §8.4: public sorts never expose trust confidence as a
 * ranking) - the option list itself, not just the server, is the first gate.
 */
const PUBLIC_OPTIONS: { value: PlayerSort; label: string }[] = [
  { value: 'new_unvouched', label: 'New & unvouched first' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name', label: 'Name A-Z' },
  { value: 'most_vouched', label: 'Most vouches' },
];
const STAFF_OPTION: { value: PlayerSort; label: string } = {
  value: 'sts_desc',
  label: 'Trust score (staff)',
};

export function SortSelect({ sort, staff }: { sort: PlayerSort; staff: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'new_unvouched') params.delete('sort');
    else params.set('sort', next);
    // Changing sort resets to page 1 - page 3 of a differently-ordered result is not the page the
    // viewer was looking at (the same rule `clearFilter` applies to every other filter change).
    params.delete('page');
    const qs = params.toString();
    // scroll:false (master_plan §2AN decision 1): re-sorting swaps the list in place, right below
    // this control - scrolling to the top would jump the viewer away from where they just clicked.
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const options = staff ? [...PUBLIC_OPTIONS, STAFF_OPTION] : PUBLIC_OPTIONS;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="player-sort" className="text-foreground-muted shrink-0 text-xs font-medium">
        Sort by
      </label>
      <div className="relative">
        <select
          id="player-sort"
          value={sort}
          disabled={pending}
          onChange={(e) => onChange(e.target.value)}
          className="border-border bg-surface text-foreground min-h-[44px] rounded-lg border py-1.5 pr-7 pl-2.5 text-sm disabled:opacity-60"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {pending && (
          <Loader2
            size={14}
            aria-hidden
            className="text-foreground-muted pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 animate-spin"
          />
        )}
      </div>
    </div>
  );
}
