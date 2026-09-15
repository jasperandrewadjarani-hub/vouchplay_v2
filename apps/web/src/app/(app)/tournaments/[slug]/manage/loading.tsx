/**
 * Route-transition skeleton for Manage (master_plan §2BH Decision G). Shown instantly on tap - a slow
 * Manage load previously had nothing to show while `getOrganizerRegistrations` ran, so it looked
 * frozen. Mirrors the page's own shape (title bar, Overview's tiles, a short list of registration
 * rows) using the same `bg-surface-muted animate-pulse` skeleton convention as
 * `components/players/player-list-skeleton.tsx`. Purely decorative: `aria-hidden` on the shapes, a
 * polite status line for assistive tech, `aria-busy` on the root, and it respects reduced motion.
 */
const box = 'bg-surface-muted animate-pulse rounded motion-reduce:animate-none';

function TileSkeleton() {
  return (
    <div className="border-border bg-background rounded-xl border p-3">
      <div className={`${box} h-6 w-12`} />
      <div className={`${box} mt-2 h-3 w-20`} />
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="border-border bg-surface flex items-center gap-3 rounded-xl border p-3">
      <div className={`${box} h-9 w-9 shrink-0 rounded-full`} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className={`${box} h-3.5 w-40 max-w-[70%]`} />
        <div className={`${box} h-3 w-24`} />
      </div>
      <div className={`${box} h-5 w-16 shrink-0 rounded-full`} />
    </div>
  );
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-5" aria-busy="true">
      <span className="sr-only" role="status" aria-live="polite">
        Loading tournament management…
      </span>

      <div aria-hidden className="space-y-2">
        <div className={`${box} h-3.5 w-24`} />
        <div className={`${box} h-6 w-56`} />
      </div>

      <div aria-hidden className="border-border bg-surface rounded-2xl border p-5">
        <div className={`${box} mb-4 h-4 w-20`} />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <TileSkeleton key={i} />
          ))}
        </div>
      </div>

      <div aria-hidden className="border-border bg-surface space-y-3 rounded-2xl border p-5">
        <div className={`${box} h-4 w-28`} />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
