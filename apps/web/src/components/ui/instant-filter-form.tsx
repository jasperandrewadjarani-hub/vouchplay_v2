'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const input =
  'rounded-xl border border-border bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * Debounced instant-filter bar for the clubs / tournaments directories. Navigates to `basePath` with
 * `q`, `city`, and (optionally) `verified` params as the user types - no explicit Search click. A
 * 350ms debounce keeps requests reasonable; reads are cache-first.
 */
export function InstantFilterForm({
  basePath,
  initialQ = '',
  initialCity = '',
  initialVerified = false,
  showVerified = false,
  placeholder = 'Search',
}: {
  basePath: string;
  initialQ?: string;
  initialCity?: string;
  initialVerified?: boolean;
  showVerified?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [city, setCity] = useState(initialCity);
  const [verified, setVerified] = useState(initialVerified);
  const [searching, setSearching] = useState(false);
  const [routePending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearching(false);
  }, [initialQ, initialCity, initialVerified]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function apply(nextQ: string, nextCity: string, nextVerified: boolean, immediate = false) {
    if (timer.current) clearTimeout(timer.current);
    setSearching(true);
    const go = () => {
      const p = new URLSearchParams();
      if (nextQ.trim()) p.set('q', nextQ.trim());
      if (nextCity.trim()) p.set('city', nextCity.trim());
      if (showVerified && nextVerified) p.set('verified', '1');
      const s = p.toString();
      const target = s ? `${basePath}?${s}` : basePath;
      const current = new URLSearchParams();
      if (initialQ.trim()) current.set('q', initialQ.trim());
      if (initialCity.trim()) current.set('city', initialCity.trim());
      if (showVerified && initialVerified) current.set('verified', '1');
      const currentString = current.toString();
      const currentTarget = currentString ? `${basePath}?${currentString}` : basePath;
      if (target === currentTarget) {
        setSearching(false);
        return;
      }
      startTransition(() => router.push(target));
    };
    if (immediate) go();
    else timer.current = setTimeout(go, 350);
  }

  const busy = searching || routePending;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={busy}>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          apply(e.target.value, city, verified);
        }}
        placeholder={placeholder}
        className={`${input} min-w-40 flex-1`}
        aria-label={placeholder}
      />
      <input
        value={city}
        onChange={(e) => {
          setCity(e.target.value);
          apply(q, e.target.value, verified);
        }}
        placeholder="City"
        className={`${input} w-32`}
        aria-label="City"
      />
      {showVerified && (
        <label className="border-border bg-surface text-foreground flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => {
              setVerified(e.target.checked);
              apply(q, city, e.target.checked, true);
            }}
          />
          Verified only
        </label>
      )}
      <span
        className={`text-primary inline-flex min-w-20 items-center gap-1.5 text-xs font-medium transition-opacity ${busy ? 'opacity-100' : 'opacity-0'}`}
        aria-live="polite"
        aria-hidden={!busy}
      >
        <Loader2 size={14} className="animate-spin" aria-hidden />
        Searching…
      </span>
    </div>
  );
}
