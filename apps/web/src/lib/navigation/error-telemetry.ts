/**
 * Pure helpers for the App Router error boundaries (Phase 13.5 long-idle recovery). Kept free of
 * React and browser globals so the classification and the privacy-safe payload shape are unit
 * tested. A long-idle tab that woke with an expired session throws auth-shaped errors; we surface a
 * sign-in path for those and a plain retry otherwise.
 */

const AUTH_STALE_PATTERNS = [
  'jwt expired',
  'jwt',
  'refresh token',
  'not authenticated',
  'auth session missing',
  'invalid session',
  'session expired',
  '401',
  'unauthorized',
];

export function isAuthStaleError(error: { message?: string; name?: string } | null): boolean {
  if (!error) return false;
  const haystack = `${error.name ?? ''} ${error.message ?? ''}`.toLowerCase();
  return AUTH_STALE_PATTERNS.some((p) => haystack.includes(p));
}

/**
 * Stale-asset signatures. A tab left open across a deploy points at immutable chunks whose hashes no
 * longer exist, so the next chunk/RSC fetch fails with one of these. React's reset() re-renders the
 * same stale tree and fails again; the correct recovery is a one-time hard reload to the current
 * build (see the App Router error boundaries, §2Q). Kept narrow and unambiguous so an ordinary render
 * bug is never mistaken for skew.
 */
const CHUNK_LOAD_PATTERNS = [
  'chunkloaderror',
  'loading chunk',
  'loading css chunk',
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
];

export function isChunkLoadError(error: { message?: string; name?: string } | null): boolean {
  if (!error) return false;
  const haystack = `${error.name ?? ''} ${error.message ?? ''}`.toLowerCase();
  return CHUNK_LOAD_PATTERNS.some((p) => haystack.includes(p));
}

export interface ClientErrorTelemetry {
  route: string;
  digest: string | null;
  name: string | null;
  visibility: string;
  persistedRestore: boolean;
  authStale: boolean;
  deployVersion: string;
  scope: 'app' | 'global';
}

/**
 * Build the allowlisted telemetry body. The error message is deliberately excluded because it can
 * carry interpolated user input; only the error name/kind and digest are sent.
 */
export function buildErrorTelemetry(input: {
  error: { name?: string; digest?: string; message?: string } | null;
  route: string;
  visibility: string;
  persistedRestore: boolean;
  deployVersion: string;
  scope: 'app' | 'global';
}): ClientErrorTelemetry {
  return {
    route: input.route.slice(0, 200),
    digest: input.error?.digest ? input.error.digest.slice(0, 200) : null,
    name: input.error?.name ? input.error.name.slice(0, 200) : null,
    visibility: input.visibility || 'unknown',
    persistedRestore: input.persistedRestore === true,
    authStale: isAuthStaleError(input.error),
    deployVersion: (input.deployVersion || 'unknown').slice(0, 200),
    scope: input.scope,
  };
}
