import { googleSignIn } from '@/lib/actions/auth';
import { publicEnv } from '@/lib/env';
import { SubmitButton } from '@/components/ui/button';

/** Google sign-in button. Renders only when Google auth is enabled for this environment. */
export function GoogleButton({ next }: { next?: string }) {
  if (!publicEnv.googleAuthEnabled) return null;

  return (
    <form action={googleSignIn}>
      {next && <input type="hidden" name="next" value={next} />}
      <SubmitButton variant="secondary" pendingLabel="Redirecting…">
        <GoogleGlyph />
        Continue with Google
      </SubmitButton>
    </form>
  );
}

/** Google button plus an "or" divider — the whole block disappears when Google is disabled. */
export function GoogleSection({ next }: { next?: string }) {
  if (!publicEnv.googleAuthEnabled) return null;

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
