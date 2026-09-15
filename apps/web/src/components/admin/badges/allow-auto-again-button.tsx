'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adminAllowAutoAgain } from '@/lib/actions/badges';

/**
 * Lifts an `auto_blocked` flag left behind by an untag with "Keep it off automatically" (master_plan
 * §2BK B), shown next to a revoked row in the player's "Removed" list.
 */
export function AllowAutoAgainButton({
  playerId,
  badgeKey,
  onSuccess,
}: {
  playerId: string;
  badgeKey: string;
  /** When given (the §2BL chevron sheet), this refetches the sheet's own data and is trusted instead
   *  of `router.refresh()` (master_plan §2BM Decision C). The server-rendered Holders tab passes
   *  nothing and keeps the `router.refresh()` it has always needed. */
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const res = await adminAllowAutoAgain({ playerId, badgeKey });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (onSuccess) onSuccess();
      else router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="border-border text-foreground hover:border-primary min-h-[44px] rounded-lg border px-3 text-xs font-semibold transition-colors disabled:opacity-60"
      >
        {pending ? 'Allowing…' : 'Allow automatic again'}
      </button>
      {error && (
        <p role="alert" className="text-danger mt-1 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
