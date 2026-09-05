'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/** Cycles light → dark → system. Avoids hydration mismatch by rendering after mount. */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Standard next-themes hydration guard: theme is only known client-side, so we render a stable
  // label until mounted to avoid a server/client mismatch. Setting state once on mount is intended.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const label = !mounted
    ? 'Theme'
    : theme === 'system'
      ? `System (${resolvedTheme})`
      : theme === 'dark'
        ? 'Dark'
        : 'Light';

  function cycle() {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Switch theme. Current: ${label}`}
      className="border-border bg-surface text-foreground hover:bg-surface-muted rounded-full border px-3 py-1.5 text-sm font-medium transition-colors"
    >
      <span suppressHydrationWarning>{mounted ? label : 'Theme'}</span>
    </button>
  );
}
