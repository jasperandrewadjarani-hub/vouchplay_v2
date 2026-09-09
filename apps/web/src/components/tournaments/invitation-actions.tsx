'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
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
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Confirm in place rather than relying on a refresh: an action with no feedback reads as an
  // action that failed, and the only way to learn Cancel had worked was to reload (§1N, §1Y).
  function run(
    fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>,
    successText: string,
  ) {
    setMsg(null);
    setDone(null);
    start(async () => {
      const res = await fn();
      setMsg(res.error ?? null);
      if (res.ok) {
        setDone(res.message ?? successText);
        router.refresh();
      }
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
            onClick={() => run(() => respondInvitation(invitationId, true), 'Confirmed.')}
            className="vp-gradient min-h-[44px] flex-1 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Yes, I am playing
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => respondInvitation(invitationId, false), 'Declined.')}
            className="border-border text-foreground min-h-[44px] flex-1 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50"
          >
            No, I cannot play
          </button>
        </div>
        {msg && <p className="text-danger text-xs">{msg}</p>}
        {done && !msg && (
          <p className="text-foreground-muted text-xs" role="status">
            {done}
          </p>
        )}
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
            onClick={() => run(() => respondInvitation(invitationId, true), 'Confirmed.')}
            className={`${btn} vp-gradient text-white`}
          >
            Accept
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => respondInvitation(invitationId, false), 'Declined.')}
            className={`${btn} border-border text-foreground border`}
          >
            Decline
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={pending || Boolean(done)}
          onClick={() => run(() => cancelInvitation(invitationId), 'Invitation cancelled.')}
          className={`${btn} border-border text-foreground inline-flex min-h-[44px] items-center gap-1.5 border disabled:opacity-60`}
        >
          {pending && <Loader2 size={13} className="animate-spin" aria-hidden />}
          {pending ? 'Cancelling…' : done ? 'Cancelled' : 'Cancel'}
        </button>
      )}
      {msg && <span className="text-danger text-xs">{msg}</span>}
      {done && !msg && (
        <span className="text-foreground-muted text-xs" role="status">
          {done}
        </span>
      )}
    </div>
  );
}
