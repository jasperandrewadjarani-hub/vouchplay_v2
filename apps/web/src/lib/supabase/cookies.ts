import type { CookieOptions } from '@supabase/ssr';

// Keep signed-in users signed in "always" (master_plan §2BB): make the auth cookies persistent
// (survive a browser restart) instead of session cookies, capped at Chrome's 400-day cookie ceiling.
// The middleware re-writes these on every navigation, so the window rolls forward and the real
// session lifetime is governed by Supabase's refresh token. Only defaulted when the caller has not
// set an explicit lifetime, so sign-out's deletion (maxAge:0 / past expires) is never overridden.
//
// Lives in its own module (no `next/headers` import) so it is safe to use from BOTH the server client
// and the Edge middleware.
export const PERSISTENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export function withPersistentMaxAge(options: CookieOptions | undefined): CookieOptions {
  if (options && (options.maxAge != null || options.expires != null)) return options;
  return { ...options, maxAge: PERSISTENT_COOKIE_MAX_AGE };
}
