'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { adminRecomputeBadges } from '@/lib/actions/badges';

/**
 * Header "Recompute now" control for Admin → Badges (master_plan §2BK B). Runs the same
 * `computeAutoBadges` pass the leaderboards cron triggers, then shows the returned message as a
 * short inline "toast" line and refreshes the page's server data.
 */
export function RecomputeButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit() {
    setMsg(null);
    start(async () => {
      const res = await adminRecomputeBadges();
      setMsg({
        ok: !!res.ok,
        text: res.ok ? (res.message ?? 'Badges recomputed.') : res.error,
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="border-border text-foreground hover:border-primary inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:opacity-60"
      >
        <RefreshCw size={14} className={pending ? 'animate-spin' : ''} aria-hidden />
        {pending ? 'Recomputing…' : 'Recompute now'}
      </button>
      {msg && (
        <p
          role={msg.ok ? undefined : 'alert'}
          className={`text-xs ${msg.ok ? 'text-success' : 'text-danger'}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
