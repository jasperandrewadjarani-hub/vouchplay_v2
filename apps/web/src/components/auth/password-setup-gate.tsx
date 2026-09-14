'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { setPassword, signOut, type FormState } from '@/lib/actions/auth';
import { Field, Input, FormError } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: FormState = {};

/**
 * Blocking password gate (master_plan §2BB). Shown once to a signed-in, onboarded email user who has
 * no password yet (`profiles.password_set = false`). It overlays everything - above the header and
 * bottom nav - so the app is unusable until they set a password, which converts them to password
 * sign-in and stops the daily login-code emails (SMTP cost).
 *
 * Framed as a benefit, not a chore: setting a password lets them skip the emailed code next time.
 * Federated (Google) users and anyone who already has a password are never shown this. A small "Sign
 * out" escape valve covers the rare "wrong account" case without weakening the gate.
 */
export function PasswordSetupGate({ email }: { email: string | null }) {
  const router = useRouter();
  const [state, action] = useActionState(setPassword, empty);

  // On success the flag flips server-side; refresh so the shell re-reads it and the gate disappears.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-gate-title"
    >
      <div className="border-border bg-surface w-full max-w-md overflow-hidden rounded-2xl border shadow-xl">
        <div className="vp-gradient h-1" aria-hidden />
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <KeyRound className="text-primary shrink-0" size={20} aria-hidden />
            <h1 id="password-gate-title" className="text-foreground text-base font-semibold">
              Set a password
            </h1>
          </div>
          <p className="text-foreground-muted mt-1 text-sm">
            Create a password so you can sign in instantly next time &mdash; no emailed code to wait
            for.
          </p>

          <form action={action} className="mt-4 space-y-4">
            <FormError>{state.error}</FormError>
            <Field label="New password" htmlFor="gate-password" required hint="At least 8 characters.">
              <Input
                id="gate-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Confirm password" htmlFor="gate-confirm" required>
              <Input
                id="gate-confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
              />
            </Field>
            <SubmitButton pendingLabel="Saving…">Save and continue</SubmitButton>
          </form>

          <p className="text-foreground-muted mt-4 text-center text-xs">
            {email ? `Signed in as ${email}. ` : ''}Not you?{' '}
            <button
              type="button"
              onClick={() => signOut()}
              className="text-primary font-medium hover:underline"
            >
              Sign out
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
