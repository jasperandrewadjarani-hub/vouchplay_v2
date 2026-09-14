'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import {
  signInWithPassword,
  requestEmailOtp,
  verifyEmailOtp,
  type FormState,
} from '@/lib/actions/auth';
import { Field, Input, FormError, FormMessage } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { SubmitButton } from '@/components/ui/button';

const empty: FormState = {};

export function LoginForm({ next }: { next?: string }) {
  // Password-first (master_plan §2BB addendum): the email-code path is demoted to a quiet fallback
  // link rather than an equal-weight tab, so a returning player with a password uses it (no email)
  // instead of habitually requesting a login code and burning the SMTP cap. The code path stays one
  // tap away for anyone who needs it.
  const [mode, setMode] = useState<'password' | 'code'>('password');

  return mode === 'password' ? (
    <PasswordLogin next={next} onUseCode={() => setMode('code')} />
  ) : (
    <CodeLogin next={next} onUsePassword={() => setMode('password')} />
  );
}

function FallbackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <p className="text-foreground-muted text-center text-xs">
      <button
        type="button"
        onClick={onClick}
        className="hover:text-foreground underline underline-offset-2"
      >
        {children}
      </button>
    </p>
  );
}

function PasswordLogin({ next, onUseCode }: { next?: string; onUseCode: () => void }) {
  const [state, action] = useActionState(signInWithPassword, empty);
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <FormError>{state.error}</FormError>
      <Field label="Email" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" required>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      <p className="text-foreground-muted text-center text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          Forgot password?
        </Link>
      </p>
      <FallbackLink onClick={onUseCode}>Sign in with an email code instead</FallbackLink>
    </form>
  );
}

function CodeLogin({ next, onUsePassword }: { next?: string; onUsePassword: () => void }) {
  const [request, requestAction] = useActionState(requestEmailOtp, empty);
  const [verify, verifyAction] = useActionState(verifyEmailOtp, empty);

  if (!request.ok) {
    return (
      <form action={requestAction} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <FormError>{request.error}</FormError>
        <Field label="Email" htmlFor="code-email" required hint="We'll email you a 6-digit code.">
          <Input id="code-email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton pendingLabel="Sending…">Email me a code</SubmitButton>
        <FallbackLink onClick={onUsePassword}>Sign in with your password instead</FallbackLink>
      </form>
    );
  }

  return (
    <form action={verifyAction} className="space-y-4">
      <FormMessage>{request.message}</FormMessage>
      <FormError>{verify.error}</FormError>
      <input type="hidden" name="email" value={request.email} />
      {request.next && <input type="hidden" name="next" value={request.next} />}
      <Field label="6-digit code" htmlFor="token" required>
        <Input
          id="token"
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
        />
      </Field>
      <SubmitButton pendingLabel="Verifying…">Verify &amp; sign in</SubmitButton>
    </form>
  );
}
