'use client';

import { useActionState } from 'react';
import { requestEmailOtp, verifyEmailOtp, type FormState } from '@/lib/actions/auth';
import { Field, Input, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: FormState = {};

/**
 * Email signup: enter email → receive a 6-digit code → verify. Verifying creates the session and
 * redirects to onboarding (handover §7.1). A password can be set later from settings.
 */
export function SignupForm({ next }: { next?: string }) {
  const [request, requestAction] = useActionState(requestEmailOtp, empty);
  const [verify, verifyAction] = useActionState(verifyEmailOtp, empty);

  if (!request.ok) {
    return (
      <form action={requestAction} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <FormError>{request.error}</FormError>
        <Field
          label="Email"
          htmlFor="signup-email"
          required
          hint="We'll email a 6-digit code to verify it's you."
        >
          <Input id="signup-email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton pendingLabel="Sending…">Send verification code</SubmitButton>
      </form>
    );
  }

  return (
    <form action={verifyAction} className="space-y-4">
      <FormMessage>{request.message}</FormMessage>
      <FormError>{verify.error}</FormError>
      <input type="hidden" name="email" value={request.email} />
      {request.next && <input type="hidden" name="next" value={request.next} />}
      <Field label="6-digit code" htmlFor="signup-token" required>
        <Input
          id="signup-token"
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
        />
      </Field>
      <SubmitButton pendingLabel="Verifying…">Verify email</SubmitButton>
    </form>
  );
}
