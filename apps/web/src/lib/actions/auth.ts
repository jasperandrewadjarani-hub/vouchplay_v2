'use server';

import { redirect } from 'next/navigation';
import {
  requestOtpSchema,
  verifyOtpSchema,
  signInWithPasswordSchema,
  setPasswordSchema,
  resetPasswordRequestSchema,
  resetPasswordWithCodeSchema,
} from '@vouchplay/validation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getMyProfile, postAuthPath } from '@/lib/auth';
import { publicEnv } from '@/lib/env';
import { loadSettingFlag } from '@/lib/settings';

export interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
  email?: string;
  /** Carried through the OTP request→verify steps so the protected action resumes after auth. */
  next?: string;
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Please check your input.';
}

function callbackUrl(next?: string): string {
  const base = `${publicEnv.siteUrl}/auth/callback`;
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}

/**
 * Best-effort: flips `profiles.password_set` so the mandatory password gate (§2BB) stops showing for
 * this account. Uses the service client because RLS does not let a session write this column on
 * itself. Shared by `setPassword` and `resetPasswordWithCode` (§2BD-A) - a failure here must never
 * fail the password change itself; the gate reader fails open and the next password action retries.
 */
async function markPasswordSet(userId: string): Promise<void> {
  try {
    await createServiceClient().from('profiles').update({ password_set: true }).eq('id', userId);
  } catch {
    // non-fatal - see doc comment above
  }
}

/** Step 1 of email signup/login: send a 6-digit code (also a magic link) to the address. */
export async function requestEmailOtp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = requestOtpSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const next = (formData.get('next') as string | null) ?? undefined;

  // Consent at collection (§2R): the signup form marks intent=signup and requires the agreement box.
  // Login uses the same action without that marker and is unaffected (existing users accept at the
  // in-app gate instead). Defense-in-depth behind the client-side required checkbox.
  if (formData.get('intent') === 'signup' && formData.get('agree') !== 'on') {
    return { error: 'Please agree to the Terms of Service and Privacy Policy to continue.' };
  }

  try {
    // When signups are disabled (§30.7) new emails must not create an account; existing users can
    // still request a login code (shouldCreateUser:false only creates for known addresses).
    const allowSignup = await loadSettingFlag('signup_enabled', true);
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { shouldCreateUser: allowSignup, emailRedirectTo: callbackUrl(next) },
    });
    if (error) return { error: error.message };
    return { ok: true, email: parsed.data.email, message: 'Code sent - check your email.', next };
  } catch {
    return { error: 'Sign-in is not available yet. Please try again shortly.' };
  }
}

/** Step 2: verify the emailed code, which establishes the session. */
export async function verifyEmailOtp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = verifyOtpSchema.safeParse({
    email: formData.get('email'),
    token: formData.get('token'),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const next = (formData.get('next') as string | null) ?? undefined;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: parsed.data.email,
      token: parsed.data.token,
      type: 'email',
    });
    if (error) return { error: error.message };
  } catch {
    return { error: 'Verification is not available yet. Please try again shortly.' };
  }

  const profile = await getMyProfile();
  redirect(postAuthPath(profile, next));
}

/** Returning-user login with email + password. */
export async function signInWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInWithPasswordSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const next = (formData.get('next') as string | null) ?? undefined;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { error: 'Incorrect email or password.' };
  } catch {
    return { error: 'Sign-in is not available yet. Please try again shortly.' };
  }

  const profile = await getMyProfile();
  redirect(postAuthPath(profile, next));
}

/** Set (or change) the account password for the currently-authenticated user. */
export async function setPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = setPasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return { error: error.message };
    // Record that this account now has a password so the mandatory password gate (§2BB) stops
    // showing (best-effort - see markPasswordSet doc comment).
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await markPasswordSet(user.id);
    return { ok: true, message: 'Password set.' };
  } catch {
    return { error: 'Could not set password right now. Please try again shortly.' };
  }
}

/** Begin Google OAuth - returns a redirect to Google's consent screen. */
export async function signInWithGoogle(next?: string): Promise<FormState> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl(next) },
    });
    if (error || !data?.url) return { error: 'Google sign-in is unavailable right now.' };
    redirect(data.url);
  } catch {
    return { error: 'Google sign-in is not configured yet.' };
  }
  return {};
}

/**
 * Step 1 of in-app password reset (master_plan §2BD-A): email a 6-digit recovery code. `redirectTo`
 * is kept so the emailed link keeps working as a fallback via the callback's `token_hash` branch, but
 * the app no longer depends on it - see `resetPasswordWithCode` for why the link alone was unreliable.
 */
export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordRequestSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: callbackUrl('/me/settings/password'),
    });
    if (error) return { error: error.message };
    return {
      ok: true,
      email: parsed.data.email,
      message: `We emailed a 6-digit code to ${parsed.data.email}.`,
    };
  } catch {
    return { error: 'Password reset is not available yet. Please try again shortly.' };
  }
}

/**
 * Step 2 of in-app password reset (master_plan §2BD-A). Root cause of the old emailed-link failure:
 * `resetPasswordForEmail` uses `@supabase/ssr`'s PKCE flow, which writes the code *verifier* as a
 * cookie on the browser that requested the reset (the installed app). The emailed link carries only
 * the one-time `code`; opening it in Chrome, a mail app's in-app browser, or a second device is a
 * different cookie jar with no verifier, so `exchangeCodeForSession` fails. `verifyOtp({ type:
 * 'recovery' })` needs only the emailed 6-digit code - no verifier cookie - so typing it in works
 * identically anywhere, including the installed PWA.
 */
export async function resetPasswordWithCode(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordWithCodeSchema.safeParse({
    email: formData.get('email'),
    token: formData.get('token'),
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    const supabase = await createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: parsed.data.email,
      token: parsed.data.token,
      type: 'recovery',
    });
    if (verifyError) {
      return { error: 'That code is incorrect or has expired. Request a new one.' };
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (updateError) return { error: updateError.message };

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await markPasswordSet(user.id);
  } catch {
    return { error: 'Could not reset your password right now. Please try again shortly.' };
  }

  const profile = await getMyProfile();
  redirect(postAuthPath(profile, undefined));
}

/** Form-action wrapper for the Google button (reads optional `next` hidden field). */
export async function googleSignIn(formData: FormData): Promise<void> {
  const next = (formData.get('next') as string | null) ?? undefined;
  // Redirects to Google on success; on misconfiguration it simply returns and the page is unchanged.
  await signInWithGoogle(next);
}

export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // ignore - fall through to redirect
  }
  redirect('/login');
}
