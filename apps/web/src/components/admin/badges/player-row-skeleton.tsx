/**
 * Loading placeholder for one Tag-screen player row (master_plan §2BM Decision C), matching
 * `PlayerRow`'s footprint (checkbox + avatar + two text lines + chevron) so the list doesn't jump
 * when real rows replace it. Shown as 6 rows while page 1 loads; purely decorative (hidden from
 * assistive tech, "Loading players" lives alongside it in `TagScreen`) and respects reduced motion.
 */
const box = 'bg-surface-muted animate-pulse rounded motion-reduce:animate-none';

export function PlayerRowSkeleton() {
  return (
    <div
      aria-hidden
      className="border-border bg-surface flex items-center gap-3 rounded-2xl border p-3"
    >
      <div className={`${box} size-[26px] shrink-0 rounded-lg`} />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className={`${box} size-10 shrink-0 rounded-full`} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className={`${box} h-3.5 w-32 max-w-[70%]`} />
          <div className={`${box} h-3 w-20`} />
        </div>
      </div>
      <div className={`${box} size-[18px] shrink-0`} />
    </div>
  );
}
