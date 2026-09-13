import 'server-only';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';
import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * The guest wizard's signed session (master_plan §2AU B/C): "register before an account". A visitor's
 * shadow profile (created silently from their email at wizard step 0) is tracked in a signed, httpOnly
 * cookie rather than a Supabase auth session - there is no session until the guest verifies their
 * email (`verifyGuestOtpInline` in `actions/guest-registration.ts`), at which point this cookie is
 * cleared and the ordinary Supabase session takes over.
 *
 * Signed (not encrypted - the payload is just two uuids and a timestamp, nothing sensitive) with
 * HMAC-SHA256 keyed off `SUPABASE_SERVICE_ROLE_KEY` (server-only; never exposed to the browser, and no
 * new secret to provision). `resolveActor()` is the ONE place every guest-eligible server action reads
 * "who is acting" from - session user first, guest cookie second - so a stale or forged cookie can
 * never act as somebody else: it must name a profile that is STILL a live, active guest (`
 * guest_created_at` set, `onboarded_at` still null) at the moment of the call, not just at the moment
 * the cookie was minted.
 */

const COOKIE_NAME = 'vp_guest';
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days (master_plan §2AU C)

interface GuestCookiePayload {
  /** The guest's shadow profile id. */
  p: string;
  /** The tournament they started entering - carried along for convenience/telemetry; every actual
   *  action still takes its own tournamentId argument and is not scoped by this field. */
  t: string;
  /** Absolute expiry, epoch ms. */
  e: number;
}

function sign(payloadB64: string): string {
  return createHmac('sha256', serverEnv.supabaseServiceRoleKey)
    .update(payloadB64)
    .digest('base64url');
}

function isPayload(v: unknown): v is GuestCookiePayload {
  const p = v as Partial<GuestCookiePayload> | null;
  return (
    !!p &&
    typeof p.p === 'string' &&
    p.p.length > 0 &&
    typeof p.t === 'string' &&
    p.t.length > 0 &&
    typeof p.e === 'number'
  );
}

/** Set the signed guest cookie for a freshly created shadow profile (master_plan §2AU B). Server
 *  Action / Route Handler only (a plain Server Component render cannot write cookies - see
 *  `apps/web/src/lib/supabase/server.ts` for the same caveat on the Supabase session cookie). */
export async function setGuestCookie(profileId: string, tournamentId: string): Promise<void> {
  const payload: GuestCookiePayload = {
    p: profileId,
    t: tournamentId,
    e: Date.now() + COOKIE_MAX_AGE_SECONDS * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const value = `${payloadB64}.${sign(payloadB64)}`;
  try {
    const store = await cookies();
    store.set(COOKIE_NAME, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  } catch {
    // Called from a context that cannot write cookies - the caller (a Server Action) is expected to
    // always be able to; best-effort so a stray call elsewhere never throws.
  }
}

/**
 * Verify + decode the guest cookie. Returns null on a missing, malformed, tampered-with, or expired
 * cookie - never throws. Does NOT check the underlying profile is still a live guest; use
 * `resolveActor()` for that.
 */
export async function readGuestCookie(): Promise<{
  profileId: string;
  tournamentId: string;
} | null> {
  try {
    const store = await cookies();
    const raw = store.get(COOKIE_NAME)?.value;
    if (!raw) return null;
    const dot = raw.lastIndexOf('.');
    if (dot <= 0 || dot === raw.length - 1) return null;
    const payloadB64 = raw.slice(0, dot);
    const signature = raw.slice(dot + 1);
    const expected = sign(payloadB64);
    const given = Buffer.from(signature);
    const want = Buffer.from(expected);
    if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

    const parsed: unknown = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!isPayload(parsed)) return null;
    if (parsed.e < Date.now()) return null;
    return { profileId: parsed.p, tournamentId: parsed.t };
  } catch {
    return null;
  }
}

/** Clear the guest cookie - called once the guest verifies their email and a real session exists
 *  (master_plan §2AU D `verifyGuestOtpInline`), and safe to call any time otherwise (recovery via
 *  ordinary sign-in). Server Action / Route Handler only; best-effort elsewhere. */
export async function clearGuestCookie(): Promise<void> {
  try {
    const store = await cookies();
    store.delete(COOKIE_NAME);
  } catch {
    // best-effort - see setGuestCookie.
  }
}

/**
 * Resolve the acting player for a guest-eligible action (master_plan §2AU C): the signed-in session
 * user first (`getOptionalUser`), else the signed guest cookie IF its profile is STILL a live guest
 * right now - `guest_created_at` set, `onboarded_at` still null, account `active`. A profile that
 * finished onboarding (no longer a guest), was never created by the guest wizard, or is no longer
 * active resolves to null, so a stale cookie left over from a since-verified guest - or a forged one -
 * can never act as somebody else.
 *
 * Read defensively: `guest_created_at` arrives with migration 0046. Before that migration is applied
 * the select below fails (unknown column) and this resolves to null - the guest feature is simply
 * dormant until the column exists, which matches every other pre-migration column read in this app.
 */
export async function resolveActor(): Promise<{ id: string; guest: boolean } | null> {
  const user = await getOptionalUser();
  if (user) return { id: user.id, guest: false };

  const cookie = await readGuestCookie();
  if (!cookie) return null;

  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('profiles')
      .select('guest_created_at, onboarded_at, account_status')
      .eq('id', cookie.profileId)
      .maybeSingle();
    if (error) return null;
    const row = data as {
      guest_created_at: string | null;
      onboarded_at: string | null;
      account_status: string;
    } | null;
    if (!row) return null;
    if (row.account_status !== 'active') return null;
    if (row.onboarded_at) return null; // finished onboarding - a real player now, not a guest
    if (!row.guest_created_at) return null; // never a guest (or migration 0046 not applied yet)
    return { id: cookie.profileId, guest: true };
  } catch {
    return null;
  }
}
