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
import { SubmitButton } from '@/components/ui/button';

const empty: FormState = {};

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<'password' | 'code'>('password');

  return (
    <div className="space-y-5">
      <div className="border-border bg-surface grid grid-cols-2 gap-1 rounded-xl border p-1">
        <TabButton active={mode === 'password'} onClick={() => setMode('password')}>
          Password
        </TabButton>
        <TabButton active={mode === 'code'} onClick={() => setMode('code')}>
          Email code
        </TabButton>
      </div>

      {mode === 'password' ? <PasswordLogin next={next} /> : <CodeLogin />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-surface-muted text-foreground' : 'text-foreground-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function PasswordLogin({ next }: { next?: string }) {
  const [state, action] = useActionState(signInWithPassword, empty);
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <FormError>{state.error}</FormError>
      <Field label="Email" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      <p className="text-foreground-muted text-center text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          Forgot password?
        </Link>
      </p>
    </form>
  );
}

function CodeLogin() {
  const [request, requestAction] = useActionState(requestEmailOtp, empty);
  const [verify, verifyAction] = useActionState(verifyEmailOtp, empty);

  if (!request.ok) {
    return (
      <form action={requestAction} className="space-y-4">
        <FormError>{request.error}</FormError>
        <Field label="Email" htmlFor="code-email" required hint="We'll email you a 6-digit code.">
          <Input id="code-email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton pendingLabel="Sending…">Email me a code</SubmitButton>
      </form>
    );
  }

  return (
    <form action={verifyAction} className="space-y-4">
      <FormMessage>{request.message}</FormMessage>
      <FormError>{verify.error}</FormError>
      <input type="hidden" name="email" value={request.email} />
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
