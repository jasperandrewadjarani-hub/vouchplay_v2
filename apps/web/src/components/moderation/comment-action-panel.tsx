'use client';

import { useState, useTransition } from 'react';
import { hideComment, removeComment, restoreComment } from '@/lib/actions/moderation';

/** Staff content actions for a reported vouch comment (handover §47 - hide / remove / restore). */
export function CommentActionPanel({ commentId }: { commentId: string }) {
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function run(
    fn: (id: string, reason: string) => Promise<{ ok?: boolean; error?: string; message?: string }>,
  ) {
    if (!reason.trim()) {
      setMsg({ ok: false, text: 'A reason is required.' });
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await fn(commentId, reason);
      setMsg({ ok: !!res.ok, text: res.ok ? (res.message ?? 'Done.') : (res.error ?? 'Failed.') });
      if (res.ok) setReason('');
    });
  }

  const btn = 'rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50';

  return (
    <div className="border-border mt-3 space-y-2 rounded-xl border border-dashed p-3">
      <p className="text-foreground-muted text-xs font-semibold tracking-wide uppercase">
        Comment action
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        className="border-border bg-background w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(hideComment)}
          className={`${btn} bg-surface-muted text-foreground`}
        >
          Hide
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(removeComment)}
          className={`${btn} bg-danger/90 text-white`}
        >
          Remove
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(restoreComment)}
          className={`${btn} border-border text-foreground border`}
        >
          Restore
        </button>
      </div>
      {msg && <p className={`text-xs ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
    </div>
  );
}
