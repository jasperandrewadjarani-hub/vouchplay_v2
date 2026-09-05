'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordReset, type FormState } from '@/lib/actions/auth';
import { Field, Input, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: FormState = {};

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(requestPasswordReset, empty);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">Reset password</h1>
        <p className="text-foreground-muted text-sm">
          Enter your email and we&apos;ll send a reset link.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
        <FormError>{state.error}</FormError>
        <Field label="Email" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
      </form>

      <p className="text-foreground-muted text-center text-sm">
        <Link href="/login" className="text-primary font-medium hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
