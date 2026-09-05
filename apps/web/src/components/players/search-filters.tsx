'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { SKILL_BANDS, PH_CITIES } from '@vouchplay/config';

export interface ActiveFilters {
  q?: string;
  city?: string;
  sex?: string;
  minSkill?: string;
  identityVerified?: boolean;
  coach?: boolean;
  lookingForPartner?: boolean;
  openForSponsorship?: boolean;
}

const controlClass =
  'w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * Directory search & filters (handover §8.4). Submitting navigates with URL search params so results
 * stay server-rendered, shareable and cache-friendly. Filters backed by Phase-2 data are shown;
 * Community-skill / Skill-Verified / Club filters arrive with their data (Phase 3 / Phase 5).
 */
export function SearchFilters({ current }: { current: ActiveFilters }) {
  const router = useRouter();
  const [showFilters, setShowFilters] = useState(
    Boolean(
      current.city ||
      current.sex ||
      current.minSkill ||
      current.identityVerified ||
      current.coach ||
      current.lookingForPartner ||
      current.openForSponsorship,
    ),
  );

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    const setIf = (key: string, value: FormDataEntryValue | null) => {
      const v = typeof value === 'string' ? value.trim() : '';
      if (v) params.set(key, v);
    };
    setIf('q', fd.get('q'));
    setIf('city', fd.get('city'));
    setIf('sex', fd.get('sex'));
    setIf('minSkill', fd.get('minSkill'));
    if (fd.get('identityVerified')) params.set('identityVerified', '1');
    if (fd.get('coach')) params.set('coach', '1');
    if (fd.get('lookingForPartner')) params.set('lookingForPartner', '1');
    if (fd.get('openForSponsorship')) params.set('openForSponsorship', '1');
    const qs = params.toString();
    router.push(qs ? `/players?${qs}` : '/players');
  }

  const hasAny = Boolean(
    current.q ||
    current.city ||
    current.sex ||
    current.minSkill ||
    current.identityVerified ||
    current.coach ||
    current.lookingForPartner ||
    current.openForSponsorship,
  );

  return (
    <form onSubmit={submit} className="border-border bg-surface space-y-3 rounded-2xl border p-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            aria-hidden
            className="text-foreground-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <input
            name="q"
            defaultValue={current.q ?? ''}
            placeholder="Search by name, nickname or city"
            className={`${controlClass} pl-9`}
            aria-label="Search players"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className="border-border bg-surface text-foreground hover:bg-surface-muted inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium"
        >
          <SlidersHorizontal size={16} aria-hidden />
          Filters
        </button>
        <button
          type="submit"
          className="bg-primary inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Search
        </button>
      </div>

      {showFilters && (
        <div className="border-border grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-foreground block text-sm font-medium">City</span>
            <input
              name="city"
              defaultValue={current.city ?? ''}
              list="ph-cities"
              className={controlClass}
            />
            <datalist id="ph-cities">
              {PH_CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          <label className="space-y-1.5">
            <span className="text-foreground block text-sm font-medium">Sex</span>
            <select name="sex" defaultValue={current.sex ?? ''} className={controlClass}>
              <option value="">Any</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-foreground block text-sm font-medium">
              Minimum self-rated skill
            </span>
            <select name="minSkill" defaultValue={current.minSkill ?? ''} className={controlClass}>
              <option value="">Any</option>
              {SKILL_BANDS.map((b) => (
                <option key={b.key} value={b.ordinal}>
                  {b.label} and up
                </option>
              ))}
            </select>
          </label>

          <fieldset className="space-y-2 sm:pt-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="identityVerified"
                defaultChecked={current.identityVerified}
              />
              Identity verified
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="coach" defaultChecked={current.coach} />
              Coach
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="lookingForPartner"
                defaultChecked={current.lookingForPartner}
              />
              Looking for partner
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="openForSponsorship"
                defaultChecked={current.openForSponsorship}
              />
              Open to sponsorship
            </label>
          </fieldset>
        </div>
      )}

      {hasAny && (
        <button
          type="button"
          onClick={() => router.push('/players')}
          className="text-foreground-muted hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <X size={12} aria-hidden />
          Clear filters
        </button>
      )}
    </form>
  );
}
