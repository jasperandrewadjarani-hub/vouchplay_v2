import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';
import { GoogleSection } from '@/components/auth/google-button';
import { FormError } from '@/components/ui/field';

export const metadata: Metadata = { title: 'Sign in' };

const errorMessages: Record<string, string> = {
  auth: 'That sign-in link was invalid or expired. Please try again.',
  missing_code: 'Sign-in did not complete. Please try again.',
  unavailable: 'Sign-in is temporarily unavailable. Please try again shortly.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-foreground-muted text-sm">Sign in to vouch, join clubs, and register.</p>
      </div>

      {error && (
        <FormError>{errorMessages[error] ?? 'Something went wrong. Please try again.'}</FormError>
      )}

      <GoogleSection next={next} />

      <LoginForm next={next} />

      <p className="text-foreground-muted text-center text-sm">
        New to VouchPlay?{' '}
        <Link href="/signup" className="text-primary font-medium hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
