'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';

/**
 * Debounced player search for Admin → Badges "Tag a player" tab (master_plan §2BK B). Mirrors
 * `AdminUserSearch` (admin/users) exactly, but navigates within `/admin/badges` and keeps `tab=tag`
 * so the tab survives the query update.
 */
export function AdminBadgePlayerSearch({ initialQ = '' }: { initialQ?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(next: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const p = new URLSearchParams();
      p.set('tab', 'tag');
      if (next.trim()) p.set('q', next.trim());
      start(() => router.push(`/admin/badges?${p.toString()}`));
    }, 300);
  }

  return (
    <div className="border-border bg-background flex items-center gap-2 rounded-xl border px-3 py-2">
      {pending ? (
        <Loader2 className="text-foreground-muted size-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        <Search className="text-foreground-muted size-4 shrink-0" aria-hidden />
      )}
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          apply(e.target.value);
        }}
        placeholder="Search players by name, handle, or city"
        aria-label="Search players"
        className="text-foreground placeholder:text-foreground-muted w-full bg-transparent text-sm focus:outline-none"
      />
    </div>
  );
}
