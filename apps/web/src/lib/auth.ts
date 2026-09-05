import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  slug: string | null;
  city: string | null;
  onboarded_at: string | null;
  account_status: string;
}

/**
 * Returns the signed-in user or null. Never throws — if Supabase env is not yet configured, or the
 * request is anonymous, it resolves to null so public pages and the shell keep rendering.
 */
export async function getOptionalUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}

/** Loads the current user's profile row (or null). Never throws. */
export async function getMyProfile(): Promise<ProfileRow | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, nickname, slug, city, onboarded_at, account_status')
      .eq('id', user.id)
      .maybeSingle();
    return (data as ProfileRow | null) ?? null;
  } catch {
    return null;
  }
}

/** Guards a page: redirects to /login (with a return path) when there is no session. */
export async function requireUser(returnTo?: string): Promise<User> {
  const user = await getOptionalUser();
  if (!user) {
    const suffix = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
    redirect(`/login${suffix}`);
  }
  return user;
}

/** Where to send a user right after authentication: onboarding if incomplete, else home. */
export function postAuthPath(profile: ProfileRow | null, fallback = '/'): string {
  if (!profile || !profile.onboarded_at) return '/onboarding';
  return fallback;
}
