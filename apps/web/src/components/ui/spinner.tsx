import { Loader2 } from 'lucide-react';

/** Brand spinner. Uses Tailwind's animate-spin (stilled under prefers-reduced-motion by globals). */
export function Spinner({ size = 28, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`text-primary animate-spin ${className}`} aria-hidden />;
}

/** Centered loading cue for route transitions (rendered by loading.tsx). */
export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3"
    >
      <Spinner size={34} />
      <span className="text-foreground-muted text-sm font-medium">{label}</span>
    </div>
  );
}
