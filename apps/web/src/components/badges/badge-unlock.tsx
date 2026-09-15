'use client';

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { badgeDef } from '@vouchplay/config';
import type { BadgeView } from '@/lib/badges/types';
import { pinMyBadge, markBadgesCelebrated } from '@/lib/actions/badges';
import { useBackToClose } from '@/lib/hooks/use-back-to-close';
import { BadgeSymbol } from './badge-symbol';

/**
 * Unlock moment (master_plan §2BK E): the viewer's uncelebrated badges, shown one at a time, full
 * screen. `prefers-reduced-motion` support needs no extra JS - the global rule in globals.css already
 * stills every animation to ~0 duration, which lands the rays and pop-in on their final frame
 * instantly (a still, fully visible badge, no rotation).
 *
 * `celebrateAll` marks every badge in `badges` celebrated regardless of how many the viewer actually
 * stepped through - reaching the last card, closing with the × affordance built into `next`, or the
 * phone Back gesture (`useBackToClose`) all resolve the same way, so a dismissed unlock never
 * re-appears on the next page load.
 */
export function BadgeUnlock({ badges }: { badges: BadgeView[] }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  useEffect(() => setMounted(true), []);

  const open = !done && badges.length > 0 && index < badges.length;

  function celebrateAll() {
    if (done) return;
    setDone(true);
    start(async () => {
      await markBadgesCelebrated(badges.map((b) => b.id));
      router.refresh();
    });
  }

  useBackToClose(open, celebrateAll);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const badge = badges[index];
  if (!mounted || !open || !badge) return null;
  // TS control-flow narrowing above doesn't reach into the function declarations below (they're
  // hoisted, so it can't prove they only run while `badge` is defined) - `pinKey`'s own inferred
  // type IS the narrowed `string`, so it stays safely typed inside `pin`'s closure.
  const pinKey = badge.key;

  const def = badgeDef(badge.key);
  const isLast = index === badges.length - 1;

  function next() {
    if (isLast) {
      celebrateAll();
    } else {
      setIndex((i) => i + 1);
    }
  }

  function pin() {
    start(async () => {
      await pinMyBadge(pinKey);
      next();
    });
  }

  const sentence = [def?.summary, badge.meta.event, badge.meta.division]
    .filter(Boolean)
    .join(' · ');

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden px-6 text-center"
      style={{
        background:
          'radial-gradient(70% 50% at 50% 42%, rgba(183,121,31,.18), transparent 70%), var(--background)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`New badge: ${badge.name}`}
    >
      <span className="vp-badge-rays" aria-hidden />
      <div className="vp-badge-pop relative">
        <BadgeSymbol
          badgeKey={badge.key}
          size={150}
          number={badge.meta.number}
          title={badge.name}
        />
      </div>
      <p className="text-warning relative mt-4 text-xs font-bold tracking-[0.2em] uppercase">
        New badge
      </p>
      <h2 className="text-foreground relative mt-1 text-3xl font-bold tracking-tight">
        {badge.name}
      </h2>
      <p className="text-foreground-muted relative mt-1.5 mb-6 max-w-xs text-sm">{sentence}</p>
      <div className="relative flex w-full max-w-xs flex-col gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={pin}
          className="vp-gradient inline-flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-bold text-white disabled:opacity-50"
        >
          ★ Pin to my card
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={next}
          className="border-border text-foreground hover:bg-surface-muted inline-flex min-h-11 w-full items-center justify-center rounded-xl border text-sm font-semibold disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>,
    document.body,
  );
}
