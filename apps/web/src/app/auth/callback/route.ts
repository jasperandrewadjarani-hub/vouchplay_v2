import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
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
