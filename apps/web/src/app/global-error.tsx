'use client';

import { useEffect, useRef } from 'react';
import { buildErrorTelemetry } from '@/lib/navigation/error-telemetry';

/**
 * Root fallback for failures in the root layout itself (Phase 13.5). It replaces the whole document,
 * so it renders its own html/body and uses inline styles rather than app theme tokens. Kept minimal:
 * a clear retry and privacy-safe telemetry, never a generic unrecoverable crash.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    const body = buildErrorTelemetry({
      error,
      route: typeof location !== 'undefined' ? location.pathname : '/',
      visibility: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
      persistedRestore: false,
      deployVersion: process.env.NEXT_PUBLIC_DEPLOY_VERSION ?? 'dev',
      scope: 'global',
    });
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#0b0b0f',
          color: '#f5f5f7',
        }}
      >
        <main style={{ maxWidth: 420, padding: 24, textAlign: 'center' }} role="alert">
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>VouchPlay hit a snag</h1>
          <p style={{ fontSize: 14, opacity: 0.8, marginTop: 8 }}>
            Please try again. If this keeps happening, reload the page.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 12,
              border: '1px solid #33333a',
              background: '#1a1a20',
              color: '#f5f5f7',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
