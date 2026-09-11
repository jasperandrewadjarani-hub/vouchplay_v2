import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { isCurrentLegalVersion } from '@vouchplay/config';
import { createClient } from '@/lib/supabase/server';
import { loadSettingFlag } from '@/lib/settings';

/**
 * Request-memoised user lookup (master_plan §2AB). A signed-in page previously validated the session
 * with `supabase.auth.getUser()` 5-6 times per request (middleware, header, and each viewer reader
 * below), each a network round trip to Supabase Auth. `React.cache` scopes memoisation to the current
 * request/render (and, for a Server Action, to that action's own invocation), so this never leaks a
 * user across requests. Everything that needs "who is signed in" routes through here.
 */
const getCachedUser = cache(async (): Promise<User | null> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
});

export interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  slug: string | null;
  city: string | null;
  sex: 'male' | 'female' | null;
  bio: string | null;
  self_rated_skill: number | null;
  facebook_url: string | null;
  avatar_path: string | null;
  onboarded_at: string | null;
  account_status: string;
  looking_for_partner: boolean;
  open_for_sponsorship: boolean;
}

/**
 * Returns the signed-in user or null. Never throws - if Supabase env is not yet configured, or the
 * request is anonymous, it resolves to null so public pages and the shell keep rendering.
 */
export async function getOptionalUser(): Promise<User | null> {
  return getCachedUser();
}

/** Loads the current user's profile row (or null). Never throws. Memoised per request (§2AB). */
export const getMyProfile = cache(async (): Promise<ProfileRow | null> => {
  try {
    const user = await getCachedUser();
    if (!user) return null;
    const supabase = await createClient();
    const { data } = await supabase
      .from('profiles')
      .select(
        'id, first_name, last_name, nickname, slug, city, sex, bio, self_rated_skill, facebook_url, avatar_path, onboarded_at, account_status, looking_for_partner, open_for_sponsorship',
      )
      .eq('id', user.id)
      .maybeSingle();
    return (data as ProfileRow | null) ?? null;
  } catch {
    return null;
  }
});

/**
 * Whether the signed-in viewer still needs to accept the current Terms/Privacy version (§2R). Read
 * on its own, deliberately NOT folded into getMyProfile's select: if the column does not exist yet
 * (migration 0032 not applied), this fails OPEN (needsAcceptance=false) so nothing is gated and no
 * one is locked out - it never disturbs the main profile read. Anonymous viewers never need to
 * accept. Once the migration lands, an existing player (null version) is flagged until they accept.
 */
export const getViewerLegalStatus = cache(async (): Promise<{ needsAcceptance: boolean }> => {
  try {
    const user = await getCachedUser();
    if (!user) return { needsAcceptance: false };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('terms_accepted_version')
      .eq('id', user.id)
      .maybeSingle();
    if (error) return { needsAcceptance: false };
    const version =
      (data as { terms_accepted_version: string | null } | null)?.terms_accepted_version ?? null;
    return { needsAcceptance: !isCurrentLegalVersion(version) };
  } catch {
    return { needsAcceptance: false };
  }
});

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
 * Reads only the caller's OWN roles (RLS-permitted). Never throws - degrades to an anonymous viewer.
 */
export const getViewerContext = cache(
  async (): Promise<{
    viewerId: string | null;
    isStaff: boolean;
    isCoach: boolean;
  }> => {
    try {
      const user = await getCachedUser();
      if (!user) return { viewerId: null, isStaff: false, isCoach: false };
      const supabase = await createClient();
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
  },
);

/**
 * Whether to nudge the signed-in viewer that their profile has no vouches yet (master_plan §2O).
 * Shown as a slim banner in the shell for an onboarded player with zero vouches; it disappears the
 * moment they have one. Reads only the viewer's own profile and their public skill aggregate.
 */
export const getViewerReputationNudge = cache(
  async (): Promise<{
    unvouched: boolean;
    slug: string | null;
  }> => {
    try {
      const user = await getCachedUser();
      if (!user) return { unvouched: false, slug: null };
      const supabase = await createClient();
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('slug, onboarded_at')
        .eq('id', user.id)
        .maybeSingle();
      const profile = profileRow as { slug: string | null; onboarded_at: string | null } | null;
      if (!profile?.onboarded_at) return { unvouched: false, slug: null };
      const { data: skillRow } = await supabase
        .from('player_skill_profiles')
        .select('unique_voucher_count')
        .eq('player_id', user.id)
        .maybeSingle();
      const count =
        (skillRow as { unique_voucher_count: number } | null)?.unique_voucher_count ?? 0;
      return { unvouched: count === 0, slug: profile.slug };
    } catch {
      return { unvouched: false, slug: null };
    }
  },
);

/**
 * Whether to nudge the signed-in viewer to add their ID for the "ID Verified" badge (master_plan
 * §2AG Phase C, D2). True only for an onboarded player who is not yet identity-approved and has no
 * verification currently pending/reviewing, and only while the feature flag is on. The app shell
 * shows at most one self-nudge at a time and picks the unvouched nudge first (§2AG Phase C UX), so
 * the caller is expected to skip calling this when that one is already showing. Fails open to false
 * on any error, including before migration 0036 seeds `identity_verification_enabled` (the setting
 * loader's code-side default is `true`, so this still reflects live verification status even before
 * that migration is applied).
 */
export const getViewerIdentityNudge = cache(async (): Promise<{ show: boolean }> => {
  try {
    const user = await getCachedUser();
    if (!user) return { show: false };
    const enabled = await loadSettingFlag('identity_verification_enabled', true);
    if (!enabled) return { show: false };
    const supabase = await createClient();
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('onboarded_at')
      .eq('id', user.id)
      .maybeSingle();
    if (!(profileRow as { onboarded_at: string | null } | null)?.onboarded_at) {
      return { show: false };
    }
    const { data: verificationRow } = await supabase
      .from('identity_verifications')
      .select('status')
      .eq('user_id', user.id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const status = (verificationRow as { status: string } | null)?.status ?? null;
    if (status === 'approved' || status === 'pending' || status === 'reviewing') {
      return { show: false };
    }
    return { show: true };
  } catch {
    return { show: false };
  }
});
