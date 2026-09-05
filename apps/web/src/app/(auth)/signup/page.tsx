import type { Metadata } from 'next';
import Link from 'next/link';
import { SignupForm } from '@/components/auth/signup-form';
import { GoogleSection } from '@/components/auth/google-button';

export const metadata: Metadata = { title: 'Create account' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="text-foreground-muted text-sm">
          Build a trusted player profile the community vouches for.
        </p>
      </div>

      <GoogleSection next={next} />

      <SignupForm next={next} />

      <p className="text-foreground-muted text-center text-xs">
        By continuing you agree to VouchPlay&apos;s{' '}
        <Link href="/terms" className="underline">
          Terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline">
          Privacy Notice
        </Link>
        .
      </p>

      <p className="text-foreground-muted text-center text-sm">
        Already have an account?{' '}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
          className="text-primary font-medium hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
