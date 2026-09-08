'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import type { LeaderboardCategory } from '@vouchplay/core';
import type { LeaderboardPeriod, LeaderboardScope } from '@/lib/leaderboards/types';

/**
 * Secondary controls only: scope and period.
 *
 * Choosing a board is now a tab (see `board-tabs.tsx`), so this no longer carries the category. It
 * is collapsed by default because global all-time is what almost everyone wants, and nobody should
 * need to understand "scope" or "period" to read a leaderboard. It stays open once the viewer has
 * moved off the defaults, so their current filter is never hidden from them.
 */
export function LeaderboardFilters({
  category,
  scope,
  scopeValue,
  period,
}: {
  category: LeaderboardCategory;
  scope: LeaderboardScope;
  scopeValue: string;
  period: LeaderboardPeriod;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [values, setValues] = useState({ scope, scopeValue, period });
  const nonDefault = scope !== 'global' || period !== 'all_time';
  const periodLocked = category === 'community';

  function apply() {
    const params = new URLSearchParams({
      category,
      scope: values.scope,
      period: periodLocked ? 'all_time' : values.period,
    });
    if (values.scope !== 'global' && values.scopeValue.trim())
      params.set('scopeValue', values.scopeValue.trim());
    start(() => router.push(`/leaderboards?${params.toString()}`));
  }

  return (
    <details className="border-border bg-surface rounded-2xl border" open={nonDefault}>
      <summary className="text-foreground-muted flex min-h-[44px] cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold">
        <SlidersHorizontal size={16} aria-hidden />
        Change scope or period
        <span className="text-foreground-muted ml-auto text-xs font-normal">
          {scope === 'global' ? 'Global' : `${scope}: ${scopeValue}`} · {period.replace('_', ' ')}
        </span>
      </summary>
      <div
        className="border-border grid grid-cols-1 gap-3 border-t p-4 sm:grid-cols-4"
        aria-busy={pending}
      >
        <label className="text-foreground-muted text-xs">
          Scope
          <select
            className="border-border bg-background text-foreground mt-1 min-h-[44px] w-full rounded-xl border px-3 text-sm"
            value={values.scope}
            onChange={(event) =>
              setValues({ ...values, scope: event.target.value as LeaderboardScope })
            }
          >
            <option value="global">Everywhere</option>
            <option value="city">One city</option>
            <option value="region">One region</option>
          </select>
        </label>
        <label className="text-foreground-muted text-xs">
          City or region
          <input
            className="border-border bg-background text-foreground mt-1 min-h-[44px] w-full rounded-xl border px-3 text-sm disabled:opacity-50"
            value={values.scopeValue}
            onChange={(event) => setValues({ ...values, scopeValue: event.target.value })}
            disabled={values.scope === 'global'}
            placeholder={values.scope === 'global' ? 'Not needed' : 'e.g. Zamboanga City'}
          />
        </label>
        <label className="text-foreground-muted text-xs">
          Period
          <select
            className="border-border bg-background text-foreground mt-1 min-h-[44px] w-full rounded-xl border px-3 text-sm disabled:opacity-50"
            value={periodLocked ? 'all_time' : values.period}
            disabled={periodLocked}
            onChange={(event) =>
              setValues({ ...values, period: event.target.value as LeaderboardPeriod })
            }
          >
            <option value="month">This month</option>
            <option value="season">This season</option>
            <option value="all_time">All time</option>
          </select>
          {periodLocked && (
            <span className="mt-1 block text-[11px]">Contributors are ranked all time.</span>
          )}
        </label>
        <button
          type="button"
          onClick={apply}
          disabled={pending || (values.scope !== 'global' && !values.scopeValue.trim())}
          className="vp-gradient mt-auto inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending && <Loader2 className="animate-spin" size={16} aria-hidden />}
          {pending ? 'Loading…' : 'Show these rankings'}
        </button>
      </div>
    </details>
  );
}
