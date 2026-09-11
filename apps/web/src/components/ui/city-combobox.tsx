'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { MapPin, Check } from 'lucide-react';
import { PH_CITIES, isValidPhCity } from '@vouchplay/config';

/**
 * City picker (master_plan §2AI). City is now a REQUIRED, VALIDATED Philippine place: a native
 * `<datalist>` only suggests, it never restricts, so players could still type "Za" and submit. This
 * is a real combobox - type to filter, pick from the list, and only a listed city/municipality can be
 * chosen. It sets a custom validity while the typed value is not a valid place, so the browser blocks
 * submit and shows a plain message; the server (`onboardingSchema`) is the authoritative backstop.
 *
 * Built for a non-technical, mixed-age audience: "start typing your city", big tap targets, a visible
 * hint, and full keyboard + screen-reader support. Filters to the top matches so it stays fast over
 * the ~1,600 cities + municipalities.
 */
const MAX_RESULTS = 30;

export function CityCombobox({
  id,
  name = 'city',
  defaultValue = '',
  required = false,
}: {
  /** Matches the surrounding <Field htmlFor> so the label focuses this input. */
  id?: string;
  name?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Lowercased index once; filtering is a cheap contains match, prioritising prefix hits.
  const index = useMemo(() => PH_CITIES.map((c) => ({ name: c, key: c.toLowerCase() })), []);
  const query = value.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return index.slice(0, MAX_RESULTS).map((x) => x.name);
    const starts: string[] = [];
    const contains: string[] = [];
    for (const x of index) {
      if (x.key.startsWith(query)) starts.push(x.name);
      else if (x.key.includes(query)) contains.push(x.name);
      if (starts.length >= MAX_RESULTS) break;
    }
    return [...starts, ...contains].slice(0, MAX_RESULTS);
  }, [index, query]);

  const valid = isValidPhCity(value);
  // Block submit (and show the browser message) whenever a non-empty value is not a real place.
  const syncValidity = (v: string) => {
    const el = inputRef.current;
    if (!el) return;
    el.setCustomValidity(
      v.trim() && !isValidPhCity(v) ? 'Please choose your city from the list.' : '',
    );
  };

  const choose = (city: string) => {
    setValue(city);
    setOpen(false);
    syncValidity(city);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showInvalid = value.trim().length > 0 && !valid && !open;

  return (
    <div className="relative">
      <div className="relative">
        <MapPin
          size={16}
          aria-hidden
          className="text-foreground-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        />
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          value={value}
          required={required}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder="Start typing your city…"
          className="border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border py-2.5 pr-3 pl-9 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          onChange={(e) => {
            setValue(e.target.value);
            setActive(0);
            setOpen(true);
            syncValidity(e.target.value);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        {valid && value.trim() && (
          <Check
            size={16}
            aria-hidden
            className="text-success absolute top-1/2 right-3 -translate-y-1/2"
          />
        )}
      </div>

      {open && matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="border-border bg-surface absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border py-1 shadow-lg"
        >
          {matches.map((city, i) => (
            <li key={city} role="option" aria-selected={i === active}>
              <button
                type="button"
                // onMouseDown (not onClick) so it fires before the input's onBlur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(city);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-11 w-full items-center px-3 text-left text-sm ${
                  i === active ? 'bg-primary/10 text-foreground' : 'text-foreground-muted'
                }`}
              >
                {city}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showInvalid ? (
        <p className="text-danger mt-1 text-xs">Choose your city from the list.</p>
      ) : (
        <p className="text-foreground-muted mt-1 text-xs">
          Type to search Philippine cities and municipalities, then pick yours.
        </p>
      )}
    </div>
  );
}
