'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, LogOut, Clock } from 'lucide-react';
import { requestJoin, leaveClub } from '@/lib/actions/club';
import type { ClubMembershipStatus } from '@vouchplay/db';

const btn =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * Join / Leave control for a club (handover §15.5). Anonymous → signup with resume. Reflects the
 * viewer's membership: none → Join / Request; pending → Pending; active member → Leave; owner → none.
 */
export function JoinButton({
  clubId,
  slug,
  authed,
  privacy,
  membership,
}: {
  clubId: string;
  slug: string;
  authed: boolean;
  privacy: 'public' | 'approval_required';
  membership: { role: string; status: ClubMembershipStatus } | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!authed) {
    return (
      <Link
        href={`/signup?next=${encodeURIComponent(`/clubs/${slug}`)}`}
        className={`${btn} vp-gradient vp-glow text-white`}
      >
        <UserPlus size={16} aria-hidden />
        {privacy === 'public' ? 'Join club' : 'Request to join'}
      </Link>
    );
  }

  if (membership?.role === 'owner' && membership.status === 'active') {
    return (
      <span className={`${btn} border-border text-foreground-muted border`}>You own this club</span>
    );
  }
  if (membership?.status === 'active') {
    return (
      <>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await leaveClub(clubId, slug);
              if (res.error) setError(res.error);
              else router.refresh();
            })
          }
          className={`${btn} border-border text-foreground hover:bg-surface-muted border disabled:opacity-60`}
        >
          <LogOut size={16} aria-hidden />
          {pending ? 'Leaving…' : 'Leave club'}
        </button>
        {error && <span className="text-danger ml-2 text-xs">{error}</span>}
      </>
    );
  }
  if (membership?.status === 'requested' || membership?.status === 'invited') {
    return (
      <span className={`${btn} border-border text-foreground-muted border`}>
        <Clock size={16} aria-hidden />
        {membership.status === 'requested' ? 'Request pending' : 'Invitation pending'}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await requestJoin(clubId, slug);
            if (res.error) setError(res.error);
            else router.refresh();
          })
        }
        className={`${btn} vp-gradient vp-glow text-white disabled:opacity-60`}
      >
        <UserPlus size={16} aria-hidden />
        {pending ? 'Working…' : privacy === 'public' ? 'Join club' : 'Request to join'}
      </button>
      {error && <span className="text-danger ml-2 text-xs">{error}</span>}
    </>
  );
}
