'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(nextQ: string, nextCity: string, nextVerified: boolean, immediate = false) {
    if (timer.current) clearTimeout(timer.current);
    const go = () => {
      const p = new URLSearchParams();
      if (nextQ.trim()) p.set('q', nextQ.trim());
      if (nextCity.trim()) p.set('city', nextCity.trim());
      if (showVerified && nextVerified) p.set('verified', '1');
      const s = p.toString();
      router.push(s ? `${basePath}?${s}` : basePath);
    };
    if (immediate) go();
    else timer.current = setTimeout(go, 350);
  }

  return (
    <div className="flex flex-wrap gap-2">
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
    </div>
  );
}
