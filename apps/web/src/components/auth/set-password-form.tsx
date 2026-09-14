'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { setPassword, type FormState } from '@/lib/actions/auth';
import { FormError, FormMessage } from '@/components/ui/field';
import { PasswordPair } from '@/components/ui/password-input';
import { SubmitButton } from '@/components/ui/button';

const empty: FormState = {};

/**
 * Set / change password. Lands here from a reset link (the recovery token establishes a session via
 * /auth/callback) or from account settings. Uses the existing `setPassword` server action.
 */
export function SetPasswordForm() {
  const [state, action] = useActionState(setPassword, empty);

  return (
    <form action={action} className="space-y-4">
      <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
      <FormError>{state.error}</FormError>
      <PasswordPair passwordId="password" confirmId="confirm" />
      <SubmitButton pendingLabel="Saving…">Save password</SubmitButton>
      {state.ok && (
        <p className="text-foreground-muted text-center text-sm">
          <Link href="/me" className="text-primary hover:underline">
            Back to my account
          </Link>
        </p>
      )}
    </form>
  );
}
