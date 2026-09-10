/**
 * Loading placeholder for the player directory results (master_plan §2Z). Shown as the Suspense
 * fallback while a filter/search/page/view change resolves, so the list itself gives a visual cue -
 * preloaded boxes - rather than only the filter control spinning. Mirrors the real results: a count +
 * view-toggle row, then card/row placeholders matching the current density. Purely decorative, so it
 * is hidden from assistive tech (a polite "Loading players" lives alongside it) and respects
 * reduced-motion.
 */
const box = 'bg-surface-muted animate-pulse rounded motion-reduce:animate-none';

function CompactRowSkeleton() {
  return (
    <div className="border-border bg-surface flex min-h-14 items-center gap-3 rounded-xl border p-2.5">
      <div className={`${box} h-9 w-9 shrink-0 rounded-full`} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className={`${box} h-3.5 w-40 max-w-[70%]`} />
        <div className={`${box} h-3 w-24`} />
      </div>
      <div className="flex w-[92px] shrink-0 flex-col items-end gap-1.5">
        <div className={`${box} h-4 w-16`} />
        <div className={`${box} h-7 w-16 rounded-lg`} />
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="border-border bg-surface flex flex-col gap-3 rounded-2xl border p-3.5">
      <div className="flex items-start gap-3">
        <div className={`${box} h-11 w-11 shrink-0 rounded-full`} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className={`${box} h-4 w-32 max-w-[70%]`} />
          <div className={`${box} h-3 w-20`} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className={`${box} h-6 w-24 rounded-full`} />
        <div className={`${box} h-6 w-16 rounded-full`} />
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className={`${box} h-4 w-20`} />
        <div className={`${box} h-7 w-20 rounded-lg`} />
      </div>
    </div>
  );
}

export function PlayerListSkeleton({ compact }: { compact: boolean }) {
  const count = compact ? 8 : 6;
  return (
    <div className="space-y-5">
      <span className="sr-only" role="status" aria-live="polite">
        Loading players…
      </span>
      <div className="flex items-center justify-between gap-3" aria-hidden>
        <div className={`${box} h-4 w-24`} />
        <div className={`${box} h-9 w-40 rounded-lg`} />
      </div>
      <div
        aria-hidden
        className={compact ? 'space-y-2' : 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'}
      >
        {Array.from({ length: count }).map((_, i) =>
          compact ? <CompactRowSkeleton key={i} /> : <CardSkeleton key={i} />,
        )}
      </div>
    </div>
  );
}
