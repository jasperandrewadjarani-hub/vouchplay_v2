'use client';

import { signOut } from '@/lib/actions/auth';
import { SubmitButton } from '@/components/ui/button';

/** Sign-out control (server action form) with a confirmation prompt. */
export function SignOutButton() {
  return (
    <form
      action={signOut}
      onSubmit={(e) => {
        if (!confirm('Sign out of VouchPlay?')) e.preventDefault();
      }}
    >
      <SubmitButton variant="secondary" pendingLabel="Signing out…">
        Sign out
      </SubmitButton>
    </form>
  );
}
