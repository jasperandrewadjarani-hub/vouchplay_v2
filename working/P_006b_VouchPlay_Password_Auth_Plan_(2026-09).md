# VouchPlay - Password Auth + Persistent Sessions Plan (2026-09)

Project: P006b PlayerProfiling / vouchplay_v2. This is the "what I want and how we plan to execute it"
artifact for the mandatory-password + always-signed-in work recorded as master_plan `§2BB` and shipped in
handover v1.80. Plans live in `working/` per JT convention.

## Problem statement

Both signup and login default to **email OTP** (a 6-digit emailed code). Every new user is created via a
code, and a password has only ever been optional (buried in settings/reset). Consequences:

- A returning user requests a **fresh login code on every visit**. Each code is an email through the Gmail
  Custom SMTP relay, which caps at **~500 messages/day**.
- With ~350+ existing users and growth ahead, routine logins alone will exhaust the daily SMTP allowance
  before real scale - before any notification/reminder email volume is even counted.
- Short/session-scoped auth cookies could also drop the client session on a browser restart, forcing users
  back through the email loop.

Jasper's ask: after a user's first OTP sign-in, **require them to set a password** so future logins skip
the emailed code; and keep users signed in **"always."**

## Chosen design (as built)

1. **`profiles.password_set` column + migration 0050.** New `boolean not null default false` via
   `supabase/migrations/0050_password_set.sql` (identical copy at `scripts/apply-0050.sql`, which Jasper
   runs against Supabase). Semantics: `true` = never show the gate (user has a real password OR uses a
   federated/Google provider); `false` = email-only user with no password, must set one. The migration
   backfills `true` for users whose `auth.users.encrypted_password` is set OR who have a non-email
   provider/identity. **No security-definer functions** (no grant-lock needed per the §2AA rule); it ends
   with a verification `SELECT` counting true/false/total.

2. **Blocking password gate overlay.** New `apps/web/src/components/auth/password-setup-gate.tsx`, modeled
   on the existing `LegalConsentGate`. Shown to a signed-in, **onboarded** email user with
   `password_set = false`. Benefit-framed copy: "Set a password" / "Create a password so you can sign in
   instantly next time - no emailed code to wait for." Two fields (new password + confirm), reuses the
   existing `setPassword` server action, **no skip**, with a small "Signed in as {email}. Not you? Sign out"
   escape valve. On success it calls `router.refresh()` so the shell re-reads the flag and the gate
   disappears.

3. **Fail-open reader `getViewerPasswordStatus()`** in `apps/web/src/lib/auth.ts` (mirrors
   `getViewerLegalStatus`): returns `{ needsPassword }` and **fails open to `false` on ANY error** -
   including before migration 0050 is applied (missing column) - and only flags onboarded users. This is why
   the code deploy and the migration can land in **either order**, and why the gate is inert on deploy until
   Jasper applies 0050.

4. **Flag maintenance.** The `setPassword` action (`apps/web/src/lib/actions/auth.ts`) now sets
   `password_set = true` (best-effort, via the service-role client) after a successful password change. The
   OAuth callback (`apps/web/src/app/auth/callback/route.ts`) sets `password_set = true` for **federated
   sign-ins only** (checks `user.app_metadata.provider`/`providers` != `'email'`), so Google users are never
   gated but an email magic-link (which also arrives as a `code`) still is. Both writes are best-effort and
   harmless before the migration.

5. **Admin kill switch `password_gate_enabled`** (bool, default `true`) added to
   `packages/config/src/settings.ts` and `packages/config/src/settings-catalog.ts` (group `flags`). Off
   instantly disables the gate for everyone, no deploy. Wired in `apps/web/src/components/app-shell.tsx`: the
   gate is computed only when not maintenance-gated, not already showing the legal gate, and the kill switch
   is on; rendered as `<PasswordSetupGate email={...} />` immediately after `<LegalConsentGate />` so only
   one blocking overlay shows at a time (legal first, then password).

6. **"Always signed in."** New module `apps/web/src/lib/supabase/cookies.ts` exports
   `withPersistentMaxAge()` + `PERSISTENT_COOKIE_MAX_AGE` (400 days - Chrome's cookie ceiling). Applied in
   both `apps/web/src/lib/supabase/server.ts` and `apps/web/src/lib/supabase/middleware.ts` cookie writes, so
   the Supabase auth cookies are persistent (survive a browser restart) instead of session cookies. It only
   defaults a lifetime when the caller has not set one, so sign-out's cookie deletion is never overridden.
   The middleware already refreshes the session on every navigation, so the window rolls forward; real
   session lifetime is governed by the Supabase refresh token. It lives in its own module (no `next/headers`
   import) so it is safe in Edge middleware.

## Verification

- Typecheck, lint, and unit tests pass; the normal-browser login path is unaffected.

## Better suggestions / succeeding phases (not built)

- **Move transactional email off Gmail SMTP** to a dedicated provider (Resend / Amazon SES / SendGrid)
  before scale. The password gate cuts auth-code email now, but payment/reminder notification volume will
  still grow past Gmail's ~500/day cap. This is the real long-term fix; the gate buys runway.
- (Deferred consideration) Analytics on gate conversion - how many gated users complete vs. sign out - to
  confirm the gate is reducing code sends as intended.

## Jasper action items

- **Apply migration 0050** (`scripts/apply-0050.sql`) deliberately. The gate turns on for the existing
  ~350+ user base only once applied, so choose the timing - **not** mid Hermosa registration window (closes
  2026-09-16).
- **Confirm Supabase dashboard** (Authentication -> Sessions) has **no inactivity timeout and no session
  time-box.** That dashboard setting - not code - is the primary lever for "always signed in."
- Plan the **SMTP-provider migration** (above) before scale.
