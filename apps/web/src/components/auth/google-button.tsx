'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Google sign-in. Renders only when Google auth is enabled for this environment.
 *
 * The OAuth start runs CLIENT-side via the Supabase browser client: `signInWithOAuth` sets
 * `window.location` to Google's consent URL itself. (A Server Action calling `redirect()` to an
 * external URL does not reliably navigate the browser in Next 15 - hence the client approach.)
 */
export function GoogleButton({ next }: { next?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED !== 'true') return null;

  async function signIn() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback${
        next ? `?next=${encodeURIComponent(next)}` : ''
      }`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      // On success Supabase redirects the browser to Google; we only reach here on error.
      if (oauthError) {
        setError('Google sign-in is unavailable right now.');
        setLoading(false);
      }
    } catch {
      setError('Google sign-in is not configured yet.');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={signIn}
        disabled={loading}
        className="border-border bg-surface text-foreground hover:bg-surface-muted inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleGlyph />
        {loading ? 'Redirecting…' : 'Continue with Google'}
      </button>
      {error && (
        <p role="alert" className="text-danger text-center text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

/** Google button plus an "or" divider - the whole block disappears when Google is disabled. */
export function GoogleSection({ next }: { next?: string }) {
  if (process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED !== 'true') return null;

  return (
    <>
      <GoogleButton next={next} />
      <div className="text-foreground-muted flex items-center gap-3 text-xs">
        <span className="bg-border h-px flex-1" />
        or
        <span className="bg-border h-px flex-1" />
      </div>
    </>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.3C39.7 36 44 30.6 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
