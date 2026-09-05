'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ThumbsUp } from 'lucide-react';

/**
 * Vouch entry point + auth gate (handover §8.1, §9.1; Phase-2 gate "login gate resumes protected
 * action"). The vouch ENGINE is Phase 3 — this only gates the entry point:
 *  - Anonymous → link to signup carrying `next=/players/{slug}?intent=vouch`, so after auth the user
 *    lands back here with the vouch intent and it resumes (the note auto-opens).
 *  - Signed-in → opens the entry point, which currently explains vouching arrives in the next release.
 */
export function VouchButton({
  slug,
  authed,
  isOwnProfile = false,
  size = 'md',
}: {
  slug: string;
  authed: boolean;
  isOwnProfile?: boolean;
  size?: 'sm' | 'md';
}) {
  const params = useSearchParams();
  const resumed = params.get('intent') === 'vouch';
  const [open, setOpen] = useState(resumed && authed);

  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';
  const btn = `inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${pad}`;

  // You can't vouch for yourself.
  if (isOwnProfile) {
    return (
      <span className={`${btn} border-border text-foreground-muted cursor-not-allowed border`}>
        <ThumbsUp size={size === 'sm' ? 14 : 16} aria-hidden />
        Vouch
      </span>
    );
  }

  if (!authed) {
    const next = `/players/${slug}?intent=vouch`;
    return (
      <Link href={`/signup?next=${encodeURIComponent(next)}`} className={`${btn} bg-primary text-white hover:opacity-90`}>
        <ThumbsUp size={size === 'sm' ? 14 : 16} aria-hidden />
        Vouch
      </Link>
    );
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${btn} bg-primary text-white hover:opacity-90`}
        aria-expanded={open}
      >
        <ThumbsUp size={size === 'sm' ? 14 : 16} aria-hidden />
        Vouch
      </button>
      {open && (
        <span
          role="status"
          className="border-border bg-surface text-foreground-muted absolute left-0 top-full z-10 mt-2 w-64 rounded-xl border p-3 text-xs shadow-lg"
        >
          Vouching opens in the next release. You&apos;ll be able to rate this player&apos;s skill and
          leave a comment — with your rating anonymous if you choose.
        </span>
      )}
    </span>
  );
}
