'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { respondInvitation, cancelInvitation } from '@/lib/actions/registration';

/** Accept/decline (incoming) or cancel (outgoing) a partner invitation (handover §20.2). */
export function InvitationActions({
  invitationId,
  direction,
  prepaid = false,
  partnerName,
}: {
  invitationId: string;
  direction: 'incoming' | 'outgoing';
  /** The inviter already paid, so this is a confirmation, not a request for money (§1U). */
  prepaid?: boolean;
  partnerName?: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      setMsg(res.error ?? null);
      if (res.ok) router.refresh();
    });
  }

  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50';

  // A prepaid invitation is a bigger ask than a normal one - somebody has spent money naming this
  // person - and until they answer they cannot enter that division with anyone else. So it gets
  // real estate, plain language, and two full-width choices of equal weight. Declining is stated
  // as free and safe: a player pressured into a tournament they cannot play is worse for everyone.
  if (direction === 'incoming' && prepaid) {
    return (
      <div className="w-full space-y-2.5">
        <p className="text-foreground text-sm font-semibold">
          {partnerName ?? 'They'} already paid your entry fee.
        </p>
        <p className="text-foreground-muted text-sm">
          Confirming costs you nothing and does not ask you for money. Declining is free too, and
          frees you to enter with someone else.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => respondInvitation(invitationId, true))}
            className="vp-gradient min-h-[44px] flex-1 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Yes, I am playing
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => respondInvitation(invitationId, false))}
            className="border-border text-foreground min-h-[44px] flex-1 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50"
          >
            No, I cannot play
          </button>
        </div>
        {msg && <p className="text-danger text-xs">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {direction === 'incoming' ? (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => respondInvitation(invitationId, true))}
            className={`${btn} vp-gradient text-white`}
          >
            Accept
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => respondInvitation(invitationId, false))}
            className={`${btn} border-border text-foreground border`}
          >
            Decline
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => cancelInvitation(invitationId))}
          className={`${btn} border-border text-foreground border`}
        >
          Cancel
        </button>
      )}
      {msg && <span className="text-danger text-xs">{msg}</span>}
    </div>
  );
}
