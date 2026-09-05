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

/**
 * Sanitize a post-auth `next` target: only same-origin absolute paths are allowed (blocks
 * open-redirects to `//evil.com` or `https://…`). Returns undefined when unsafe/absent.
 */
export function safeNext(next?: string | null): string | undefined {
  if (!next) return undefined;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return undefined;
  return next;
}

/**
 * Where to send a user right after authentication: onboarding if incomplete (preserving `next` so
 * the protected action resumes once onboarding finishes), else the sanitized `next` (default home).
 */
export function postAuthPath(profile: ProfileRow | null, next?: string | null): string {
  const target = safeNext(next);
  if (!profile || !profile.onboarded_at) {
    return target ? `/onboarding?next=${encodeURIComponent(target)}` : '/onboarding';
  }
  return target ?? '/';
}

/** Staff roles that may see otherwise-hidden profile fields (handover §37, moderation). */
const STAFF_ROLES = ['moderator', 'support', 'admin', 'super_admin'];

/**
 * Viewer context for DTO projection: the current user's id (or null) and whether they are staff.
 * Reads only the caller's OWN roles (RLS-permitted). Never throws — degrades to an anonymous viewer.
 */
export async function getViewerContext(): Promise<{
  viewerId: string | null;
  isStaff: boolean;
  isCoach: boolean;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { viewerId: null, isStaff: false, isCoach: false };
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('status', 'active');
    const roles = (data ?? []).map((r) => (r as { role: string }).role);
    return {
      viewerId: user.id,
      isStaff: roles.some((r) => STAFF_ROLES.includes(r)),
      isCoach: roles.includes('coach'),
    };
  } catch {
    return { viewerId: null, isStaff: false, isCoach: false };
  }
}
