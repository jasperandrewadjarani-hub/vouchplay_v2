import { signOut } from '@/lib/actions/auth';
import { SubmitButton } from '@/components/ui/button';

/** Sign-out control (server action form). */
export function SignOutButton() {
  return (
    <form action={signOut}>
      <SubmitButton variant="secondary" pendingLabel="Signing out…">
        Sign out
      </SubmitButton>
    </form>
  );
}
