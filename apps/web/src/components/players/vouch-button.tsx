'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ThumbsUp } from 'lucide-react';
import { VouchForm } from './vouch-form';

/**
 * Vouch entry point + auth gate (handover §8.1, §9.1; gate "login gate resumes protected action").
 *  - Anonymous → signup carrying `next=/players/{slug}?intent=vouch` (resumes after auth).
 *  - Signed-in on a card → link to the profile with the vouch intent (the form lives on the profile).
 *  - Signed-in on the profile → opens the real vouch form (auto-opens when arriving with ?intent=vouch).
 */
export function VouchButton({
  slug,
  targetId,
  targetName,
  authed,
  isOwnProfile = false,
  viewerIsCoach = false,
  size = 'md',
  mode = 'card',
}: {
  slug: string;
  /** Required only for `mode="profile"` (the form needs the target uuid). */
  targetId?: string;
  targetName?: string;
  authed: boolean;
  isOwnProfile?: boolean;
  viewerIsCoach?: boolean;
  size?: 'sm' | 'md';
  mode?: 'card' | 'profile';
}) {
  const params = useSearchParams();
  const resumed = params.get('intent') === 'vouch';
  const [open, setOpen] = useState(mode === 'profile' && resumed && authed && !isOwnProfile);

  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';
  const btn = `inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${pad}`;
  const iconSize = size === 'sm' ? 14 : 16;

  if (isOwnProfile) {
    return (
      <span className={`${btn} border-border text-foreground-muted cursor-not-allowed border`}>
        <ThumbsUp size={iconSize} aria-hidden />
        Vouch
      </span>
    );
  }

  if (!authed) {
    const next = `/players/${slug}?intent=vouch`;
    return (
      <Link href={`/signup?next=${encodeURIComponent(next)}`} className={`${btn} bg-primary text-white hover:opacity-90`}>
        <ThumbsUp size={iconSize} aria-hidden />
        Vouch
      </Link>
    );
  }

  if (mode === 'card') {
    return (
      <Link href={`/players/${slug}?intent=vouch`} className={`${btn} bg-primary text-white hover:opacity-90`}>
        <ThumbsUp size={iconSize} aria-hidden />
        Vouch
      </Link>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${btn} bg-primary text-white hover:opacity-90`}>
        <ThumbsUp size={iconSize} aria-hidden />
        Vouch
      </button>
      {open && targetId && (
        <VouchForm
          targetId={targetId}
          targetName={targetName ?? 'this player'}
          viewerIsCoach={viewerIsCoach}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
