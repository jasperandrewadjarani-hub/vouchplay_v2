'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { Search, SlidersHorizontal, X, Loader2, Check } from 'lucide-react';
import { SKILL_BANDS } from '@vouchplay/config';
import {
  STS_MAX,
  STS_MIN,
  STS_STEP,
  activeFilterCount,
  clearFilter,
  describeActiveFilters,
  playerFiltersToQuery,
  type CityOption,
  type FilterChipKey,
  type PlayerFilters,
} from '@/lib/players/filters';
import type { ClubOption } from '@/lib/players/queries';

/**
 * Directory search & filters (handover §8.4, master_plan §2B).
 *
 * Submitting navigates with URL search params, so results stay server-rendered, shareable and
 * cache-friendly, and every filter is in the address bar rather than in component state only.
 *
 * The controls are picked per data type rather than by fashion (§2B): named discrete values get
 * chips, a genuinely continuous number gets a single-thumb slider, three options get a segmented
 * control, and the booleans get 44px toggle pills instead of 13px checkboxes - our players span a
 * wide age range and most of them are on a phone. State is never carried by colour alone: a
 * selected chip also shows a check mark and reports `aria-pressed`.
 *
 * Filtering by STS is not ranking by STS. §8.4 forbids ordering the directory by STS and the sort is
 * untouched; a minimum-confidence filter answers a different question from "who is best".
 */

const controlClass =
  'w-full min-h-[44px] rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-offset-2';

const sectionLabel = 'text-foreground block text-sm font-semibold';
const sectionHint = 'text-foreground-muted mt-0.5 block text-xs leading-relaxed';

/** A tappable pill used for skill bands, the sex segments and the boolean toggles. */
function TogglePill({
  selected,
  onClick,
  children,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
        selected
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-background text-foreground-muted hover:border-primary/40 hover:text-foreground'
      }`}
    >
      {selected && <Check size={14} aria-hidden className="text-primary shrink-0" />}
      {children}
    </button>
  );
}

export function SearchFilters({
  current,
  cityOptions,
  clubOptions,
  compact,
}: {
  current: PlayerFilters;
  cityOptions: CityOption[];
  clubOptions: ClubOption[];
  compact: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const serialize = (f: PlayerFilters) =>
    playerFiltersToQuery({ ...f, page: 1 }, { compact, page: 1 });

  const [draft, setDraft] = useState<PlayerFilters>(current);
  const [q, setQ] = useState(current.q ?? '');
  const [showFilters, setShowFilters] = useState(activeFilterCount(current) > 0);

  const serialized = serialize(current);
  const lastPushed = useRef<string | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;

  /*
   * Resync only when the URL changed WITHOUT us - the back button, or a link from elsewhere. Our own
   * pushes echo back with the query we just sent, and resyncing on those would clobber whatever the
   * viewer typed while the navigation was in flight.
   */
  useEffect(() => {
    if (lastPushed.current === serialized) return;
    lastPushed.current = serialized;
    setDraft(currentRef.current);
    setQ(currentRef.current.q ?? '');
  }, [serialized]);

  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(next: PlayerFilters) {
    const qs = serialize(next);
    lastPushed.current = qs;
    startTransition(() => router.push(`/players${qs}`));
  }

  /** Discrete controls apply on the tap: there is nothing to finish typing. */
  function apply(patch: Partial<PlayerFilters>) {
    const next = { ...draft, q: q.trim() || undefined, ...patch };
    setDraft(next);
    push(next);
  }

  function onQueryChange(value: string) {
    setQ(value);
    if (textTimer.current) clearTimeout(textTimer.current);
    textTimer.current = setTimeout(() => {
      const next = { ...draft, q: value.trim() || undefined };
      setDraft(next);
      push(next);
    }, 400);
  }

  /** The slider fires continuously while dragging, so it settles before it navigates. */
  function onStsChange(value: number) {
    const next = { ...draft, q: q.trim() || undefined, minSts: value > 0 ? value : undefined };
    setDraft(next);
    if (stsTimer.current) clearTimeout(stsTimer.current);
    stsTimer.current = setTimeout(() => push(next), 300);
  }

  function toggleSkill(ordinal: number) {
    const selected = draft.skills ?? [];
    const next = selected.includes(ordinal)
      ? selected.filter((o) => o !== ordinal)
      : [...selected, ordinal].sort((a, b) => a - b);
    apply({ skills: next.length > 0 ? next : undefined });
  }

  function removeChip(key: FilterChipKey) {
    const next = clearFilter({ ...draft, q: q.trim() || undefined }, key);
    if (key === 'q') setQ('');
    setDraft(next);
    push(next);
  }

  function clearAll() {
    setQ('');
    setDraft({});
    push({});
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (textTimer.current) clearTimeout(textTimer.current);
    apply({});
  }

  const count = activeFilterCount(draft);
  const chips = describeActiveFilters(
    { ...draft, q: q.trim() || undefined },
    { cityOptions, clubOptions },
  );
  const minSts = draft.minSts ?? STS_MIN;

  return (
    <form
      onSubmit={submit}
      className="border-border bg-surface space-y-3 rounded-2xl border p-4"
      role="search"
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            aria-hidden
            className="text-foreground-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <input
            name="q"
            value={q}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by name, nickname or city"
            className={`${controlClass} pl-9`}
            aria-label="Search players"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className="border-border bg-surface text-foreground hover:bg-surface-muted inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium"
        >
          <SlidersHorizontal size={16} aria-hidden />
          Filters
          {count > 0 && (
            <span
              className="bg-primary inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white"
              aria-label={`${count} filter${count === 1 ? '' : 's'} applied`}
            >
              {count}
            </span>
          )}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="bg-primary inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-70"
        >
          {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
          Search
        </button>
      </div>

      {/* Every applied filter, individually removable. A filter you cannot see is a filter you
          cannot undo (§2B). */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => removeChip(chip.key)}
              className="border-primary/40 bg-primary/10 text-foreground hover:border-primary inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium"
            >
              {chip.label}
              <X size={12} aria-hidden />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-foreground-muted hover:text-foreground px-1.5 py-1 text-xs font-medium underline underline-offset-2"
          >
            Clear all
          </button>
        </div>
      )}

      {showFilters && (
        <div className="border-border space-y-5 border-t pt-4">
          {/* Skill: named, ordered, discrete - so it gets chips, not a two-thumb slider (§2B). */}
          <div>
            <span className={sectionLabel}>Skill level</span>
            <span className={sectionHint}>
              What the community rates them, or their own rating when nobody has vouched yet. Pick
              as many as you like.
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SKILL_BANDS.map((b) => (
                <TogglePill
                  key={b.key}
                  selected={(draft.skills ?? []).includes(b.ordinal)}
                  onClick={() => toggleSkill(b.ordinal)}
                >
                  {b.label}
                </TogglePill>
              ))}
            </div>
          </div>

          {/* STS: continuous, unnamed - the one control here a slider actually fits. */}
          <div>
            <label htmlFor="minSts" className={sectionLabel}>
              Minimum trust score
            </label>
            <span className={sectionHint}>
              How confident the community is about their level, 0 to 5. It is not a ranking of how
              good they are.
            </span>
            {/* The slider's height is written as an exact pixel value on purpose: the app sets a
                14px root font, so `h-11` renders 38.5px here, under the touch minimum. Measured on
                a real page rather than assumed. */}
            <div className="mt-2 flex items-center gap-3">
              <input
                id="minSts"
                type="range"
                min={STS_MIN}
                max={STS_MAX}
                step={STS_STEP}
                value={minSts}
                onChange={(e) => onStsChange(Number(e.target.value))}
                aria-valuetext={minSts === 0 ? 'Any' : `${minSts.toFixed(1)} and up`}
                className="accent-primary h-[44px] flex-1 cursor-pointer"
              />
              <span
                className="border-border text-foreground w-20 shrink-0 rounded-lg border px-2 py-1 text-center text-sm font-semibold tabular-nums"
                aria-hidden
              >
                {minSts === 0 ? 'Any' : `${minSts.toFixed(1)}+`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="city" className={sectionLabel}>
                City
              </label>
              <select
                id="city"
                value={draft.city ?? ''}
                onChange={(e) => apply({ city: e.target.value || undefined })}
                className={`${controlClass} mt-2`}
              >
                <option value="">Any city</option>
                {cityOptions.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label} ({c.count})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="club" className={sectionLabel}>
                Club
              </label>
              <select
                id="club"
                value={draft.club ?? ''}
                onChange={(e) => apply({ club: e.target.value || undefined })}
                className={`${controlClass} mt-2`}
              >
                <option value="">Any club</option>
                {clubOptions.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Three options do not need a menu. */}
          <div>
            <span className={sectionLabel} id="sex-label">
              Sex
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-labelledby="sex-label">
              <TogglePill selected={!draft.sex} onClick={() => apply({ sex: undefined })}>
                Any
              </TogglePill>
              <TogglePill
                selected={draft.sex === 'male'}
                onClick={() => apply({ sex: draft.sex === 'male' ? undefined : 'male' })}
              >
                Men
              </TogglePill>
              <TogglePill
                selected={draft.sex === 'female'}
                onClick={() => apply({ sex: draft.sex === 'female' ? undefined : 'female' })}
              >
                Women
              </TogglePill>
            </div>
          </div>

          <div>
            <span className={sectionLabel} id="only-label">
              Show only
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-labelledby="only-label">
              <TogglePill
                selected={!!draft.identityVerified}
                onClick={() => apply({ identityVerified: !draft.identityVerified })}
              >
                Identity verified
              </TogglePill>
              <TogglePill selected={!!draft.coach} onClick={() => apply({ coach: !draft.coach })}>
                Coaches
              </TogglePill>
              <TogglePill
                selected={!!draft.lookingForPartner}
                onClick={() => apply({ lookingForPartner: !draft.lookingForPartner })}
              >
                Looking for partner
              </TogglePill>
              <TogglePill
                selected={!!draft.openForSponsorship}
                onClick={() => apply({ openForSponsorship: !draft.openForSponsorship })}
              >
                Open to sponsorship
              </TogglePill>
            </div>
          </div>

          <div className="border-border flex items-center justify-between gap-3 border-t pt-3">
            <button
              type="button"
              onClick={clearAll}
              className="text-foreground-muted hover:text-foreground min-h-[44px] text-sm font-medium"
            >
              Clear all filters
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(false)}
              className="border-border text-foreground hover:bg-surface-muted min-h-[44px] rounded-xl border px-4 text-sm font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
