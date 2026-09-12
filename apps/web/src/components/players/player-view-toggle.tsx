'use client';

import { List, LayoutGrid, Loader2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

/**
 * URL-preserved detailed/compact player-directory view selector (§8.1, master_plan §2AN decision
 * G). One 40px icon button toggles between the two states - the icon and label always describe
 * what tapping it switches TO, not the current state. Compact remains the default (absent `view`
 * param in the URL).
 */
export function PlayerViewToggle({ compact }: { compact: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    const nextCompact = !compact;
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

  const label = compact ? 'Show detailed view' : 'Show compact view';

  return (
    <button
      type="button"
      aria-pressed={!compact}
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={toggle}
      className="border-border bg-surface text-foreground hover:bg-surface-muted inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border disabled:opacity-60"
    >
      {pending ? (
        <Loader2 size={16} className="animate-spin" aria-hidden />
      ) : compact ? (
        <LayoutGrid size={16} aria-hidden />
      ) : (
        <List size={16} aria-hidden />
      )}
    </button>
  );
}
