'use server';

import { redirect } from 'next/navigation';
import {
  requestOtpSchema,
  verifyOtpSchema,
  signInWithPasswordSchema,
  setPasswordSchema,
  resetPasswordRequestSchema,
} from '@vouchplay/validation';
import { createClient } from '@/lib/supabase/server';
import { getMyProfile, postAuthPath } from '@/lib/auth';
import { publicEnv } from '@/lib/env';

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

/** Step 1 of email signup/login: send a 6-digit code (also a magic link) to the address. */
export async function requestEmailOtp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = requestOtpSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const next = (formData.get('next') as string | null) ?? undefined;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { shouldCreateUser: true, emailRedirectTo: callbackUrl(next) },
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

/** Send a password-reset email. */
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
    return { ok: true, message: 'If that email exists, a reset link is on its way.' };
  } catch {
    return { error: 'Password reset is not available yet. Please try again shortly.' };
  }
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
