'use client';

import { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';

/**
 * Pending cue for a compact directory row, drawn over the avatar.
 *
 * Tapping a row must give immediate feedback (§1N), and the cue must not take horizontal space from
 * the name, or the longer skill pills start wrapping and the list goes ragged (§1H).
 *
 * §1N put this in the trailing STS slot. It moved to the avatar when the row stopped being a single
 * anchor (§1S): `useLinkStatus` only reports for a `<Link>` it sits inside, and the STS chip is now
 * a sibling button rather than a descendant. The avatar is the better anchor anyway - it is a fixed
 * 40px that every row has, whereas STS is null for plenty of players.
 *
 * Positioned against the row's padding box, whose left edge is exactly where the avatar starts, so
 * it lands on the avatar from inside either of the row's two links and costs no layout at all.
 */
export function CompactRowPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      className="bg-surface/75 absolute top-1/2 left-0 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full backdrop-blur-[1px]"
      aria-hidden
    >
      <Loader2 size={18} className="text-primary animate-spin" />
    </span>
  );
}
