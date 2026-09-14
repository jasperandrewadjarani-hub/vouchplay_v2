'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { requestPasswordReset, resetPasswordWithCode, type FormState } from '@/lib/actions/auth';
import { Field, Input, FormError, FormMessage } from '@/components/ui/field';
import { PasswordPair } from '@/components/ui/password-input';
import { SubmitButton } from '@/components/ui/button';

const empty: FormState = {};
const RESEND_COOLDOWN_SECONDS = 30;

// Mirrors field.tsx's `controlClass` (out of scope for this change) with large, centered, spaced-out
// digits for a 6-digit code - easy to read and re-type for older / less tech-savvy users.
const codeInputClass =
  'w-full rounded-xl border border-border bg-background px-3.5 py-3 text-center text-2xl tracking-[0.5em] text-foreground placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * Reset password entirely inside the app (master_plan §2BD-A): one screen, two steps. Step 1 emails a
 * 6-digit code; step 2 verifies it and sets the new password. This never leaves the app, so it works
 * identically in the installed PWA, Safari, Chrome, and on a second device - unlike the emailed reset
 * link, whose PKCE verifier cookie only exists in the browser that requested it.
 */
export default function ForgotPasswordPage() {
  const [step, setStep] = useState<{ email: string; message?: string } | null>(null);

  return step ? (
    <CodeStep email={step.email} initialMessage={step.message} onBack={() => setStep(null)} />
  ) : (
    <RequestStep onSent={(email, message) => setStep({ email, message })} />
  );
}

function RequestStep({ onSent }: { onSent: (email: string, message?: string) => void }) {
  const [state, action] = useActionState(requestPasswordReset, empty);

  useEffect(() => {
    if (state.ok && state.email) onSent(state.email, state.message);
  }, [state.ok, state.email, state.message, onSent]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">Reset password</h1>
        <p className="text-foreground-muted text-sm">
          Enter your email and we&apos;ll send you a 6-digit code.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <FormError>{state.error}</FormError>
        <Field label="Email" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton pendingLabel="Sending…">Email me a code</SubmitButton>
      </form>

      <p className="text-foreground-muted text-center text-sm">
        <Link href="/login" className="text-primary font-medium hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

function CodeStep({
  email,
  initialMessage,
  onBack,
}: {
  email: string;
  initialMessage?: string;
  onBack: () => void;
}) {
  const [reset, resetAction] = useActionState(resetPasswordWithCode, empty);
  const [resend, resendAction] = useActionState(requestPasswordReset, empty);
  const [message, setMessage] = useState(
    initialMessage ?? `We emailed a 6-digit code to ${email}.`,
  );
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  // A resend re-submits requestPasswordReset (a fresh useActionState instance from this one) - refresh
  // the banner and restart the 30-second cooldown whenever it succeeds.
  useEffect(() => {
    if (resend.ok) {
      if (resend.message) setMessage(resend.message);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    }
  }, [resend.ok, resend.message]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">Enter your code</h1>
      </div>

      <form action={resetAction} className="space-y-4">
        <FormMessage>{message}</FormMessage>
        <FormError>{reset.error}</FormError>
        <input type="hidden" name="email" value={email} />
        <Field label="Code" htmlFor="token" required>
          <input
            id="token"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            className={codeInputClass}
          />
        </Field>
        <PasswordPair passwordId="reset-password" confirmId="reset-confirm" />
        <SubmitButton pendingLabel="Setting password…">Set password &amp; sign in</SubmitButton>
      </form>

      <div className="flex items-center justify-between text-sm">
        <form action={resendAction}>
          <input type="hidden" name="email" value={email} />
          <button
            type="submit"
            disabled={cooldown > 0}
            className="text-foreground-muted hover:text-foreground underline underline-offset-2 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
        </form>
        <button
          type="button"
          onClick={onBack}
          className="text-foreground-muted hover:text-foreground underline underline-offset-2"
        >
          Use a different email
        </button>
      </div>

      <p className="text-foreground-muted text-center text-sm">
        <Link href="/login" className="text-primary font-medium hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
