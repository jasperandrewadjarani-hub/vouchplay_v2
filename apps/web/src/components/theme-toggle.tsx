'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';

/** Cycles light → dark → system. Icon-only. Avoids hydration mismatch by rendering after mount. */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Standard next-themes hydration guard: theme is only known client-side, so we render a stable
  // placeholder until mounted to avoid a server/client mismatch.
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

  const Icon = !mounted ? Sun : theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Switch theme. Current: ${label}`}
      title={label}
      className="border-border bg-surface text-foreground hover:bg-surface-muted inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors"
    >
      <Icon size={16} aria-hidden suppressHydrationWarning />
    </button>
  );
}
