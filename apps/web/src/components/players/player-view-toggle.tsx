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
    // Compact is the default, so it is the absent state in the URL and detailed is explicit.
    if (nextCompact) params.delete('view');
    else params.set('view', 'detailed');
    const query = params.toString();
    // scroll:false (master_plan §2AN decision 1): switching compact/detailed swaps the list in place
    // right below this control - the App Router's default scroll-to-top reads as a jump.
    startTransition(() =>
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }),
    );
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
