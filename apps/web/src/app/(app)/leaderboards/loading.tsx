export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="bg-surface-muted h-20 animate-pulse rounded-2xl" />
      <div className="bg-surface-muted h-72 animate-pulse rounded-2xl" />
      <span className="sr-only">Loading leaderboard…</span>
    </div>
  );
}
