import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getMyProfile, postAuthPath } from '@/lib/auth';
import { publicEnv } from '@/lib/env';

/**
 * Auth callback (handover §7). Handles both the OAuth PKCE `code` (Google) and the email magic-link
 * `token_hash` + `type`. On success, routes to onboarding if the profile is incomplete, else to
 * `next` (default home). Errors bounce back to /login.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const next = url.searchParams.get('next') ?? '/';
  const site = publicEnv.siteUrl;

  try {
    const supabase = await createClient();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return NextResponse.redirect(new URL('/login?error=auth', site));
      // Federated sign-in (Google) authenticates without a password, so exempt these users from the
      // mandatory password gate (§2BB) - forcing a password on an OAuth account is pointless and
      // sends no email. Only mark the flag when the provider is genuinely non-email; an email
      // magic-link also arrives here as a `code`, and those users SHOULD still be prompted. Best-
      // effort: a failure (e.g. before migration 0050) is harmless because the gate reader fails open.
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const provider = user?.app_metadata?.provider;
        const federated =
          (provider && provider !== 'email') ||
          (user?.app_metadata?.providers?.some((p: string) => p !== 'email') ?? false);
        if (user && federated) {
          await createServiceClient()
            .from('profiles')
            .update({ password_set: true })
            .eq('id', user.id);
        }
      } catch {
        // non-fatal - gate reader fails open
      }
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) return NextResponse.redirect(new URL('/login?error=auth', site));
    } else {
      return NextResponse.redirect(new URL('/login?error=missing_code', site));
    }

    const profile = await getMyProfile();
    return NextResponse.redirect(new URL(postAuthPath(profile, next), site));
  } catch {
    return NextResponse.redirect(new URL('/login?error=unavailable', site));
  }
}
