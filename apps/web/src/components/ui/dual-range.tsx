'use client';

import { useId } from 'react';

/**
 * Accessible two-thumb range slider (master_plan §2AG A2): STS, vouches-received and vouches-given
 * all need "from X to Y", not a single threshold. Two native `<input type="range">` stacked on one
 * track, rather than a bespoke drag-and-drop widget - every phone and every screen reader already
 * knows how to operate a range input, and the arrow keys, Home/End and Page Up/Down all work for
 * free. The two inputs share one visual track (drawn separately below, since the native track can't
 * be hidden without also hiding the thumb) and a live "lo - hi" value chip; the chip reads "Any" when
 * the range spans its full min..max, matching the calm, no-filter-applied convention `search-filters`
 * already uses for the single STS slider.
 */

/**
 * Pure value-clamping logic behind the two thumbs, exported so it is unit-testable without
 * rendering the component (this repo's Vitest environment is plain `node`, not `jsdom`). Moving the
 * low thumb past the high one clamps to the high value instead of crossing it, and vice versa - a
 * dual-range slider whose thumbs can swap past each other reads as broken, not as a wider range.
 */
export function nextDualRangeValue(
  value: [number, number],
  which: 'lo' | 'hi',
  next: number,
): [number, number] {
  const [lo, hi] = value;
  if (which === 'lo') return [Math.min(next, hi), hi];
  return [lo, Math.max(next, lo)];
}

export interface DualRangeProps {
  min: number;
  max: number;
  step: number;
  /** [low, high], both within [min, max]. */
  value: [number, number];
  onChange: (value: [number, number]) => void;
  label: string;
  /** Formats one bound for display; defaults to the raw number. */
  format?: (value: number) => string;
  /** Shown instead of a value pair when the range spans its full min..max. */
  anyLabel?: string;
  id?: string;
}

export function DualRange({
  min,
  max,
  step,
  value,
  onChange,
  label,
  format = (v) => String(v),
  anyLabel = 'Any',
  id,
}: DualRangeProps) {
  const autoId = useId();
  const baseId = id ?? autoId;
  const [lo, hi] = value;

  // Min <= max is enforced here, not just by the browser's own min/max attrs on each input: without
  // this, dragging the low thumb past the high thumb (or vice versa) would silently invert the
  // range, which reads as a bug rather than a clamp.
  function setLo(next: number) {
    onChange(nextDualRangeValue(value, 'lo', next));
  }
  function setHi(next: number) {
    onChange(nextDualRangeValue(value, 'hi', next));
  }

  const pct = (v: number) => (max === min ? 0 : ((v - min) / (max - min)) * 100);
  const isFullSpan = lo <= min && hi >= max;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span id={`${baseId}-label`} className={'text-foreground block text-sm font-semibold'}>
          {label}
        </span>
        <span
          className="border-border text-foreground shrink-0 rounded-lg border px-2 py-1 text-center text-sm font-semibold tabular-nums"
          aria-hidden
        >
          {isFullSpan ? anyLabel : `${format(lo)} – ${format(hi)}`}
        </span>
      </div>

      {/*
       * The track/thumbs sit in a fixed-height box on purpose: the app runs a 14px root font (see
       * the note in `search-filters.tsx`), so a `h-7` rem-based height would come out under the
       * 28px thumb it needs to contain. `h-[28px]` is an exact pixel value for the same reason.
       */}
      <div className="relative mt-3 h-[28px]">
        <div
          className="bg-border absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full"
          aria-hidden
        />
        <div
          className="bg-primary absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
          aria-hidden
        />
        <input
          type="range"
          aria-labelledby={`${baseId}-label`}
          aria-valuetext={isFullSpan || lo <= min ? 'No minimum' : `Minimum ${format(lo)}`}
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => setLo(Number(e.target.value))}
          className="dual-range-input absolute inset-x-0 top-0 h-[28px] w-full cursor-pointer"
        />
        <input
          type="range"
          aria-labelledby={`${baseId}-label`}
          aria-valuetext={isFullSpan || hi >= max ? 'No maximum' : `Maximum ${format(hi)}`}
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => setHi(Number(e.target.value))}
          className="dual-range-input absolute inset-x-0 top-0 h-[28px] w-full cursor-pointer"
        />
      </div>
    </div>
  );
}
