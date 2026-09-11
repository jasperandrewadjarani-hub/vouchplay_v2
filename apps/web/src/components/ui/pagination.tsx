import Link from 'next/link';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { LinkSpinner } from './link-spinner';
import { PageLinkLabel } from './page-link-label';

/**
 * Numbered pagination shared by every browsable list (players, clubs).
 *
 * Design notes, because the previous version was two heavy buttons pinned to opposite edges with a
 * "Page 2 of 3" label marooned between them:
 *  - Numbers, so a reader can see how far the list goes and jump straight to a page.
 *  - One centred group instead of edge-pinned blocks, so the eye has a single target.
 *  - Unavailable Previous/Next stay in place, dimmed, rather than disappearing - a control that
 *    vanishes on page 1 makes the whole row jump the moment you paginate.
 *  - 44px touch targets throughout. The app sets a 14px root font, so rem-based Tailwind sizes come
 *    out 0.875x (`min-h-11` is 38.5px); these are pixel values on purpose.
 *  - Long lists collapse to first / current-1 / current / current+1 / last with ellipses, and the
 *    outer jump links hide below `sm` so the row can never wrap or overflow on a phone.
 *  - Every page link carries `scroll={false}` (master_plan §2AN decision 1): pagination changes the
 *    list IN PLACE, so the App Router default of scrolling to the top on navigation would jump the
 *    viewer away from the row of numbers they just tapped.
 */

const GAP = 'gap' as const;
type Slot = number | typeof GAP;

/** Page numbers to render, with ellipsis gaps once the list is longer than fits comfortably. */
function slotsFor(page: number, pageCount: number): Slot[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const first = 1;
  const last = pageCount;
  const start = Math.max(2, Math.min(page - 1, pageCount - 3));
  const end = Math.min(pageCount - 1, Math.max(page + 1, 4));
  const slots: Slot[] = [first];
  if (start > 2) slots.push(GAP);
  for (let n = start; n <= end; n++) slots.push(n);
  if (end < pageCount - 1) slots.push(GAP);
  slots.push(last);
  return slots;
}

const BOX =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-sm font-semibold';
const STEP = `${BOX} border-border bg-surface text-foreground hover:bg-surface-muted gap-1.5 border px-3`;

export function Pagination({
  page,
  pageCount,
  hrefFor,
  label = 'Pagination',
}: {
  page: number;
  pageCount: number;
  /** Builds the URL for a page, so each list keeps its own filters in the query string. */
  hrefFor: (page: number) => string;
  label?: string;
}) {
  if (pageCount <= 1) return null;
  const slots = slotsFor(page, pageCount);
  // On a phone, keep a window of at least THREE numbers around the current page (clamped to the
  // ends), so page 3 is always visible instead of just "1 2". Dedicated first/last jump buttons make
  // page 1 and the final page reachable in one tap even when they fall outside that window.
  const winStart = Math.max(1, Math.min(page - 1, pageCount - 2));
  const winEnd = Math.min(pageCount, winStart + 2);
  const hideOnMobile = (n: number) => slots.length > 3 && (n < winStart || n > winEnd);
  const atFirst = page <= 1;
  const atLast = page >= pageCount;

  return (
    <nav className="pt-2" aria-label={label}>
      <ul className="flex flex-wrap items-center justify-center gap-1.5">
        {/* Jump to the first page. Always present so it never shifts the row; dimmed on page 1. */}
        <li>
          {atFirst ? (
            <span className={`${STEP} opacity-40`} aria-disabled="true">
              <ChevronsLeft size={16} aria-hidden />
              <span className="sr-only">First page</span>
            </span>
          ) : (
            <Link href={hrefFor(1)} className={STEP} aria-label="First page" scroll={false}>
              <ChevronsLeft size={16} aria-hidden />
              <LinkSpinner />
            </Link>
          )}
        </li>
        <li>
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} className={STEP} rel="prev" scroll={false}>
              <ChevronLeft size={16} aria-hidden />
              <span className="hidden sm:inline">Previous</span>
              <span className="sr-only sm:hidden">Previous page</span>
              <LinkSpinner />
            </Link>
          ) : (
            <span className={`${STEP} opacity-40`} aria-disabled="true">
              <ChevronLeft size={16} aria-hidden />
              <span className="hidden sm:inline">Previous</span>
              <span className="sr-only sm:hidden">Previous page</span>
            </span>
          )}
        </li>

        {slots.map((slot, i) =>
          slot === GAP ? (
            <li
              key={`gap-${i}`}
              className="text-foreground-muted hidden min-w-[24px] justify-center text-sm sm:flex"
              aria-hidden
            >
              &hellip;
            </li>
          ) : (
            <li key={slot} className={hideOnMobile(slot) ? 'hidden sm:block' : ''}>
              {slot === page ? (
                <span className={`${BOX} vp-gradient px-3 text-white`} aria-current="page">
                  {slot}
                </span>
              ) : (
                <Link
                  href={hrefFor(slot)}
                  aria-label={`Page ${slot}`}
                  className={`${BOX} border-border bg-surface text-foreground hover:bg-surface-muted border px-3`}
                  scroll={false}
                >
                  <PageLinkLabel page={slot} />
                </Link>
              )}
            </li>
          ),
        )}

        <li>
          {page < pageCount ? (
            <Link href={hrefFor(page + 1)} className={STEP} rel="next" scroll={false}>
              <span className="hidden sm:inline">Next</span>
              <span className="sr-only sm:hidden">Next page</span>
              <ChevronRight size={16} aria-hidden />
              <LinkSpinner />
            </Link>
          ) : (
            <span className={`${STEP} opacity-40`} aria-disabled="true">
              <span className="hidden sm:inline">Next</span>
              <span className="sr-only sm:hidden">Next page</span>
              <ChevronRight size={16} aria-hidden />
            </span>
          )}
        </li>

        {/* Jump to the last page - the counterpart to First, so the end of a long list is one tap. */}
        <li>
          {atLast ? (
            <span className={`${STEP} opacity-40`} aria-disabled="true">
              <ChevronsRight size={16} aria-hidden />
              <span className="sr-only">Last page</span>
            </span>
          ) : (
            <Link href={hrefFor(pageCount)} className={STEP} aria-label="Last page" scroll={false}>
              <ChevronsRight size={16} aria-hidden />
              <LinkSpinner />
            </Link>
          )}
        </li>
      </ul>
      <p className="text-foreground-muted mt-2 text-center text-xs" aria-live="polite">
        Page {page} of {pageCount}
      </p>
    </nav>
  );
}
