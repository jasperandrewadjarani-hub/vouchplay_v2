'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

/**
 * First-time swipe teaching for the partner deck (two complementary cues - standard swipe-card UX):
 * 1. `SwipeDirectionOverlay` - teach-by-doing. Leans a big colored badge + tint in with the drag as
 *    it happens, driven purely by the drag offset the card already tracks.
 * 2. `SwipeCoachMark` (+ `useSwipeHint`) - a one-time explainer overlay, shown once per browser via
 *    localStorage, for viewers who have never used a swipeable card deck before.
 */

export const SWIPE_HINT_STORAGE_KEY = 'vp_partner_swipe_hint_seen';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hasSeenSwipeHint(): boolean {
  try {
    return window.localStorage.getItem(SWIPE_HINT_STORAGE_KEY) === '1';
  } catch {
    // Private windows / storage-disabled browsers throw on access - treat as "not seen" (fall
    // through to showing the hint) rather than letting a storage error break the deck.
    return false;
  }
}

function markSwipeHintSeen(): void {
  try {
    window.localStorage.setItem(SWIPE_HINT_STORAGE_KEY, '1');
  } catch {
    // Nothing we can do if storage is unavailable - the hint will just show again next visit.
  }
}

/**
 * Shows the coach-mark exactly once per browser, the first time the caller has a non-empty deck to
 * show it over. `dismiss` is idempotent and safe to call even when the hint isn't currently visible
 * (callers wire it into every "the user is now interacting" path - drag start, button press, keyboard
 * shortcut - not just the explicit "Got it" click).
 */
export function useSwipeHint(hasCards: boolean): { visible: boolean; dismiss: () => void } {
  const [visible, setVisible] = useState(false);

  // Only re-checked when the deck transitions from empty to non-empty - once dismissed, `hasCards`
  // going true again (e.g. after Undo) must not re-show it mid-session. There's nothing else this
  // effect depends on, so the dependency array is already correct as-is.
  useEffect(() => {
    if (!hasCards) return;
    if (!hasSeenSwipeHint()) setVisible(true);
  }, [hasCards]);

  const dismiss = useCallback(() => {
    setVisible(false);
    markSwipeHintSeen();
  }, []);

  return { visible, dismiss };
}

/**
 * Teach-by-doing directional affordance, rendered as a sibling of the card content inside the same
 * translated/rotated wrapper so it drags along with the card. Purely transform/opacity - no layout
 * changes - so it stays smooth on touch and mouse alike. Decorative only (the round buttons below
 * already carry the accessible labels), hence `aria-hidden`.
 */
export function SwipeDirectionOverlay({ dragX, threshold }: { dragX: number; threshold: number }) {
  const teamUpProgress = clamp(dragX / threshold, 0, 1);
  const notNowProgress = clamp(-dragX / threshold, 0, 1);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      <div className="bg-success absolute inset-0" style={{ opacity: teamUpProgress * 0.16 }} />
      <div className="bg-danger absolute inset-0" style={{ opacity: notNowProgress * 0.16 }} />
      <div
        className="border-success text-success bg-surface/80 absolute top-5 left-5 -rotate-12 rounded-lg border-4 px-3 py-1 text-lg font-extrabold tracking-wide uppercase"
        style={{ opacity: teamUpProgress }}
      >
        Let&rsquo;s team up
      </div>
      <div
        className="border-danger text-danger bg-surface/80 absolute top-5 right-5 rotate-12 rounded-lg border-4 px-3 py-1 text-lg font-extrabold tracking-wide uppercase"
        style={{ opacity: notNowProgress }}
      >
        Not now
      </div>
    </div>
  );
}

/**
 * One-time explainer overlay, scoped to just the card area (a `relative` wrapper around the top card
 * only - never the whole page, and never shown over the empty state or the opt-in panel since the
 * caller only mounts this when there is a real top card). The scrim itself is `pointer-events-none` so
 * a drag started "through" it still lands on the card underneath (the standard "first drag dismisses
 * the hint" behavior) while the "Got it" button opts back into pointer events to stay clickable.
 */
export function SwipeCoachMark({ onDismiss }: { onDismiss: () => void }) {
  const gotItRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    gotItRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-label="How swiping works"
      className="bg-background/85 pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-2xl p-5 text-center backdrop-blur-[2px]"
    >
      {/* Gentle looping nudge to imply the drag gesture - `motion-safe:` keeps it off entirely under
          prefers-reduced-motion, no media query needed. */}
      <style>{`
        @keyframes vp-swipe-nudge {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          30% { transform: translateX(-10px) rotate(-6deg); }
          70% { transform: translateX(10px) rotate(6deg); }
        }
      `}</style>
      <div
        aria-hidden
        className="border-border bg-surface h-9 w-14 rounded-lg border-2 shadow-sm motion-safe:animate-[vp-swipe-nudge_1.8s_ease-in-out_infinite]"
      />
      <div className="flex items-center justify-center gap-10">
        <div className="text-danger flex flex-col items-center gap-1">
          <ArrowLeft size={26} aria-hidden />
          <span className="text-xs font-semibold">Not now</span>
        </div>
        <div className="text-success flex flex-col items-center gap-1">
          <ArrowRight size={26} aria-hidden />
          <span className="text-xs font-semibold">Let&rsquo;s team up</span>
        </div>
      </div>
      <p className="text-foreground-muted max-w-[220px] text-sm">
        Swipe the card, or use the buttons below
      </p>
      <button
        ref={gotItRef}
        type="button"
        onClick={onDismiss}
        className="bg-primary pointer-events-auto rounded-full px-5 py-2 text-sm font-semibold text-white shadow-md transition-transform active:scale-95"
      >
        Got it
      </button>
    </div>
  );
}
