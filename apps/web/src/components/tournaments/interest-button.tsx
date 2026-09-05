'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { toggleInterest } from '@/lib/actions/tournament';

const btn =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2';

/** "I'm interested" toggle for a tournament (handover §36.22). Anonymous → signup with resume. */
export function InterestButton({
  tournamentId,
  slug,
  authed,
  interested,
}: {
  tournamentId: string;
  slug: string;
  authed: boolean;
  interested: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(interested);
  const [pending, start] = useTransition();

  if (!authed) {
    return (
      <Link
        href={`/signup?next=${encodeURIComponent(`/tournaments/${slug}`)}`}
        className={`${btn} border-border text-foreground hover:bg-surface-muted border`}
      >
        <Star size={16} aria-hidden />
        I&apos;m interested
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await toggleInterest(tournamentId, slug, null);
          if (res.ok) {
            setOn((v) => !v);
            router.refresh();
          }
        })
      }
      className={`${btn} border disabled:opacity-60 ${on ? 'border-primary text-primary bg-primary/10' : 'border-border text-foreground hover:bg-surface-muted'}`}
      aria-pressed={on}
    >
      <Star size={16} aria-hidden className={on ? 'fill-current' : ''} />
      {on ? 'Interested' : "I'm interested"}
    </button>
  );
}
