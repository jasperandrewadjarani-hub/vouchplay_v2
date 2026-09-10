'use client';
import { useEffect, useRef } from 'react';
import { isChunkLoadError } from '@/lib/navigation/error-telemetry';

export default function ErrorState({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunkStale = isChunkLoadError(error);
  const healed = useRef(false);

  // Auto-heal deployment skew (§2Q): a chunk orphaned by a deploy cannot be recovered by reset(), so
  // hard-reload once (guarded per deploy version so it never loops) to fetch the current build.
  useEffect(() => {
    if (healed.current || !chunkStale) return;
    healed.current = true;
    try {
      const key = `vp:skew-reload:${process.env.NEXT_PUBLIC_DEPLOY_VERSION ?? 'dev'}`;
      if (sessionStorage.getItem(key) !== '1') {
        sessionStorage.setItem(key, '1');
        window.location.reload();
      }
    } catch {
      /* sessionStorage blocked - fall through to the manual retry button */
    }
  }, [chunkStale]);

  return (
    <div className="border-danger/40 bg-danger/5 rounded-2xl border p-5" role="alert">
      <h1 className="text-foreground font-semibold">Rankings could not be loaded</h1>
      <p className="text-foreground-muted mt-1 text-sm">
        The last published data has not been replaced. Try the read again.
      </p>
      <button
        type="button"
        onClick={() => (chunkStale ? window.location.reload() : reset())}
        className="border-border bg-surface text-foreground mt-4 rounded-xl border px-4 py-2 text-sm font-semibold"
      >
        Try again
      </button>
    </div>
  );
}
