'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { respondInvitation, cancelInvitation } from '@/lib/actions/registration';

/** Accept/decline (incoming) or cancel (outgoing) a partner invitation (handover §20.2). */
export function InvitationActions({
  invitationId,
  direction,
}: {
  invitationId: string;
  direction: 'incoming' | 'outgoing';
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
