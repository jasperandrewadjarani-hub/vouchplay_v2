'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adminUntagBadge } from '@/lib/actions/badges';
import { Switch } from '@/components/ui/switch';

/**
 * Inline untag confirm (master_plan §2BK B - "admins can... untag ANY badge"), shared by the "Tag a
 * player" tab and the "Holders" tab. No `window.confirm`: a reason (required, ≥3 chars, audited) and
 * a "Keep it off automatically" switch (default on) that sets `auto_blocked` so the nightly job can't
 * immediately re-award an automatic badge.
 */
export function UntagControl({
  playerBadgeId,
  badgeName,
  onSuccess,
}: {
  playerBadgeId: string;
  badgeName: string;
  /** When given (the §2BL chevron sheet), this refetches the sheet's own data and is trusted instead
   *  of `router.refresh()` (master_plan §2BM Decision C - avoids stacking a full server render on top
   *  of a client-fetched refresh). The server-rendered Holders tab passes nothing and keeps the
   *  `router.refresh()` it has always needed. */
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [keepOff, setKeepOff] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (reason.trim().length < 3) {
      setError('Reason must be at least 3 characters.');
      return;
    }
    setError(null);
    start(async () => {
      const res = await adminUntagBadge({ playerBadgeId, reason: reason.trim(), keepOff });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirming(false);
      setReason('');
      if (onSuccess) onSuccess();
      else router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-danger hover:bg-danger/10 -mx-2 min-h-[44px] rounded-lg px-2 text-xs font-semibold transition-colors"
      >
        Untag
      </button>
    );
  }

  return (
    <div className="border-border bg-background space-y-2 rounded-xl border p-3">
      <p className="text-foreground text-xs font-medium">Untag {badgeName}?</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Reason (required, audited)"
        className="border-border bg-surface w-full rounded-lg border px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      <Switch
        checked={keepOff}
        onCheckedChange={setKeepOff}
        label="Keep it off automatically"
        description="Blocks the nightly job from re-awarding this automatic badge."
      />
      {error && (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="border-danger/40 text-danger hover:bg-danger/10 min-h-[44px] flex-1 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-60"
        >
          {pending ? 'Untagging…' : 'Confirm untag'}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={pending}
          className="border-border text-foreground hover:bg-surface-muted min-h-[44px] flex-1 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
