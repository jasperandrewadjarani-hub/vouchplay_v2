// Only auto-refresh a returning PWA tab after a genuinely long idle (5 min), not on every quick
// tab-out/in. A shorter window fired a full server re-render on ordinary focus changes, which was a
// large, avoidable driver of Vercel function invocations (master_plan §2AE). A BFCache restore still
// refreshes immediately, and any navigation/manual action refreshes as before.
export const RESUME_IDLE_MS = 300_000;
export const RESUME_REFRESH_DEDUPE_MS = 15_000;

export interface ResumeRefreshInput {
  now: number;
  hiddenAt: number | null;
  lastRefreshAt: number | null;
  persistedRestore: boolean;
}

/**
 * Keeps mobile/browser suspension recovery deterministic and testable. We refresh only after a
 * meaningful hidden interval or a BFCache restore, never for an ordinary focus change.
 */
export function shouldRefreshOnResume({
  now,
  hiddenAt,
  lastRefreshAt,
  persistedRestore,
}: Readonly<ResumeRefreshInput>): boolean {
  if (lastRefreshAt !== null && now - lastRefreshAt < RESUME_REFRESH_DEDUPE_MS) return false;
  if (persistedRestore) return true;
  return hiddenAt !== null && now - hiddenAt >= RESUME_IDLE_MS;
}
