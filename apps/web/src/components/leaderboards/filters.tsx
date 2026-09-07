'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { LeaderboardCategory } from '@vouchplay/core';
import type { LeaderboardPeriod, LeaderboardScope } from '@/lib/leaderboards/types';

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
  const [values, setValues] = useState({ category, scope, scopeValue, period });
  function apply() {
    const params = new URLSearchParams({
      category: values.category,
      scope: values.scope,
      period: values.category === 'community' ? 'all_time' : values.period,
    });
    if (values.scope !== 'global' && values.scopeValue.trim())
      params.set('scopeValue', values.scopeValue.trim());
    start(() => router.push(`/leaderboards?${params.toString()}`));
  }
  return (
    <div
      className="border-border bg-surface grid grid-cols-1 gap-3 rounded-2xl border p-4 sm:grid-cols-5"
      aria-busy={pending}
    >
      <label className="text-foreground-muted text-xs">
        Category
        <select
          className="border-border bg-background text-foreground mt-1 w-full rounded-xl border px-3 py-2 text-sm"
          value={values.category}
          onChange={(event) =>
            setValues({ ...values, category: event.target.value as LeaderboardCategory })
          }
        >
          <option value="players">Players</option>
          <option value="community">Community Champions</option>
          <option value="clubs">Clubs</option>
        </select>
      </label>
      <label className="text-foreground-muted text-xs">
        Scope
        <select
          className="border-border bg-background text-foreground mt-1 w-full rounded-xl border px-3 py-2 text-sm"
          value={values.scope}
          onChange={(event) =>
            setValues({ ...values, scope: event.target.value as LeaderboardScope })
          }
        >
          <option value="global">Global</option>
          <option value="city">City</option>
          <option value="region">Region</option>
        </select>
      </label>
      <label className="text-foreground-muted text-xs">
        City or region
        <input
          className="border-border bg-background text-foreground mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
          value={values.scopeValue}
          onChange={(event) => setValues({ ...values, scopeValue: event.target.value })}
          disabled={values.scope === 'global'}
        />
      </label>
      <label className="text-foreground-muted text-xs">
        Period
        <select
          className="border-border bg-background text-foreground mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
          value={values.category === 'community' ? 'all_time' : values.period}
          disabled={values.category === 'community'}
          onChange={(event) =>
            setValues({ ...values, period: event.target.value as LeaderboardPeriod })
          }
        >
          <option value="month">This month</option>
          <option value="season">This season</option>
          <option value="all_time">All time</option>
        </select>
      </label>
      <button
        type="button"
        onClick={apply}
        disabled={pending || (values.scope !== 'global' && !values.scopeValue.trim())}
        className="vp-gradient mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending && <Loader2 className="animate-spin" size={16} aria-hidden />}
        {pending ? 'Loading…' : 'Apply'}
      </button>
    </div>
  );
}
