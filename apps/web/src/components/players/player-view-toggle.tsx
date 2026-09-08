'use client';

import { List, LayoutGrid, Loader2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

/** URL-preserved detailed/compact player-directory view selector (§8.1). */
export function PlayerViewToggle({ compact }: { compact: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setView(nextCompact: boolean) {
    if (nextCompact === compact) return;
    const params = new URLSearchParams(searchParams.toString());
    if (nextCompact) params.set('view', 'compact');
    else params.delete('view');
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <div
      role="group"
      aria-label="Player card view"
      className="border-border bg-surface inline-flex rounded-xl border p-1"
    >
      <button
        type="button"
        aria-pressed={!compact}
        disabled={pending}
        onClick={() => setView(false)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
          !compact
            ? 'bg-primary text-white'
            : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground'
        }`}
      >
        {pending && !compact ? (
          <Loader2 size={13} className="animate-spin" aria-hidden />
        ) : (
          <LayoutGrid size={13} aria-hidden />
        )}
        Detailed
      </button>
      <button
        type="button"
        aria-pressed={compact}
        disabled={pending}
        onClick={() => setView(true)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
          compact
            ? 'bg-primary text-white'
            : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground'
        }`}
      >
        {pending && compact ? (
          <Loader2 size={13} className="animate-spin" aria-hidden />
        ) : (
          <List size={13} aria-hidden />
        )}
        Compact
      </button>
    </div>
  );
}
