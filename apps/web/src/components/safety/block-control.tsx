'use client';

import { useState, useTransition } from 'react';
import { Ban, Undo2 } from 'lucide-react';
import { blockUser, unblockUser } from '@/lib/actions/block';

const base =
  'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * Block / unblock control (handover §14.3). Blocking prevents new vouch requests, partner invites,
 * and recruitment/sponsorship between the two accounts. Confirms before blocking.
 */
export function BlockControl({
  targetId,
  slug,
  targetName,
  initiallyBlocked,
}: {
  targetId: string;
  slug: string;
  targetName: string;
  initiallyBlocked: boolean;
}) {
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    if (
      !blocked &&
      !confirm(`Block ${targetName}? They won't be able to request vouches or invites from you.`)
    ) {
      return;
    }
    startTransition(async () => {
      const res = blocked ? await unblockUser(targetId, slug) : await blockUser(targetId, slug);
      if (res.error) setError(res.error);
      else setBlocked(!blocked);
    });
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`${base} border-border text-danger hover:bg-danger/10 disabled:opacity-60`}
        aria-pressed={blocked}
      >
        {blocked ? <Undo2 size={15} aria-hidden /> : <Ban size={15} aria-hidden />}
        {blocked ? 'Unblock' : 'Block'}
      </button>
      {error && (
        <span role="alert" className="text-danger mt-1 text-xs">
          {error}
        </span>
      )}
    </span>
  );
}
