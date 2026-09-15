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
  /** Called in addition to `router.refresh()` - lets a client-fetched host (the §2BL chevron sheet)
   *  refetch its own data too. */
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
      router.refresh();
      onSuccess?.();
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
