'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

/**
 * Light/Dark toggle. The initial theme is "system" (set on the provider), but this control switches
 * explicitly between light and dark based on what's currently showing. Icon-only.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Hydration guard: resolvedTheme is only known client-side.
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';
  const label = !mounted ? 'Theme' : isDark ? 'Switch to light' : 'Switch to dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className="border-border bg-surface text-foreground hover:bg-surface-muted inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors"
    >
      {isDark ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
    </button>
  );
}
