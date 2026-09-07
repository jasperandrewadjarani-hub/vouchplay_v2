'use client';
export default function ErrorState({ reset }: { reset: () => void }) {
  return (
    <div className="border-danger/40 bg-danger/5 rounded-2xl border p-5" role="alert">
      <h1 className="text-foreground font-semibold">Rankings could not be loaded</h1>
      <p className="text-foreground-muted mt-1 text-sm">
        The last published data has not been replaced. Try the read again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="border-border bg-surface text-foreground mt-4 rounded-xl border px-4 py-2 text-sm font-semibold"
      >
        Try again
      </button>
    </div>
  );
}
