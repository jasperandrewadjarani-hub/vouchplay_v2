import { Loader2 } from 'lucide-react';

/** Brand spinner. Uses Tailwind's animate-spin (stilled under prefers-reduced-motion by globals). */
export function Spinner({ size = 28, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`text-primary animate-spin ${className}`} aria-hidden />;
}

/** Centered loading cue for route transitions (rendered by loading.tsx). Spinner only. */
export function LoadingScreen() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-[60vh] items-center justify-center"
    >
      <Spinner size={34} />
    </div>
  );
}
