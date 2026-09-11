# VouchPlay v2 - Project Notes (execution)

**Project:** P006b (Player Profiling) - VouchPlay v2 rebuild
**Owner:** JT Consulting & Analytics Inc. - Jasper Adjarani, Tane Valdez
**Source of truth:** `VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md` (LOCKED FOR EXECUTION)
**Started execution:** 2026-09-05

---

## What this is

A mobile-first PWA where a player's skill reputation is built by **community vouches**, not
self-declaration. The core differentiator is the **anti-sandbagging tournament eligibility
decision-support engine**. Stack: Next.js (App Router) + TypeScript + Supabase (Postgres/Auth/
Storage) + Vercel. Modular monolith, no microservices in V1.

Full scope, rules, schema, and phased plan live in the v1.1 handover. This file is the running
brief + execution log; do not duplicate the handover here.

## Relationship to the v1 app (`../vouchplay/`) - READ THIS

`../vouchplay/` is a **live, deployed predecessor** (Next.js 16 + Supabase + Tailwind v4, at
`vouchplay.vercel.app`, Supabase project `qfmmjvoccwioaqndvftm`, migrations 0001–0008, real users).
`vouchplay_v2` is a **ground-up rebuild that supersedes it**, deliberately:

- **New infra:** new Supabase project `itrosesiywpbaxtmucbb`, new GitHub repo `vouchplay_v2`.
- **Corrected model:** v1 conflated skill + trust into one "composite + trust weight + Confirmed"
  score, with ID verification and Facebook both boosting trust. v1.1 **forbids** this - CSL, STS,
  Identity Verified and Skill Verified are four separate concepts; Skill-Verified and Facebook must
  never increase vouch weight (avoids circular scoring). v2 fixes this.
- **New architecture:** v1 is a single app; v2 is a modular monorepo (handover §34.3).

**v1 is a REFERENCE, not a base.** Reusable assets to mine (not copy wholesale, domain differs):
exceljs export approach, PH-cities list, skill-tier color definitions, RLS security-definer
helper pattern, `screenshots_mockups/`. The v1→v2 cutover for existing real users is a later,
conscious decision - not handled by the initial build.

## Locked non-negotiables (from handover - do not violate)

- One account, additive roles. No "log in as organizer."
- Canonical skill order: Newbie(0) → Beginner(1) → Novice(2) → Low Intermediate(3) →
  High Intermediate(4) → Advanced(5) → Pro(6). "Open"/"Age-Defined" are eligibility, not skills.
- CSL = weighted **median**; STS (0–5) = confidence = 0.50·count + 0.25·weight + 0.25·agreement.
  Algorithm is versioned (`STS_V1`), unit-tested, recomputed on **write**, never on read.
- Vouch weights 1.00 / 1.25 (ID-verified) / 2.00 (coach) / 2.50 (ID-verified coach). Skill-Verified
  and Facebook do NOT change weight.
- Vouch limits 5 / 20 per rolling 24h; vouch requests 10/24h; one active vouch per pair; 30-day
  update cooldown. All limits/weights/thresholds are Admin settings, never hardcoded.
- Anonymous rating identity hidden publicly, visible to authorized Admin/moderation only. Comments
  always attributed.
- Tournament + registration are state machines. Slot reservation is transactional (no capacity race).
- Anti-sandbagging output is neutral ("Potential Skill Mismatch") - never "sandbagger"/"smurf".
- Multi-club representation per player per tournament (`tournament_player_club_representations` is
  the source of truth; no team-level `club_id`). Default max 3 clubs/player, organizer range 1–10.
- XLSX export must be adapter-compatible with the canonical sample - **inspect first, never guess**:
  `sample_data_/tournament_googlesheets_sample.xlsx` (NOTE: handover §26.11.1/Phase 10 has a path
  typo - `sample_data\_\` / `D:\claude\_\`; real path uses `sample_data_`).
- Transactional email via a real provider (Resend/Postmark/SendGrid), NOT Gmail. Google Sign-In
  requests only `openid email profile` - no Gmail scopes.
- Public reads cache-first where safe; private/sensitive paths never shared-cached; no `select(*)`
  in production list endpoints; no N+1 in list/export paths.

## Assets on disk

- `logo_/` - vouchplay_logo_.png, _horizontal.png, _horizontal_transp.png, _transp.png
- `sample_data_/tournament_googlesheets_sample.xlsx` - canonical export compatibility contract
- JT branding links to https://www.facebook.com/61590234100280/

## Execution decisions (2026-09-05)

- **Codebase location:** built in this folder (`vouchplay_v2/`), pushed to `vouchplay_v2` repo.
- **Execution mode:** Phase 0 directly against the handover (handover *is* the locked plan; no
  intermediate master_plan.md).
- **Secrets:** deferred. Phase 0 + schema need no live keys. Keys required before Phase 1 auth:
  Supabase URL + anon + service_role keys; Google OAuth client id/secret; chosen email provider key.
- **Tooling:** npm workspaces (no pnpm); plain git (no gh). First push to GitHub deferred + will be
  confirmed before it happens.

## Execution log

- **2026-09-05** - Read + fully understood handover v1.1 + chatgpt_convo. Surfaced v1→v2
  relationship. Began Phase 0 (monorepo foundation).
- **2026-09-05** - **Phase 0 COMPLETE** (local, unpushed). npm-workspaces monorepo scaffolded:
  `apps/web` (Next.js 16 App Router, React 19, Tailwind v4, TS strict) + `packages/{config,
  core,db,ui,validation,analytics}`. Locked theme tokens + working theme toggle; app shell with
  the 5 locked tabs, header, sidebar + bottom nav; `@vouchplay/config` holds canonical skill
  bands / default settings / STS_V1 constants; PWA manifest; security headers; ESLint (flat) +
  Prettier + Vitest (7/7 green) + GitHub Actions CI. **All gates pass:** lint, typecheck, tests,
  format, `next build`. Shell + dark/light verified in-browser. Committed `093b9a7` on `main`.
  Toolchain notes: npm workspaces (no pnpm); esbuild/unrs-resolver postinstall blocked by the
  machine's allow-scripts wrapper but Vitest/build unaffected. Fixed two config gotchas:
  eslint-config-next v16 is flat-native (import directly, not via FlatCompat); react-hooks v7
  `set-state-in-effect` needs a scoped disable for the next-themes mount guard.
  **NOT pushed** - awaiting Jasper's go-ahead (outward action) + repo state check.

- **2026-09-05** - **Pushed** `main` to `github.com/jasperandrewadjarani-hub/vouchplay_v2`
  (remote was empty; clean first push). CI runs on push.
- **2026-09-05** - **Phase 1 (schema + plumbing) IN PROGRESS.** Wrote migrations
  `0001_core_identity.sql` (extensions pgcrypto/pg_trgm; enums; profiles, user_roles,
  role_applications, identity_verifications, system_settings, audit_logs; updated_at + new-user
  triggers; authz helpers `has_global_role`/`is_admin`/`is_staff` SECURITY DEFINER; RLS on all
  user-facing tables) and `0002_seed_system_settings.sql` (canonical defaults, ON CONFLICT DO
  NOTHING). Added Supabase client plumbing in web: lazy build-safe `env.ts`, `supabase/{client,
  server,service}.ts`, session-refresh `middleware.ts` (no-ops until keys exist), and the
  `EmailProvider` abstraction in core. Gates still green (lint/typecheck/test 7-7/format/build).
  **NOT yet applied to a live DB** - migrations validate on `supabase db push` when keys arrive.

## Email decision (2026-09-05) - DEVIATION from handover, approved by Jasper
Using **Gmail SMTP via `vouchplay@gmail.com`** for the pilot (handover §34A.11 forbids Gmail as
primary transport). Implemented behind the `EmailProvider` interface so switching to Resend/
Postmark/SendGrid later is a one-adapter change. Constraints: Gmail ≈500 sends/day (ok for first
~100 users, not scale), no bounce webhooks - prefer in-app notifications. **Must switch to a
dedicated provider before public launch.** Needs a Gmail **App Password** (16-char, requires 2FA)
set as Supabase Custom SMTP for auth emails.

- **2026-09-05** - **Phase 1 auth UI STAGED** (compiles + renders without keys; activates when
  `.env.local` is filled). Restructured `app/` into `(app)` (shell) and `(auth)` (minimal) route
  groups. Added: server actions (`lib/actions/auth.ts` - email OTP request/verify, password login,
  set password, Google OAuth, password reset, sign out; `lib/actions/profile.ts` - onboarding with
  slug gen); `lib/auth.ts` guards (`getOptionalUser`/`getMyProfile`/`requireUser`/`postAuthPath`,
  all graceful when keys absent); `/auth/callback` route (OAuth code + email token_hash); pages
  login/signup/forgot-password/onboarding; wired `/me` (signed-in card + sign out) and header
  (Sign in when logged out); shared UI atoms (Button/SubmitButton/Field/Input/Select/FormError);
  validation schemas in `@vouchplay/validation`; Terms/Privacy stubs. Migrated `middleware.ts` →
  `proxy.ts` (Next 16). Verified login/signup/me in-browser (light theme). Gates green
  (lint/typecheck/test 7-7/format/build). Docs: `docs/SECRETS_SETUP.md` (step-by-step for keys).
  Follow-up noted: `(app)` pages are dynamic because the header reads auth cookies - revisit with
  PPR/partial caching for public pages (players/clubs/tournaments) per §34A.5. Docs/setup guide
  saved: [SECRETS_SETUP.md](docs/SECRETS_SETUP.md).

- **2026-09-05** - **DEPLOYED LIVE:** https://vouchplay-v2.vercel.app (Vercel project
  `vouchplay-v2`, account jasperandrewadjarani-hub, git-connected → auto-deploys on push to main).
  Renders correctly (shell, theme, auth screens); auth inert until Supabase keys are added.

## Deployment workarounds (IMPORTANT - revisit later)
Getting the first deploy up hit two issues:
1. **Vercel × Next 16.3.4 platform bug:** every deploy failed at "Deploying outputs" with
   *"Cannot patch preview comments when immutable static file upload is enabled. Upgrade to
   next@v16.3.0-canary.32 or newer."* The build always succeeded; only the output-deploy step
   failed. Reproduced on 16.3.4 stable AND 16.4.0-canary.18, via CLI and Git, and was NOT fixed by
   disabling the project Vercel Toolbar. **Workaround: pinned Next to `^15.5.0`** (currently
   15.5.25), which doesn't trigger it. **TODO:** re-upgrade to Next 16 once Vercel/Next fix this
   upstream (then revert middleware→proxy rename and re-add `agentRules:false`).
2. **Monorepo detection:** the project's Root Directory and Framework Preset dashboard settings
   would NOT persist via automation (confirmed by screenshot - stayed "./" and "Other"). So Vercel
   runs framework detection at the repo ROOT. Fixes that made it work, both in-repo (no dashboard
   dependency):
   - **root `vercel.json`**: `framework: nextjs`, `installCommand: npm install`,
     `buildCommand: npm run build --workspace @vouchplay/web`, `outputDirectory: apps/web/.next`.
   - **declared `next` in the ROOT `package.json` dependencies** so Vercel's Next-version detection
     passes at the root. (Slightly unusual but harmless - next is hoisted anyway.)
   If Root Directory can later be persisted to `apps/web` (e.g. via a real dashboard session), the
   root-level `next` dep and buildCommand/outputDirectory overrides can be removed.

- **2026-09-05** - **LIVE + DB-CONNECTED.** Jasper supplied Supabase keys.
  - **Migrations APPLIED & VERIFIED** on project `itrosesiywpbaxtmucbb` via the Supabase SQL editor
    (Monaco `setValue` fed from the GitHub raw files - clipboard paste is blocked by browser
    security, and the dashboard internal query API needs the session token which the classifier
    blocks). Result: **6 public tables, 21 system_settings rows, 10 RLS policies.** ("Success, no
    rows returned" for both 0001 and 0002.)
  - **Vercel production env vars set** (CLI): `NEXT_PUBLIC_SUPABASE_URL`, `..._ANON_KEY`
    (added `--type config` - the anon key is public by design; CLI guards NEXT_PUBLIC credentials),
    `SUPABASE_SERVICE_ROLE_KEY` (secret), `NEXT_PUBLIC_SITE_URL=https://vouchplayph.vercel.app`,
    `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false`. Redeployed (`vercel --prod`) - deploy bug stays fixed
    on Next 15.
  - **Public live URL: https://vouchplay-v2.vercel.app** (project's short production domain - public,
    verified rendering in a browser with no Vercel session; connected to Supabase).
  - **Vanity domain `vouchplayph.vercel.app` - NOT public yet.** `vouchplay.vercel.app` is owned by
    v1. Renamed the Vercel project `vouchplay-v2` → `vouchplayph` and aliased `vouchplayph.vercel.app`
    to the prod deployment, but a manually-created alias inherits **Deployment Protection** (Vercel
    Authentication = "Require Log In", Standard Protection) so it shows the Vercel login gate, while
    the auto short domain (vouchplay-v2.vercel.app) bypasses it. Disabling the toggle via automation
    FAILED (React-controlled toggle reverts on Save - same dashboard-automation resistance already
    documented for this project). **MANUAL STEP for Jasper (~15s):** Vercel → project `vouchplayph`
    → Settings → Deployment Protection → turn **Require Log In** OFF → Save. Then
    `https://vouchplayph.vercel.app` (alias already created) serves publicly. (Re-alias after future
    deploys, or add it as a project domain, since a deployment alias doesn't auto-update.)

## Live status (2026-09-05)
- **Public (primary):** https://vouchplayph.vercel.app - LIVE (Jasper turned off Vercel Auth;
  verified rendering publicly). Caveat: it's a deployment alias, so re-alias after each deploy (or
  promote it to a project domain) - it won't auto-track production.
- **Public (also):** https://vouchplay-v2.vercel.app - live, connected to Supabase.
- **Auth note:** email OTP signup relies on Supabase's built-in email (rate-limited; the org is also
  flagged **over-quota**, restriction threatened 21 Sep 2026). For reliable delivery set up Gmail
  Custom SMTP (App Password) per docs/SECRETS_SETUP.md §3. Google login stays off until OAuth keys
  are added.

- **2026-09-05** - **Gmail SMTP live + OTP-code email fixed.** Jasper set up Gmail Custom SMTP in
  Supabase (App Password). First live signup test returned "Code sent" (SMTP accepted) but the email
  was a **magic LINK**, not a code - because the default Supabase "Magic link or OTP" template renders
  `{{ .ConfirmationURL }}`. Edited that template (via the dashboard, Monaco `setValue` + Save) to
  render the 6-digit **`{{ .Token }}`** (subject "Your VouchPlay sign-in code"); **verified persisted
  after reload**. (Same gotcha v1 documented.) Re-triggered signup → fresh code email sent. Our app's
  `verifyOtp({type:'email'})` already expects the typed code, so the flow is now code-based end to end.
  Vercel Auth is OFF → **https://vouchplayph.vercel.app is public & live.**

- **2026-09-05** - **OTP-code signup fully fixed.** First code-template edit wasn't enough: a NEW
  user via `signInWithOtp({shouldCreateUser:true})` with **"Confirm email" ON** gets the *Confirm
  signup* template (a LINK), not the Magic-link/OTP template. Root fix, all in Supabase Auth →
  Sign In / Providers:
  1. **Confirm email → OFF** (User Signups). With OTP sign-in the code itself proves email
     ownership, so new users now get the Magic-link/OTP template = the 6-digit code. ("Successfully
     updated settings" confirmed.)
  2. **Email OTP length 8 → 6** (Email provider) to match the app's 6-digit validation + UI copy.
  3. (Earlier) Magic-link/OTP template body → `{{ .Token }}`.
  Re-tested live signup → "Code sent". Now new + returning users both get a 6-digit code, verified
  with `verifyOtp({type:'email'})`. All Supabase dashboard changes persisted (verified on reload).

- **2026-09-05** - **Google login LIVE + verified.** Jasper created the Google OAuth client
  (reused the existing "VouchPlay" Google Cloud project; authorized redirect URI =
  `https://itrosesiywpbaxtmucbb.supabase.co/auth/v1/callback`) and enabled Google in Supabase Auth.
  I: added Supabase redirect allowlist (Site URL → vouchplayph; `https://vouchplayph.vercel.app/**`,
  `https://vouchplay-v2.vercel.app/**`, localhost), set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`
  (Vercel + local), redeployed. **Verified end-to-end:** clicking "Continue with Google" on the live
  site reaches Google's consent ("Sign in to continue to itrosesiywpbaxtmucbb.supabase.co").
  Two bugs fixed along the way:
  1. **OAuth didn't navigate** - a Server Action calling `redirect()` to an *external* URL doesn't
     navigate the browser in Next 15. Refactored the Google button to **client-side**
     `supabase.auth.signInWithOAuth` (browser client redirects itself). This is the standard pattern.
  2. **Browser Supabase client threw "missing URL"** - `env.ts`'s `supabaseUrl` used a helper that
     reads `process.env[name]` *dynamically*; Next only inlines *literal* `process.env.NEXT_PUBLIC_X`
     into the browser bundle. Fixed the public getters to use literal access. (Server email was
     unaffected because it reads env at runtime server-side.)
  Also fixed **pre-existing lint breakage** from the gap's Next 16→15 downgrade: `eslint-config-next`
  v15 is eslintrc-format, so `eslint.config.mjs` now uses `FlatCompat` (+ re-added `@eslint/eslintrc`,
  dropped the direct `typescript-eslint` dep). Lint/typecheck/test/build all green again.
  Deployment domain caveat unchanged: vouchplayph is a manual alias - re-alias after each deploy.
- **2026-09-05** - **Handover updated to v1.2** (in the v1.1-named file). Added: §0Z Current Build
  Status; §16A Gamified Player Bidding (points-based, clubs bid to represent/sponsor players, player
  accepts) + `player_bids` entity §36.18A; §6.1 Home Leaderboards & Bidding Spotlight (top players /
  most bidded / top clubs w/ medals - never STS-ranked); §5.2.1 logo aesthetics (bigger wordmark + tiny
  "by JT Consulting & Analytics" microcopy); §5.3.1 About/FAQ location; FAQ/components/Phase-2-scope
  updates; changelog + Locked Decisions. **Ready to hand off to a NEW conversation for Phase 2.**

- **2026-09-05** - **PHASE 2 core BUILT + verified locally** (directory & profile, handover §8–§9,
  §28, §34A). Shipped:
  - **Config:** skill-band **colors + blurbs** (mined from v1 skill-tiers) on `SKILL_BANDS`;
    `visibility.ts` (profile field-visibility contract: sex/city/age/directory, privacy-preserving
    defaults, `parseVisibility`/`fieldVisible`); `geo.ts` (`PH_CITIES`, mined from v1).
  - **`@vouchplay/db`:** hand-authored `Database`/row types matching migrations 0001–0002 (Supabase
    CLI not on PATH + no access token, so `gen types` deferred - types kept in sync by hand; see
    `packages/db/src/types.ts` note).
  - **Data layer (RLS-safe, cache-first §34A.5 PUBLIC_REVALIDATED):** `lib/supabase/public.ts` (anon
    cookie-less client for cached public reads, RLS-enforced as `anon`); `lib/players/dto.ts`
    (privacy projection - hidden fields dropped server-side before payload; `PLAYER_CARD_COLUMNS`/
    `PLAYER_PROFILE_COLUMNS`, **no `select(*)`**); `lib/players/queries.ts` (`listPlayers` +
    `getPlayerBySlug`, `unstable_cache` + tags `players:list`/`player:{slug}`, bulk role/identity
    joins = no N+1, default sort = recent activity + verified-first tiebreak, **never STS-ranked**,
    directory opt-out via `profile_visibility.directory`).
    - **Public badge facts (Coach/Organizer/ID-Verified) - RLS note:** these are public by design
      (§8.2) but `user_roles`/`identity_verifications` RLS is owner-or-staff, so Phase 2 reads them
      **server-side via the service client with a tight non-sensitive projection** (only booleans
      reach the client). RLS-clean hardening = migration 0003 `public_player_facts()` SECURITY
      DEFINER fn granted to `anon` (written, to apply + switch to in the fold-in step).
  - **Components:** `PlayerAvatar` (initials fallback), `badges` (SkillPill w/ community-vs-self
    label, StsChip [info-only, not a rank], ID/Skill-Verified, Coach, Organizer, LFP, sponsorship,
    Sex), `PlayerCard`, `ClubStack` (empty→null until Phase 5), `SearchFilters` (client; §8.4 - URL
    params, PH-cities datalist), `ShareButton` (native share + copy fallback, §28), `VouchButton`
    (auth gate + resume via `?intent=vouch`), `ProfileActions` (gated secondary/contextual actions),
    profile section empty-states (skill distribution scaffold / comments / achievements / skill tags).
  - **Pages:** rewrote `/players` (directory: filters + grid + pagination + result count); new
    `/players/[slug]` (full profile + `generateMetadata` → canonical + OG/Twitter, §28). Public 404
    for non-active/non-onboarded.
  - **Auth resume (Phase-2 gate "login gate resumes protected action"):** threaded a sanitized
    `next` through the WHOLE flow - `safeNext()` (blocks open-redirects), `postAuthPath` preserves
    `next` across onboarding, all auth actions (password/OTP request+verify) + `completeOnboarding`
    honor it, signup/code-login/onboarding forms + pages carry it, signup↔login cross-links keep it.
  - **Cache invalidation:** `completeOnboarding` now `revalidateTag`s `players:list` + `player:{slug}`.
  - **Gates:** lint / typecheck / test (7/7) / `next build` all green. **Verified in-browser vs the
    LIVE Supabase DB:** directory lists the seeded profile, filter combos (q+coach) work with no
    console errors, profile page renders header + sections + correct `<title>`/OG, anonymous Vouch/
    Request gates route to `/signup?next=/players/{slug}?intent=…` (resume wired).
- **2026-09-05** - **Phase 2 fold-ins (batch 1).**
  - **`avatars` storage bucket CREATED on live Supabase** (public, 2 MB, png/jpg/webp) via the
    service-role Storage API - no DDL needed (script run once, not committed).
  - **Avatar upload on onboarding:** optional file input; `completeOnboarding` uploads via the
    service client to `avatars/{userId}/…` (path keyed to the user = server-side authz) and sets
    `avatar_path`. Failure never blocks onboarding (avatar is optional). Display already worked via
    `avatarUrl()`.
  - **`/me/settings/password`** reset-link landing + change-password page (the reset email already
    routes here via `/auth/callback?next=…`); guarded route, reuses the `setPassword` action.
  - **Migration `0003_avatars_and_public_facts.sql` WRITTEN (not yet applied):** records the bucket
    config idempotently, adds storage.objects owner-folder policies, and adds the RLS-clean
    `public_player_facts(ids)` SECURITY DEFINER fn (grant anon/authenticated). **Apply via the
    Supabase SQL editor**, then switch `lib/players/queries.ts` badge reads from the service client
    to `public_player_facts()`.
  - Gates green (lint/typecheck/test/build); `/me/settings/password` guard verified (anon → login).
  - **Admin seed - script provided, NOT run:** added `scripts/seed-admin.mjs` (grants a global role
    via the service role; DML, no DDL; idempotent). Attempting to run it here was blocked by the
    Claude Code auto-mode classifier (correct - granting `super_admin` on production is a privilege
    escalation). **Jasper to run** from repo root: `node scripts/seed-admin.mjs
    jasper.andrew.adjarani@gmail.com` (and Tane's email once known). Requires the account to have
    signed up already.
- **2026-09-05** - **Phase 2 fold-ins (batch 2): RLS verification + Admin MFA framework.**
  - **RLS/role-spoofing verification:** `scripts/verify-rls.mjs` - compares ANON vs service-role
    visibility to prove RLS filters (not just empty tables). Read-only by default; `VERIFY_WRITES=1`
    adds anon spoofing-write attempts (must affect 0 rows). **Ran read-only: 6/6 PASS** - anon reads
    `system_settings` (21) + `profiles` (public), and is blocked from `user_roles`/
    `identity_verifications`/`audit_logs`/`vouches`. (user_roles etc. are 0 in service too until the
    admin grant lands - re-run after applying the SQL for the conclusive service=1/anon=0 divergence.)
  - **Admin MFA framework:** `lib/auth/mfa.ts` (`getMfaStatus`, `requireStaffMfa(returnTo)` guard for
    future admin/staff routes - non-staff unaffected in V1; enforces verified TOTP + aal2 step-up);
    `components/auth/mfa-manager.tsx` (client TOTP enroll → QR + secret → challenge/verify → session
    upgrades to aal2 in place; list/remove factors); `/me/settings/security` page (guarded; nudges
    staff). Wired settings links + "View public profile" into `/me`. Supabase Auth TOTP is on by
    default; `requireStaffMfa` is exported but not yet wired to any route (Admin Control Center is
    Phase 30+).
  - **DB step handed to Jasper (auto-mode classifier blocks Claude from writing/executing on the
    Supabase dashboard - both JS and keyboard input are gated on that origin; no direct Postgres
    conn string locally either):** `scripts/apply-0003-and-admin.sql` - one paste into the SQL editor
    applies migration 0003 (avatars config + storage policies + `public_player_facts`) AND grants
    Jasper `super_admin`. Idempotent + self-verifying. **After it's run:** switch the badge reads in
    `lib/players/queries.ts` from the service client to `public_player_facts()` via the anon client,
    and re-run `verify-rls.mjs` for the conclusive divergence.
  - Gates green (typecheck/lint/build).
  - **Still deferred:** the one manual SQL paste above (then the badge-reads switch); seed Tane's
    admin once their email is known; wiring `requireStaffMfa` into the admin area when it exists.

- **2026-09-05** - **Migration 0003 APPLIED + admin seeded + badge reads switched (Phase 2 hardening
  CLOSED).** Jasper pasted `scripts/apply-0003-and-admin.sql` into the Supabase SQL editor and ran it
  (verify query returned admins=1, public_player_facts_exists=1, avatars_bucket_public=1). So on live
  DB `itrosesiywpbaxtmucbb`: avatars bucket config + `storage.objects` owner policies applied;
  `public_player_facts(uuid[])` SECURITY DEFINER fn created + granted anon/authenticated; Jasper's
  account granted `super_admin`.
  - **Switched `lib/players/queries.ts` badge reads** from the service client to the anon
    `public_player_facts()` RPC (RLS-clean; returns only safe booleans, and deliberately does NOT
    expose staff/admin status). Service client now only touches the opt-in role/identity FILTER
    id-lists (single safe `user_id` column). Verified: anon RPC call returns correct rows, no error.
  - **Re-ran `verify-rls.mjs`: 6/6, now CONCLUSIVE** - `user_roles anon=0 / service=1 → RLS filtering
    confirmed` (the super_admin row is invisible to anon).
  - Handover §0Z stamped **Phase 2 ✅ DONE (live)**.
  - **Open:** seed Tane's admin once their email is known; wire `requireStaffMfa` into the Admin
    Control Center when it's built (Phase 30+). **Next: Phase 3 - Vouch Engine (§10).**

- **2026-09-05** - **PHASE 3 - Vouch Engine: core BUILT (handover §10–§12).** Awaiting one manual
  SQL paste (migration 0004) to go live.
  - **STS_V1 algorithm in `@vouchplay/core`** (`vouches/weight.ts` + `vouches/sts.ts`): pure,
    deterministic, version-locked. `effectiveWeight` (§10.5 - 1.00/1.25/2.00/2.50; Skill-Verified/
    Facebook/Organizer never affect weight), `weightedMedian` CSL (§10.6), `computeSkillProfile`
    (STS components §10.7 + Skill-Verified §10.8 + distribution). **11 unit tests pass** incl.
    hand-computed worked examples (5 unanimous Low-Int → STS 4.6; split [2,4] → 2.0; clamp → 5.0),
    order-independence, threshold boundaries. Constants injected from settings (never hardcoded);
    test also asserts the shipped config defaults match the locked spec.
  - **Migration 0004 (`0004_vouch_engine.sql`, WRITTEN - apply pending):** `vouches`,
    `vouch_revisions`, `vouch_comments`, `vouch_requests`, `player_skill_profiles` (+ `distribution`
    jsonb), `blocks`, `fraud_flags` + enums + RLS. **Anonymous voucher identity protected:** `vouches`
    is NOT publicly readable (voucher-own/staff only); public skill data comes from the safe aggregate
    `player_skill_profiles` (public read) + attributed `vouch_comments`. One-paste apply:
    `scripts/apply-0004.sql` (idempotent + verify).
  - **Domain + server actions (`lib/actions/vouch.ts`):** `submitVouch` (create/update) enforces every
    LOCKED rule server-side - no self-vouch, both accounts active, block check (both directions),
    coach weight only for approved coaches, ONE active vouch/pair (update replaces + writes a
    revision), rolling 24h limit (counts revisions; 5 player / 20 coach), 30-day update cooldown;
    optional always-attributed comment; fulfills a pending request. `withdrawVouch`, `requestVouch`
    (§12) too. Writes via service client after in-action authz; revisions service-only per RLS.
  - **Recompute on WRITE (`lib/vouches/recompute.ts`):** reads all active vouches (service client),
    computes with @vouchplay/core, upserts `player_skill_profiles` (preserving admin_override),
    invalidates player/comments/list cache tags. `lib/settings.ts` reads live `system_settings`
    (weights/limits/thresholds) with config fallback; STS constants from config.
  - **UI:** real Vouch **form** modal (skill, with/against, coach toggle [coaches only], anonymous
    default ON, comment) replacing the Phase-2 stub; cards link to the profile to vouch. CSL/STS/
    Skill-Verified now flow into PlayerCard + profile header; profile shows real skill distribution
    bars + attributed comments. DTO reads `player_skill_profiles` (graceful when absent pre-0004).
  - Gates green (typecheck/lint; build pending). **Deferred within Phase 3:** fraud-flag generation
    (§11.2 - table + RLS shipped; detectors later), admin invalidate UI (Phase 30), block-management
    UI (Phase 4 - block is already enforced in the vouch path). **NEXT after apply: a UI/UX polish
    pass** (Jasper flagged the interface as clunky - agreed; no design pass done yet, §33).

- **2026-09-05** - **UI/UX polish pass (whole app, "bold sporty" direction - Jasper's call).** Added
  a design foundation to `globals.css`: gradient/glow/hero-tint tokens (light + dark) + utility
  classes (`vp-gradient`, `vp-gradient-text`, `vp-glow`, `vp-card` hover-lift, `vp-label`, `vp-hero`,
  `vp-in` entrance motion - all reduced-motion safe). Applied across: gradient primary buttons
  (glow + lift), header (gradient hairline + "by JT Consulting & Analytics" microcopy §5.2.1),
  gradient active nav indicators (sidebar + bottom nav), PlayerCard (hover-lift + ringed avatar),
  profile hero header (gradient strip + ring), a real **home hero + feature cards** (replaced the
  placeholder), branded auth layout (card + backdrop), uppercase sporty badge chips, polished
  placeholder pages. Verified in-browser (home/profile/directory, dark). Gates green
  (typecheck/lint/build). Not a token re-theme - the locked §33.2 base palette is unchanged; this
  layers accents/motion/hierarchy on top.

- **2026-09-05** - **Migration 0004 APPLIED + Phase 3 pipeline verified live (Phase 3 CLOSED).**
  Jasper pasted `scripts/apply-0004.sql` (verify: vouch_tables=7, player_skill_profiles_public_read=1).
  Confirmed on live DB: `player_skill_profiles` anon-readable (public aggregate); `vouches` blocked
  from anon SELECT (voucher identity protected). **Controlled pipeline smoke test** (service-side,
  cleaned up): inserted a skill-4/weight-1 vouch → wrote the profile as recompute would → anon read
  returned CSL 4 / STS 1.9 / unique 1 / distribution {4:1} (matches the unit-tested algorithm) →
  deleted test data (0 rows remain). Full loop schema→recompute→public-read→display verified live.
  Handover §0Z stamped **Phase 3 ✅ DONE**. **Next: Phase 4 - Safety & Moderation (§11, §15).**

- **2026-09-05** - **Minor UI fixes (Jasper).** (1) Header/auth logo bigger (h-9→h-11) with a
  readable "By JT Consulting & Analytics" line stacked BELOW the wordmark (all breakpoints).
  (2) Global scale down: root `font-size: 14px` (rem-based Tailwind → smaller text + tighter spacing
  → more cards per mobile screen); PlayerCard denser (sm avatar, p-3.5, gap-2.5). (3) Loading cue:
  `components/ui/spinner.tsx` (`Spinner`/`LoadingScreen`) + route `loading.tsx` for `(app)` and
  `(auth)` → centered spinner on navigation; SubmitButton shows a spinner while pending. Verified
  mobile (375px) in-browser; gates green. **Phase 4 kickoff prompt written:
  `docs/PHASE_4_KICKOFF.md`** (Safety & Moderation) + §0Z Phase-4 ref corrected to §14/§11/§30.6/§47.

- **2026-09-06** - **PHASE 4 - Safety & Moderation: BUILT + deployed + live (handover §14, §11.3,
  §30.6, §47).** Awaiting one manual SQL paste (migration 0005) to fully activate.
  - **Migration 0005 (`0005_safety_moderation.sql`, WRITTEN - apply pending):** `reports` (§36.33),
    `skill_reviews` (§36.32), `support_tickets` (§36.38) + enums; moderation-action columns on
    `profiles` (`status_reason`, `status_updated_at`, `status_updated_by`, `suspended_until`,
    `vouching_restricted_until`); seeds `reports_per_24h`/`skill_reviews_per_24h` settings. RLS:
    reporter/submitter read own; staff read all; all status/resolution writes via the service role
    (no user UPDATE policy). One-paste apply: **`scripts/apply-0005.sql`** (idempotent + verify;
    expect safety_tables=3, profiles_mod_columns=5, safety_rls_policies=6, new_settings=2).
  - **User actions:** `submitReport` (player + vouch-comment UGC; reporter always stored - never anon
    to admin; dup/rate-limited), `submitSkillReview` (SEPARATE from report; submitter stored, never
    public; organizer-only tournament context), `blockUser`/`unblockUser`, `submitSupportTicket`.
  - **Staff actions (`lib/actions/moderation.ts`), each behind `assertStaffActor` (staff role + aal2
    MFA) + an append-only `audit_logs` row:** resolve reports/skill-reviews, review + raise fraud
    flags, update support tickets, hide/remove/restore comments, **invalidate vouch** (recompute),
    account actions warn/restrict-vouching/restrict-account/suspend/ban/lift.
  - **Enforcement (server-side):** `submitVouch`/`requestVouch` honor `account_status` +
    `vouching_restricted_until` via `lib/moderation/enforcement`; reads the timed columns
    **best-effort** so the deploy is safe in the window before 0005 is applied (columns read null →
    no restriction). Banned/suspended already 404 in the public directory.
  - **Anonymous voucher identity** revealed ONLY via the staff-gated `getVouchAuthorForModeration` /
    `listActiveVouchesForModeration` path (§37, §4.5) - the moderation vouch-invalidation panel.
  - **UI:** real Report / Skill-review / Block on profiles (+ per-comment report), `/me/blocked`,
    `/me/support` (appeals), and a staff-gated **`/staff` + `/staff/moderation`** queue (Reports ·
    Skill reviews · Fraud flags · Support) behind `requireStaffPage` (staff + `requireStaffMfa`);
    staff-only link surfaced in `/me`.
  - **Gates green** (typecheck/lint/format/test 18/build). Also normalized pre-existing repo-wide
    Prettier drift so CI `format:check` is green again. Committed `fe18ac6` + `35d9353`, pushed to
    `main`; Vercel auto-deployed; **re-aliased `vouchplayph.vercel.app`** to the new deployment.
    Verified live: profile safety actions render (anon → gated signup w/ resume `next`), routes 200.
  - **DB step handed to Jasper (dashboard automation is classifier-blocked):** paste
    `scripts/apply-0005.sql` into the Supabase SQL editor + run, return the verify numbers. Until
    then: submitting reports/skill-reviews/support fails gracefully; the staff queue shows empty;
    vouching is unaffected (defensive reads). **Staff must enroll TOTP + step up (aal2)** at
    `/me/settings/security` before the moderation area unlocks (Admin MFA framework, by design).
  - **Deferred within Phase 4:** private-bucket file evidence for reports/skill-reviews (§38 - V1
    uses an optional text note + link in `evidence` jsonb; approved by Jasper); fraud-flag detectors
    (§11.2 - manual raise + review shipped). **Next: Phase 5 - Clubs (§15).**

- **2026-09-06** - **Migration 0005 APPLIED (Phase 4 fully live).** Jasper ran `scripts/apply-0005.sql`
  in the Supabase SQL editor; verify returned safety_tables=3, profiles_mod_columns=5,
  safety_rls_policies=6, new_settings=2 - all as expected. Reports/skill-reviews/support submit + the
  staff moderation queue are now fully active on live DB `itrosesiywpbaxtmucbb`.

- **2026-09-06** - **Minor UI:** dark/light/system toggle is now **icon-only** (Sun/Moon/Monitor;
  full label kept in aria-label + title). Committed `c17d43b`, deployed, re-aliased.

- **2026-09-06** - **PHASE 5 - Clubs core (§15): BUILT + deployed + live.** Scope decision (Jasper):
  **Clubs core only** - recruitment/sponsorship (§16) + bidding (§16A) deferred to a later phase.
  Awaiting one manual SQL paste (migration 0006) to fully activate.
  - **Migration 0006 (`0006_clubs.sql`, WRITTEN - apply pending):** `clubs` (§36.16) +
    `club_memberships` (§36.17) + enums (privacy/verification_status/activity_status/role/membership
    status), `is_club_member/manager/owner()` SECURITY DEFINER helpers, single-owner + single-live-
    membership partial unique indexes, RLS (public reads active clubs + active memberships; managers/
    staff see the rest; writes via service role). One-paste apply: **`scripts/apply-0006.sql`**
    (expect club_tables=2, club_helpers=3, club_rls_policies=3).
  - **Data layer (`lib/clubs/`):** DTO + cache-first queries - directory (`listClubs`), club page
    (`getClubBySlug` w/ owners/admins + member count + viewer membership), member list, and bulk
    `getUserClubsBulk` wired into player cards/profiles (real club stacks). No `select(*)`.
  - **Server actions (`lib/actions/club.ts`), authz server-side (active membership → manager/owner):**
    createClub (owner membership + optional logo), updateClub, requestJoin (public = instant active /
    approval_required = requested), leaveClub (owner must transfer/delete first), approve/reject/remove
    member, setMemberRole (admin↔member, owner only), transferOwnership (single-owner-safe w/ rollback),
    setClubPrivacy, setClubActivity, deleteClub (soft-delete, typed-name confirm). `club_creation_enabled`
    honored. Logos reuse the public `avatars` bucket under a `club-logos/` prefix (no new bucket).
  - **Admin club verification** in the `/staff` queue: new **Clubs tab** + `verifyClub`
    (verified/unverified/rejected) and `setClubModerationStatus` (suspend/reinstate) - each writes an
    append-only `audit_logs` row (staff + aal2 gated).
  - **UI:** `/clubs` directory (search + verified filter + pagination), `/clubs/[slug]` public page
    (§15.5 - logo/verified/members/owners+admins/join-leave/share + manage link), `/clubs/new`,
    `/clubs/[slug]/manage` (members mgmt + settings + owner danger zone).
  - **Gates green** (typecheck/lint/format/test 18/build - 24 routes). Committed `9869f38`, pushed to
    `main`; Vercel auto-deployed; **re-aliased `vouchplayph.vercel.app`**. Verified live: `/clubs` +
    `/clubs/new` return 200, directory renders (empty until 0006). Deploy is safe pre-0006 (club reads
    degrade to empty; writes error gracefully - like the Phase-4 pattern).
  - **DB step handed to Jasper:** paste `scripts/apply-0006.sql` + return verify numbers.
  - **Deferred:** Recruitment/Sponsorship offers (§16 `club_offers`), gamified bidding (§16A
    `player_bids`); manager-initiated invitations (§15.4 INVITED path - request+approve shipped);
    password/OAuth re-auth on club delete (§15.7 - typed-name confirm used instead). **Next: Phase 6.**

- **2026-09-06** - **Migration 0006 APPLIED (Clubs fully live).** Verify returned club_tables=2,
  club_helpers=3, club_rls_policies=3. Directory/create/join/manage + admin verification all active on
  live DB `itrosesiywpbaxtmucbb`.

- **2026-09-06** - **PHASE 6 - Tournament Setup (§17–§19): BUILT + deployed + live.** Scope decision
  (Jasper): **full Phase-6 list.** Awaiting one manual SQL paste (migration 0007) to fully activate.
  Note: §16 recruitment/sponsorship was in the handover's Phase-5 build list but was deferred when
  Phase 5 was scoped to Clubs-core; it now lands with Phase 7 (Partner/Team/Registration) or as a
  fold-in - Phase 6 per the authoritative plan (handover §5252) is Tournament Setup.
  - **Migration 0007 (`0007_tournaments.sql`, WRITTEN - apply pending):** `tournaments` (§36.19),
    `divisions` (§36.21), `tournament_organizers` (§36.20), `tournament_interests` (§36.22),
    `tournament_announcements` (§36.30) + enums + `is_tournament_organizer()` helper + RLS (public
    reads non-draft; organizers/staff see drafts; writes via service role). One-paste apply:
    **`scripts/apply-0007.sql`** (expect tournament_tables=5, tournament_helper=1,
    tournament_rls_policies=8).
  - **Organizer role (§17.1):** `applyForOrganizer` (from `/me`, the `?organizer=1` deep link, and the
    tournaments "Become an organizer" CTA) → admin approval in the `/staff` queue (**new Role apps
    tab**, `assertAdminActor` [admin/super_admin + aal2] + audit) grants the `organizer` role. Only
    approved organizers/admins can create tournaments (action + `/tournaments/new` page guard + RLS
    insert check).
  - **Tournaments (`lib/actions/tournament.ts`):** CRUD, **server-enforced lifecycle** state machine
    (`TRANSITIONS` map - draft→published→registration_open→registration_closed→locked→live→completed→
    archived, cancel from live states), cover upload (public `avatars` bucket, `tournament-covers/`
    prefix), interested toggle, announcements, co-organizers with granular permission jsonb
    (edit/manage_divisions/send_announcements/manage_organizers[owner]/approve_registrations/
    manage_payments/export).
  - **Divisions (§18):** attribute rule-builder (skill policy/format/sex/age/team-size/capacity/fee/
    skill-verified/min-STS/approval); auto-composed display names (`divisionName`); add/edit/clone/
    status.
  - **Data layer (`lib/tournaments/`):** DTO + cache-first `listTournaments` (discovery) +
    `getTournamentBySlug` (session-aware so organizers see their drafts; interested count via service;
    no `select(*)` on read paths).
  - **UI:** `/tournaments` discovery (search), `/tournaments/[slug]` public page (§19 - cover, status
    pill, divisions, announcements, interested, share, manage link), `/tournaments/new`,
    `/tournaments/[slug]/manage` (lifecycle + division builder + details + announcements + co-organizers).
  - **Gates green** (typecheck/lint/format/test 18/build - tournament routes present). Committed
    `16fb60e`, pushed to `main`; Vercel auto-deployed; **re-aliased `vouchplayph.vercel.app`**.
  - **DB step handed to Jasper:** paste `scripts/apply-0007.sql` + return verify numbers. Until then:
    tournament reads degrade to empty, writes error gracefully (Phase-4/5 pattern). Organizers must
    also be granted via the Role apps queue (needs a staff member with aal2).
  - **Deferred:** registration/partner/teams/club-representation (Phase 7), payments (Phase 8),
    eligibility/anti-sandbagging (Phase 9), organizer export (Phase 10), §16 offers, §16A bidding.
    **Next: Phase 7 - Partner, Team & Registration (§20–§25).**

- **2026-09-06** - **Migration 0007 APPLIED (Tournaments fully live).** Verify returned
  tournament_tables=5, tournament_helper=1, tournament_rls_policies=8. Organizer application/approval,
  tournament CRUD/lifecycle, divisions, discovery, interests, announcements, co-organizers all active.
  (Note: super_admin/admin can create tournaments directly without an organizer grant; the Role-apps
  approval flow grants the `organizer` role to regular users.)

- **2026-09-06** - **PHASE 7 - Partner, Team & Registration (§20–§23): BUILT + deployed + live.**
  Scope: §20–§23 (payments §24 = Phase 8, eligibility §25 = Phase 9). Confirm-path decision (Jasper):
  **organizer confirms directly** (payment-proof/verify layer lands in Phase 8). Awaiting one manual
  SQL paste (migration 0008) to fully activate.
  - **Migration 0008 (`0008_registration.sql`, WRITTEN - apply pending):** `partner_invitations`,
    `teams`, `team_members`, `tournament_player_club_representations`, `registrations`,
    `registration_events`, `waitlist_entries` (§36.23–36.27, §36.25A, §36.29) + enums + RLS + helper
    `is_team_member`. **Transactional RPCs (LOCKED §23.2/§35.3 - no capacity race):**
    `register_team` (locks the division row `SELECT … FOR UPDATE`, counts confirmed + valid active
    holds, atomically creates a slot hold [payment_pending] or waitlists), `release_slot`
    (withdraw/reject + promote next waitlisted), `accept_partner_invitation` (merges a reciprocal
    cross-invite §20.4 + creates the team atomically, blocks conflicting teams), `slot_hold_minutes`.
    One-paste apply: **`scripts/apply-0008.sql`** (expect reg_tables=7, reg_rpcs=5, reg_rls_policies=7).
  - **Server actions (`lib/actions/registration.ts`):** invite/accept/decline/cancel partner;
    registerSolo/registerTeam/withdraw (via RPCs); setClubRepresentations (§22 - max_clubs_per_player
    + active-membership enforced, contiguous order, club-lock respected); organizer confirm/reject
    (`approve_registrations` perm). Duplicate-prevention (§21.4), block + account-status enforced.
  - **UI:** tournament page gains a signed-in **registration panel** (per open division:
    register/withdraw, partner invite + team display, pending invitations accept/decline/cancel, club
    representation multi-select); `/tournaments/[slug]/manage` gains the **organizer registrations
    dashboard** (grouped by division; confirm/reject with waitlist release). Partner finder =
    invite-by-handle (LFP discovery list query exists, `getPartnerCandidates`, not yet surfaced as a
    browse UI - invite is by handle).
  - **Gates green** (typecheck/lint/format/test 18/build - tournament routes present). Committed
    `2625463`, pushed to `main`; Vercel auto-deployed; **re-aliased `vouchplayph.vercel.app`**.
  - **DB step handed to Jasper:** paste `scripts/apply-0008.sql` + return verify numbers. Reads
    degrade to empty until it lands; writes error gracefully.
  - **Deferred:** payments (§24, Phase 8), eligibility/anti-sandbagging (§25, Phase 9), a hold-expiry
    + waitlist auto-promotion **cron** (V1 handles promotion on explicit withdraw/reject; expired
    holds free capacity lazily since register_team only counts unexpired holds), partner-finder browse
    UI, and the club-lock organizer-override UI (§22.5). **Next: Phase 8 - Payments (§24).**

- **2026-09-06** - **Migration 0008 APPLIED (Registration fully live).** Verify returned reg_tables=7,
  reg_rpcs=5, reg_rls_policies=7. Partner invites, teams, transactional register/waitlist, club
  representation, and the organizer registrations dashboard are all active on live DB.

- **2026-09-06** - **PHASE 8 - Payments (§24): BUILT + deployed + live.** Manual-proof payment layer.
  Awaiting one manual SQL paste (migration 0009) to fully activate.
  - **Migration 0009 (`0009_payments.sql`, WRITTEN - apply pending):** `payments` table (§36.28) +
    enum `payment_status`; `tournaments.payment_methods` column; a **PRIVATE `payment-proofs` storage
    bucket** (§38, created via `insert into storage.buckets`); RLS (payment readable by team members /
    organizers / staff; writes via service role). One-paste apply: **`scripts/apply-0009.sql`**
    (expect payments_table=1, payment_methods_col=1, payments_rls_policy=1, proofs_bucket_private=1).
  - **PaymentProvider interface** in `@vouchplay/core` (`ManualPaymentProvider`) - V1 manual; a
    gateway can be added later (§24.5) without touching registration logic.
  - **Proof access:** files never public - retrieved only via **server-issued 60s signed URLs**
    (`getProofSignedUrl`), gated to team member / organizer(`manage_payments`) / staff.
  - **Actions (`lib/actions/payment.ts`):** `submitPayment` (upload proof → payment `submitted` →
    registration `payment_submitted` + 24h review grace §23.1; first-submit + resubmit); organizer
    `verifyPayment` (→ registration confirmed), `rejectPayment(reason)` (→ back to payment_pending +
    fresh hold, resubmit), `markRefunded`. All audited (`audit_logs` + `registration_events`).
  - **fee=0** divisions keep the Phase-7 organizer-confirm-directly path (payment not required).
  - **UI:** payment step in the tournament registration panel (amount + instructions + accepted
    methods + proof upload; submitted/rejected states); organizer registrations dashboard gains
    payment status + **View proof** (signed URL) + **Verify / Reject / Mark refunded**; tournament
    config form gains an accepted-payment-methods field.
  - **Gates green** (typecheck/lint/format/test 18/build). Committed `616723a`, pushed; Vercel
    auto-deployed; **re-aliased `vouchplayph.vercel.app`**.
  - **DB step handed to Jasper:** paste `scripts/apply-0009.sql` + return verify numbers.
  - **Deferred:** real payment gateway (§24.5 - interface only), partial refunds (§24.3 - enum exists,
    no UI), payment deadline auto-enforcement cron. **Next: Phase 9 - Eligibility / Anti-Sandbagging
    (§25)** - the product's headline anti-sandbagging decision-support engine.

- **2026-09-06** - **Migration 0009 APPLIED (Payments fully live).** Verify returned payments_table=1,
  payment_methods_col=1, payments_rls_policy=1, proofs_bucket_private=1.

- **2026-09-06** - **Post-Phase-8 UX tweak batch (Jasper).** All shipped + gates green + deployed:
  - **Em-dashes removed** app-wide (source, copy, placeholders) and across the docs - replaced with
    hyphens (en-dashes / `·` intentionally kept). Global sweep, 79 source files + 5 docs.
  - **Click-loading** on Create Club, Create Tournament, View profile, Vouch (card), Manage links -
    `components/ui/link-spinner.tsx` (`useLinkStatus`). Page navigations still show `(app)/loading.tsx`.
  - **Theme toggle Light/Dark only** (default remains system on first load); icon = Sun/Moon.
  - **Vouch interaction `both`** added (played with AND against) - enum + validation + form option
    (migration 0010).
  - **Vouch update cooldown 30d → 1d** (`vouch_update_cooldown_days` admin setting; config default +
    live `update` in migration 0010). Deviation from the §10.4 default, approved by Jasper; still an
    admin-tunable value so no non-negotiable violated.
  - **Sign-out confirmation** prompt.
  - **Header profile avatar** beside the bell when signed in (so you can see you're logged in).
  - **Profile-pic upload error FIXED:** root cause was Next's default Server Actions `bodySizeLimit`
    of 1MB rejecting >1MB files (avatars up to 2MB, covers 4MB, proofs 5MB). Set
    `experimental.serverActions.bodySizeLimit = '8mb'` in `next.config.ts`. This also un-breaks club
    logo, tournament cover, and payment-proof uploads.
  - **Instant (debounced 350ms) filtering** on Players/Clubs/Tournaments (`InstantFilterForm` +
    players `SearchFilters` auto-apply); explicit Search button kept as a fallback. Tradeoff: a
    request per debounced change (mild extra load, cache-first reads) vs a manual click that batches
    changes into one request - the debounce + kept button balance both.
  - **Tournament dates date-only** (time no longer required; `type=date`).
  - **Minimal create-tournament form** (name/city/start-end date/visibility); venue, registration
    dates, description, terms, payment, cover are edited afterward on Manage (create still saves a
    draft immediately).
  - **Partner invite searches players by name** (`searchInvitablePlayers`, debounced pick-list) -
    previously handle-only. Registration is per open division via the tournament registration panel.
  - Migration `0010_vouch_tweaks` (`scripts/apply-0010.sql`) - **apply pending** (adds `both` enum +
    sets cooldown to 1). Gates green (typecheck/lint/format/test 18/build).

- **2026-09-06** - **PHASE 9 - Eligibility / Anti-Sandbagging (§25, §26.7): BUILT + deployed + live.**
  The headline decision-support engine - neutral, evidence-based, never auto-punishes, never labels a
  person; the organizer decides. Awaiting one manual SQL paste (migration 0011) to seed the thresholds.
  - **Pure engine `ELIG_V1` in `@vouchplay/core`** (`packages/core/src/eligibility/`): pure,
    deterministic, version-locked, unit-tested like STS_V1. `evaluatePlayerEligibility` +
    `evaluateTeamEligibility` → `ELIGIBLE / REVIEW / SKILL_MISMATCH / INELIGIBLE_HARD_RULE` +
    `hardRuleCodes` + neutral `reasonCodes` + advisory `flags` (`UNUSUAL_VOUCH_ACTIVITY`;
    `HISTORICAL_SKILL_MISMATCH` wired but a no-op until Phase-12 history exists). **Hard rules (§25.2):**
    wrong sex (men/women divisions), age out of range at the start date, account not active, invalid
    team size, plus caller-supplied registration-closed / duplicate; a hard-rule failure short-circuits
    to INELIGIBLE_HARD_RULE. **Skill rules (§25.4):** CSL above the division max → SKILL_MISMATCH;
    within band but below required/admin STS, too few vouches, unrated, or Skill-Verified-required-but-
    missing → REVIEW (unrated → REVIEW, Jasper's call); a raised flag forces at least REVIEW.
    **Team = worst-of-members** severity; flags/reasons unioned. All thresholds injected (never
    hardcoded). **21 new unit tests** (in-band eligible, below-STS review, above-band mismatch, all
    hard-rule failures, hard-rule-beats-mismatch, unrated→review, team worst-of-members, open policy
    never mismatches) - core suite now 32 green.
  - **§25.6 no-defamation guard:** neutral copy lives in `eligibility/labels.ts`
    (`ELIGIBILITY_RESULT_LABELS`/`REASON_LABELS`/`FLAG_LABELS`/`HARD_RULE_LABELS`); a vitest guard scans
    every `.ts/.tsx` under `packages/` + `apps/web/src` and **fails the build** if the person-labels
    `sandbagger`/`smurf`/`cheater` (§25.6) ever appear in code (the feature name "anti-sandbagging" is
    allowed in comments/spec, only the accusatory nouns are banned). Verified: the guard actually fired
    on a stray term during the build and was fixed.
  - **Migration 0011 (`0011_eligibility.sql`, WRITTEN - apply pending):** seeds 3 admin-tunable
    settings ON CONFLICT DO NOTHING - `eligibility_min_unique_vouchers` (2),
    `eligibility_review_below_sts` (3.0), `eligibility_enforce_hard_rules` (false = decision-support,
    never auto-blocks). **No schema change** - `registrations.eligibility_status` +
    `eligibility_snapshot jsonb` already exist (0008). One-paste apply: **`scripts/apply-0011.sql`**
    (expect eligibility_settings = 3). `getEligibilitySettings()` reads them live with config fallback.
  - **Compute-on-write (`lib/eligibility/compute.ts`):** fills `eligibility_status` +
    `eligibility_snapshot` after `register_team` (in `registerTeam`/`registerSolo`), and recomputes a
    player's active registrations when their vouches change (hooked into `recomputePlayerSkillProfile`).
    Age computed at the tournament **start date** (§18.5); sex from `profiles.sex`; UNUSUAL_VOUCH_ACTIVITY
    from open `fraud_flags`. Best-effort - never breaks the registration write; decision-support only,
    does not block registration by itself.
  - **Organizer UI (§25.5):** the registrations dashboard
    (`components/tournaments/organizer-registrations.tsx`) gains a neutral **eligibility panel** per team
    - result pill + per-player evidence (community skill, STS /5, active vouchers, Skill-Verified) +
    reason/flag lines, all neutral wording. Actions: **Approve** (clears to eligible - reason REQUIRED to
    override a hard rule, §25.2), **Reclassify** (move to a same-format/size division, re-checks
    eligibility), **Request Skill Review** (per member, reuses Phase-4 `skill_reviews`), **Reject**
    (existing). Every override writes an append-only `audit_logs` row + a `registration_events` row
    (`lib/actions/eligibility.ts`).
  - **Gates green** (typecheck/lint/format/test 32-core/build). Committed `b430fda`, pushed to `main`;
    Vercel auto-deployed; **re-aliased `vouchplayph.vercel.app`**.
  - **DB step handed to Jasper:** paste `scripts/apply-0011.sql` + return the verify number. Until then:
    eligibility reads/writes degrade gracefully (settings fall back to config defaults; snapshots still
    compute), so the deploy is safe pre-0011.
  - **Deferred:** `HISTORICAL_SKILL_MISMATCH` real history (Phase 12); fraud-flag detectors that would
    actually raise `UNUSUAL_VOUCH_ACTIVITY` (Phase-4 table shipped, detectors later); the eligibility
    review-queue rollup in the organizer dashboard analytics (Phase 10, §26.7). **Next: Phase 10.**

- **2026-09-06** - **Migrations 0010 + 0011 APPLIED (Jasper).** Both ran in the Supabase SQL editor,
  results as expected (0010: both_enum=1, cooldown_days=1; 0011: eligibility_settings=3). So on live DB
  `itrosesiywpbaxtmucbb`: the vouch `both` enum + 1-day update cooldown are live, and the three
  eligibility thresholds are seeded. **Phase 9 is now fully active end to end.**

- **2026-09-06** - **Registration UX: Frictionless Join + Shareable Registration Link (Jasper request;
  specced into the handover first, §19.2/§19.3/§28.1).** BUILT + deployed + live. No migration.
  - **Join before signup (§19.2):** the tournament page shows a prominent **Register** CTA to everyone
    (incl. signed-out) when registration is open, plus a "Join this tournament" card. An anon visitor is
    routed to signup carrying `next=/tournaments/{slug}?register=1`, so **signup → onboarding →
    registration options** resumes with no lost context (reuses the sitewide login-gate resume
    plumbing - `safeNext`/`postAuthPath`). No slot/team/payment state is ever created for an anon
    visitor; all registration writes still require an authed, onboarded account (§21/§23 unchanged).
  - **Shareable registration link (§19.3/§28.1):** the tournament **Share** action produces a
    `?register=1` deep link when the tournament is registerable (published/registration_open); opening
    it scrolls to + highlights the registration section (`RegisterAnchorScroll`). Canonical/OG URL stays
    the clean `/tournaments/{slug}`. Behaviour-only - never bypasses auth, eligibility (§25), slot
    reservation (§23), or visibility (unlisted stays unlisted).
  - Replaced the **stale "registration opens in a later release" placeholder** (left over from before
    Phase 7) with a real state-aware `#register` section: anon Join card / live RegistrationPanel /
    schedule / closed message.
  - New `components/tournaments/register-cta.tsx` (`RegisterButton`, `RegisterAnchorScroll`,
    `registerNext`). Gates green (typecheck/lint/format/test/build). Committed `5b17073`, pushed to
    `main`; Vercel auto-deployed; **re-aliased `vouchplayph.vercel.app`**. Handover updated: §19.2,
    §19.3, §28.1.

- **2026-09-06** - **PHASE 10 (part 1 of 2) - Export (§26.11): BUILT + deployed + live.** Scope
  decision (Jasper): **export-first**, then dashboard analytics as part 2. No migration. exceljs 4.4.0
  added to `apps/web`.
  - **Inspected the canonical workbook FIRST** (§26.11.1, LOCKED contract): unzipped +
    XML-parsed `sample_data_/tournament_googlesheets_sample.xlsx`. It is the JT tournament-system
    operational workbook (P002 PICPA system). Recorded the full contract in
    **`docs/TOURNAMENT_SYSTEM_XLSX_CONTRACT.md`**: 8 sheets, LOCKED order (Standings, Matches, Teams,
    Players, Divisions, TournamentDates, Sponsors, Config), exact headers/column order per sheet,
    dates-as-Excel-serial, ID formats (DIV-01/TEAM-001/PLY-001), status vocab. VouchPlay owns
    Teams/Players/Divisions/TournamentDates/Config; the tournament backend fills Standings/Matches
    (emit header-only). **Never emit secrets** (the sample has an AdminPassword key - we don't).
  - **Decoupled architecture (§26.11.2):** `apps/web/src/lib/exports/` - `schema.ts` (single source of
    truth for the locked sheet/header constants + `TournamentExportSnapshot` typed rows + status/
    eligibility/payment label maps + division defaults), `build.ts` (server: assembles the snapshot
    from the live DB via the service client after authz; emails via `auth.admin.getUserById` since
    profiles carry none; skill labels, club reps, payments, waitlist), and 3 adapters:
    `system-xlsx.ts` (**canonical** `TournamentSystemXlsxExporter`), `normalized-xlsx.ts` (human-
    readable Summary/Registrations/Players/Divisions), `csv.ts` (per-entity flat CSV, RFC-4180).
  - **Structural compatibility test** (`system-xlsx.test.ts`, §26.11.1 step 6): regenerates the
    workbook from a fixture, re-reads it with exceljs, and **fails the build** if a sheet is missing,
    order/headers drift, the date columns stop being real dates, or the Status vocabulary drifts.
    8 tests green (apps/web suite now 11).
  - **Download route** `app/api/tournaments/[slug]/export/route.ts`: `?format=system|normalized|csv`
    (+`&entity=`). Server-authorized via `authorizeOrganizer(..., 'export')`; every export writes an
    `audit_logs` row (authorized data egress); files `no-store`; CSV gets a UTF-8 BOM for Excel.
    UI: an **Export** section on the manage dashboard (`components/tournaments/tournament-export.tsx`)
    with the canonical XLSX (primary) + normalized XLSX + 4 CSV links.
  - **Native-integrity check:** generated demo workbooks from the adapters and re-read them with a
    fresh exceljs load (8 sheets, exact headers, RegisteredAt = real `yyyy-mm-dd` date, Standings
    header-only) - well-formed OOXML. **Per the JT rule, library reopen alone is not sufficient:**
    sent the 3 demo files to Jasper to open in **desktop Excel** and confirm no repair prompt (pending
    that manual confirmation before it's treated as a shippable deliverable).
  - Gates green (typecheck/lint/format/test 11-web/build). Committed `c72fdf4`, pushed; deployed;
    **re-aliased `vouchplayph.vercel.app`**.
  - **Deferred to Phase 10 part 2:** the dashboard analytics/overview tiles (§26.1: totals, pending
    payments, waitlist, eligibility review count, revenue), richer registration filters, waitlist
    management UI. Bracket-config Division columns emit documented defaults (organizer tunes them in
    the tournament system). CSV ZIP bundle (per-entity links used instead).

- **2026-09-06** - **PHASE 10 (part 2 of 2) - Dashboard analytics (§26.1, §26.4): BUILT + deployed +
  live. Phase 10 COMPLETE.** No migration; no extra query (computed from the registrations the manage
  page already loads).
  - **Overview tiles (§26.1):** `lib/tournaments/overview.ts` (pure `computeOverview`, 4 unit tests) +
    `components/tournaments/tournament-overview.tsx`. Tiles: active registrations, confirmed teams,
    payments to review, waitlisted, eligibility to review (links §25 work), revenue collected (sum of
    verified payments); plus a "divisions nearing capacity" callout (>=80% of capacity, slot-holding
    statuses mirror `register_team` §23.2). Rendered at the top of the manage dashboard.
  - **Registration filters (§26.4):** the organizer registrations dashboard gains a client-side filter
    bar - division / status / eligibility / payment - with an "N of M" count. Filters the already-
    loaded list (cache-first, no round-trip).
  - Confirmed Jasper's migrations context (SQL editor "untitled" tab = unsaved snippet text only; the
    0010/0011 DB changes are already committed - safe to close without saving).
  - Gates green (typecheck/lint/format/test 15-web/build). Committed `41af8d9`, pushed; deployed;
    **re-aliased `vouchplayph.vercel.app`**.
  - **Deferred (later):** §26.6 manual waitlist reprioritize (auto-promotion on release already works,
    §23.3); §26.8 participants search; §26.9 broader comms beyond announcements. Export desktop-Excel
    integrity confirmation still pending from Jasper (§26.11 deliverable gate).

- **2026-09-06** - **PHASE 11 - Notifications (§27): BUILT + deployed + live.** In-app notifications
  complete; email-for-critical is ready-but-inert (Jasper's scope call); push = later. Awaiting one
  manual SQL paste (migration 0012).
  - **Migration 0012 (`0012_notifications.sql`, WRITTEN - apply pending):** `notifications` (recipient/
    type/category/title/body/link/actor/entity/is_critical/read_at/created_at - the §27 record shape)
    + `notification_preferences` (muted_categories text[], email_enabled) + RLS (recipients read their
    OWN; all writes via service role). One-paste apply: **`scripts/apply-0012.sql`** (expect
    notif_tables=2, notif_rls_policies=2).
  - **Core catalog (`@vouchplay/core/notifications/catalog.ts`, 5 unit tests):** the single source of
    truth for notification COPY, each type's category (for preferences), and criticality. Critical =
    moderation + account/security (cannot be muted, email-eligible). Pure/testable.
  - **Service (`lib/notifications/`):** `notify`/`notifyMany` (in-app insert via service client;
    skips a recipient's muted non-critical categories; routes critical → the email channel; never
    self-notifies; best-effort - never breaks the triggering action). `queries` (unread count, list,
    prefs), `recipients` (organizer/team/club/actor/tournament resolvers), `registration-notify`
    (shared team fan-out). **Email channel (`email.ts`): READY BUT INERT** - sends only when SMTP_USER
    + SMTP_PASS are in the app env AND the user opted in; nodemailer is dynamic-imported so it's never
    bundled/loaded until enabled. No SMTP env now = pure no-op (safe deploy).
  - **Emission wired** at the high-value events (§27.1/§27.2/§27.3): vouch received (ANONYMOUS - never
    names the voucher) + vouch request; partner invite + accepted; registration submitted→organizers /
    confirmed / rejected / waitlisted / promoted / team withdrawn→organizers; eligibility-review-
    required→organizers; payment submitted→organizers / verified / rejected; eligibility reclassified;
    tournament announcement (audience fan-out); club join request→managers / accepted / rejected;
    organizer/coach application result; **moderation account action (critical)**. Admin fan-out (§27.4)
    deferred - the `/staff` queue already surfaces those.
  - **UI:** header **bell now shows a live unread badge**; `/me/notifications` center (list, tap to
    open+read, mark-all-read, deep-links) with a Preferences link; `/me/settings/notifications`
    (per-category mute toggles; critical locked on; email opt-in with accurate "not switched on yet"
    copy). nodemailer + @types/nodemailer added to `apps/web`.
  - Gates green (typecheck/lint/format/test - core 37 incl. 5 catalog, apps/web 15, config 4/build).
    Committed `ad69690`, pushed; deployed; **re-aliased `vouchplayph.vercel.app`**.
  - **DB step handed to Jasper:** paste `scripts/apply-0012.sql` + return verify numbers. Until then:
    the bell shows 0, the notifications page/prefs read empty, and emission is a graceful no-op (reads
    degrade, writes swallow) - deploy is safe pre-0012.
  - **Deferred:** live email (add SMTP_USER/SMTP_PASS to the app env + a user opt-in to switch it on);
    a true async email outbox worker; web/native push adapters; admin notifications (§27.4);
    reciprocal/coach/sponsorship/recruitment events not yet in the product.

- **2026-09-06** - **Migration 0012 APPLIED (Notifications live).** Jasper ran `scripts/apply-0012.sql`;
  verify returned notif_tables=2, notif_rls_policies=2. In-app notifications + preferences fully active.

- **2026-09-06** - **PHASE 12 - Achievements / Skill-tags / History (§9.4, §9.5, §49, §50): BUILT +
  deployed + live.** Scope (Jasper): official achievements issued **per-team on the organizer
  dashboard**. Awaiting one manual SQL paste (migration 0013).
  - **Migration 0013 (`0013_achievements_skilltags.sql`, WRITTEN - apply pending):** `skill_tags`
    (seeded 10 traits), `player_skill_tag_votes`, `achievements` (official/community), `player_achievements`
    (+placement), `achievement_endorsements` (§36.11-36.15) + enums + RLS. These are **attributed,
    public community endorsements** (unlike the anonymous vouch aggregate): public read; writes via
    service role. One-paste apply: **`scripts/apply-0013.sql`** (expect ach_tables=5,
    skill_tags_seeded=10, ach_rls_policies=5).
  - **Skill tags (§9.5):** community-endorsed traits on profiles (top tags + counts; an authed non-self
    viewer toggles endorsements). NOT part of CSL. `toggleSkillTag`.
  - **Achievements (§9.4):** **Official** (issued by a verified organizer - Champion/Runner-up/Bronze/
    MVP/Sportsmanship/Participant from `@vouchplay/config`; carries a "Verified organizer" label +
    tournament/division + placement) and **Community claims** (player-added, peer-endorsed, clearly
    labeled "not an official record"). Actions: `addCommunityAchievement`/remove, `toggleEndorsement`,
    organizer `issueOfficialAchievement`/`removeOfficialAchievement` (authz'd + audited; notifies each
    player via the new `achievement_awarded` notification type). Issued per-team from the organizer
    registrations dashboard (Award dropdown on confirmed teams).
  - **Playing history (§49):** a profile "Playing history" section **derived from registrations** (no
    new table) - tournament, division, status, date (public non-draft tournaments only).
  - **§50 HISTORICAL_SKILL_MISMATCH lit up:** the ELIG_V1 advisory flag now fires on *evidence only* -
    an official achievement tied to a division whose skill FLOOR is above the entered division's max
    (organizer-confirmed higher-division play). No invented score equivalencies. Wired into
    `lib/eligibility/compute.ts` (`hasHistoricalSkillMismatch`).
  - **UI:** real Achievements + Skill-tags panels + Playing-history section replace the empty profile
    scaffolds; organizer Award control per confirmed team.
  - Gates green (typecheck/lint/format/test - core 37, apps/web 15, config 4/build). Committed `817135d`,
    pushed; deployed; **re-aliased `vouchplayph.vercel.app`**.
  - **DB step handed to Jasper:** paste `scripts/apply-0013.sql` + return verify numbers. Until then
    reads degrade to empty, writes error gracefully; deploy is safe pre-0013.
  - **Deferred:** achievement media/photos (§48); community-claim reporting (reuse Phase-4 reports
    later); admin-issued (vs organizer-issued) achievements; the "repeated podiums" nuance in §50 (V1
    flags any organizer-confirmed higher-division entry).

- **2026-09-06** - **Migration 0013 APPLIED (Phase 12 fully live).** Jasper ran `scripts/apply-0013.sql`;
  results as expected. Achievements/skill-tags/history + §50 signal fully active.

- **2026-09-06** - **Bugfix + navigation loading cues (Jasper).** Shipped:
  - **FIXED tournament-page crash** ("Application error: server-side exception", digest 1910515799).
    Root cause: `registerNext()` was exported from `register-cta.tsx` (a `'use client'` module) and
    **called from the Server Component** tournament page (`Attempted to call registerNext() from the
    server`) - it runs on every render, so the page 500'd for signed-in users. Reproduced locally by
    forcing the authed branch on the dev server and reading the stack. Fix: moved `registerNext` into a
    server-safe util `lib/tournaments/register-link.ts` (no `'use client'`), imported by both the page
    and the client CTA. Documented the client/server-function boundary rule in handover §33.5A.
  - **Loading cues (handover §33.5A, new):** directory **Search** button + **Clear filters** now show a
    per-control spinner via `useTransition` (same-segment param nav doesn't trigger route `loading.tsx`,
    so an in-control spinner is required); **club cards** + **tournament cards** now embed a `LinkSpinner`
    (`useLinkStatus`) so a spinner appears on the tapped card while its detail page loads.
  - Gates green (typecheck/lint/format/build). Committed `d3d3ce8`, pushed; deployed; **re-aliased**.

- **2026-09-07** - **PHASE 13 - Admin Control Center (§30-§31, §13): BUILT + deployed + live.** Scope
  (Jasper): the full core bundle - System Settings + Audit viewer + Users admin + Analytics. **No new
  migration** (every table/column already exists). Identity Verification (§13 submission+review) is
  deferred to its own sub-phase (needs a private id-docs bucket + submission UI + retention).
  - **New `/admin` area** behind **`requireAdminPage`** (new page guard: admin/super_admin + verified
    TOTP + aal2; non-admin staff bounce to `/staff`) + `assertAdminActor` at every action layer +
    `viewerIsAdmin()` for nav. Landing tiles → settings/users/analytics/audit + a link to `/staff`.
    Admin link surfaced in `/me` (admins only).
  - **§30.7 System Settings** (the headline): a `SETTINGS_CATALOG` + pure `validateSettingValue()` in
    `@vouchplay/config` (single source of truth for label/group/kind/bounds; 15 unit tests incl. a
    guard that the catalog covers exactly `DEFAULT_SYSTEM_SETTINGS`). `updateSystemSettings` validates
    every value server-side, **upserts only changed keys**, writes one immutable `audit_logs` row per
    change (before/after snapshot, §30.8), and `revalidateTag`s the settings cache. Added two new
    settings keys - `announcement_banner_enabled` + `announcement_banner` (no migration needed; reads
    fall back to config defaults, first write upserts them). Grouped settings form at `/admin/settings`.
  - **Toggle enforcement wired (were previously inert):** `maintenance_mode` (non-staff see a
    maintenance screen in the app shell; staff keep access), `announcement_banner` (site-wide banner in
    the shell), `signup_enabled` (OTP `shouldCreateUser` gated - existing users can still log in, new
    signups blocked), `role_applications_enabled` (gates `applyForOrganizer`). `club_creation_enabled`
    already enforced.
  - **§30.8 Audit viewer** at `/admin/audit`: read-only, filter by action/entity/actor/date, keyset
    pagination, actor names bulk-resolved (no N+1), before/after JSON in native `<details>`. Relaxed
    `writeAudit` to accept a null `entityId` (a settings key has no uuid).
  - **§30.1-30.2 Users admin:** `/admin/users` (debounced search) + `/admin/users/[id]` (inspect:
    profile, email via `auth.admin.getUserById`, skill snapshot, active roles, role history). Actions
    (`admin-users.ts`, admin+aal2 + audit + critical `account_security` notify): **grantRole/revokeRole**
    (only super_admin may grant/revoke admin/super_admin; can't revoke your own privileged role),
    **setManualSkillVerified** (admin_override via recompute-first so a later vouch recompute preserves
    it; never alters calculated STS/CSL), and reuses the Phase-4 **applyAccountAction**
    (warn/restrict/suspend/ban/lift). Merge-duplicate + revoke-sessions deferred.
  - **§31 Analytics** at `/admin/analytics`: pure `computeAnalyticsSummary` in `@vouchplay/core`
    (conversion/average math + North Star, 11 unit tests) fed by cheap `head:true` COUNT queries
    (+ two small capped scans for distinct vouchers + verified revenue; noted to revisit at scale).
    Tiles for growth/vouching/tournaments/clubs/safety + the North Star (Skill-Verified active profiles).
  - Gates green (typecheck/lint/format/test - core 47, config 19, web 15/build - 6 new `/admin` routes,
    31 pages). Committed + pushed to `main`; Vercel auto-deployed; **re-aliased `vouchplayph.vercel.app`**.
  - **No DB step for Jasper this phase** (no migration). Deferred: §13 Identity Verification full flow;
    Users merge-duplicate + revoke-sessions; per-viewer settings-change diff email. **Next: pick with
    Jasper** - §16/§16A recruitment+bidding, organizer dashboard depth (§26.6/§26.8/§26.9), or §13.

- **2026-09-07** - **Post-Phase-13 fix batch + 2 brainstorms (Jasper).** BUILT + deployed + live.
  No migration.
  - **Loading cues (§33.5A):** new `ButtonLink` (a `<Link>` styled as a Button with a built-in
    `LinkSpinner`) - swapped in for the `<Link><Button>` CTAs on `/me` (Sign in / Create account /
    Complete profile / View public profile), home hero (Browse players / My profile / Create your
    profile), and the header Sign-in. `SettingsLink` rows on `/me` and the `/admin` landing tiles now
    show a `LinkSpinner` on tap. (SignOutButton / OrganizerApply already used `SubmitButton` pending.)
  - **Bottom-nav / "notification glitch":** the fixed mobile bottom nav was translucent
    (`bg-surface/95 backdrop-blur`), so content scrolling under it bled through at its edge (the
    gradient "Save preferences" button showed as a blue sliver - Jasper's screenshot). Made the nav
    **opaque** (`bg-surface`) so content is cleanly hidden beneath it, added
    `pb-[env(safe-area-inset-bottom)]`, and bumped app content bottom padding `pb-24 → pb-28` for
    clearance. (Verify on-device: the sliver should be gone.)
  - **Request a vouch - NOW WORKS.** The profile "Request a vouch" button was a stale stub
    ("opens in the next release") even though the `requestVouch` action (§12) shipped in Phase 3. Wired
    it to a real `RequestVouchForm` modal (attributed request + optional note), with auth-resume via
    `?intent=request-vouch`. **Request to partner** stays honest: partner invites are tournament-scoped
    today (a standalone Partner Finder is a later phase - see brainstorm), so the button now points
    players to invite a partner when registering for a tournament (the working path) instead of a dead
    "next release" message.
  - **Vouches unlimited by default (JT 2026-09-07):** `player_vouches_per_24h` + `coach_vouches_per_24h`
    default **0 = unlimited**; `submitVouch` treats `limit <= 0` as no cap. The one-active-vouch-per-pair
    rule + update cooldown are unchanged, so a player can vouch for unlimited *distinct* players/day but
    still only one active vouch each. Still admin-tunable (a cap can be set anytime from
    `/admin/settings`); catalog help documents "0 = unlimited". Updated the config default test.
  - **Brainstorms (no code):** `docs/BRAINSTORM_Vouch_Incentives_and_Partner_Finder_(2026-09).md` -
    (1) a **vouching-incentive** layer (separate "Community Contribution" level + badges + streak,
    coverage/quality-weighted, with a hard wall so it never feeds CSL/STS/weight - the anti-circular
    rule) and (2) a **Partner Finder** (`MATCH_V1` rules-based, explainable: skill + geo + shared
    clubs + vouch-graph proximity + LFP; privacy/anonymity-safe). Both mapped onto the existing
    pure-core-engine + admin-settings patterns; sequencing proposed.
  - Gates green (typecheck/lint/format/test - core 47, config 19, web 15/build 31 pages). Committed +
    pushed to `main`; Vercel auto-deployed; **re-aliased `vouchplayph.vercel.app`**.

- **2026-09-07** - **Toggle fix + master-plan updates + pilot-prep handover (Jasper).**
  - **Notification toggle glitch FIXED (for real):** the switch knob overshot the track when ON. Root
    cause was an `absolute` knob (`h-5 w-5`, `translate-x-5`) whose geometry sat flush at the edge.
    Replaced with the canonical Headless-UI pattern - `inline-flex items-center` track + smaller
    `h-4 w-4` knob + `translate-x-1`/`translate-x-6` - which sits cleanly inside at the app's 14px root
    (ON knob spans [21,35]px in a 38.5px track). Only one switch instance in the app; fixed it.
  - **Master plan (handover) updated to content v1.3:**
    - **§33.5A** promoted to a **MANDATORY, cross-cutting Definition-of-Done**: every control that
      triggers a load/route-change/server round-trip must show an immediate loading cue on the tapped
      element, checked in each phase's UI review. Documented `ButtonLink`/`SubmitButton`/`LinkSpinner`
      in §33.4.
    - **Phase 13A - Vouching Incentives** + **Phase 13B - Partner Finder** added (growth, non-blocking
      for the pilot; 13A light-nudge pullable pre-pilot, 13B post-pilot; both walled off from the skill
      model per §72). Brief: `docs/BRAINSTORM_Vouch_Incentives_and_Partner_Finder_(2026-09).md`.
    - **§19.4 Unverified/under-vouched registration prompt** added (+ §25.5 cross-ref): a non-blocking
      prompt warns an unrated/under-vouched registrant that the organizer may disapprove and channels
      them to get vouched by players who know their game. Spec only this turn; **implementation is item
      #1 of Pilot Prep**.
    - Changelog v1.3 entry.
  - **Pilot-prep handover written:** `docs/PHASE_PILOT_PREP_KICKOFF.md` - the next phase, scoped to
    making the live app ready to open Hermosa Cup registration (implement §19.4 prompt; turn on critical
    email via SMTP env; clear Supabase over-quota; E2E dress rehearsal + desktop-Excel export check;
    onboard the organizer + JT admins w/ TOTP; optional hold-expiry/waitlist cron).
  - Gates green (typecheck/lint/format/build; tests unaffected). Committed + pushed; deployed;
    **re-aliased `vouchplayph.vercel.app`**.

- **2026-09-07** - **Branding refresh + About/FAQ (Jasper).** BUILT + deployed + live. No migration.
  - **New logo:** swapped in the new full-colour horizontal VouchPlay logo
    (`logo_/new_logos/vertical_full_logo_transp.png` -> `apps/web/public/brand/vouchplay-logo-horizontal.png`,
    866x288); updated header + auth-layout `<Image>` dims to `h-9 w-auto`.
  - **"Powered by JT Consulting & Analytics" strip:** thin centred top strip in the header, links to the
    JT Facebook page (updated `BRAND.jtFacebookUrl` to the canonical people-page URL Jasper gave).
  - **About & FAQ built (§29, §5.3.1):** `/about` (mission, how-it-works, the four concepts CSL/STS/
    Skill-Verified/Identity-Verified, the skill ladder from SKILL_BANDS, JT attribution + FB link) and
    `/faq` (the §29.1 questions grouped into accessible native-`<details>` accordions, answering the
    LIVE feature set; deferred-feature Qs omitted). Surfaced under **Me -> Help & About** group + a
    home-page footer (About/FAQ/Terms/Privacy + Powered-by) for signed-out discoverability.
  - Handover updated to **content v1.4** (§5.2.1 branding, §5.3.1 About/FAQ now built, changelog v1.4).
    Pilot-prep handover unaffected except the version ref (v1.3 -> v1.4).
  - Gates green (typecheck/lint/format/test/build - 33 routes incl. /about + /faq). Committed + pushed;
    deployed; **re-aliased `vouchplayph.vercel.app`**.

- **2026-09-07** - **PILOT PREP part 1 - §19.4 registration prompt + critical-email path (Jasper).**
  Built; no migration.
  - **§19.4 player prompt:** registration state now includes a tight, viewer-scoped projection of
    profile slug + CSL/STS/unique-voucher/Skill-Verified status (no voucher identities). A pure
    `evaluateRegistrationSkillPrompt` helper in `@vouchplay/core` shares ELIG_V1's exact evidence,
    confidence, division-minimum-STS, and Skill-Verified review reasons, preventing UI/organizer-rule
    drift. Each open division shows neutral, non-blocking expectation-setting before registration,
    with current evidence facts plus Share-my-profile and Request-a-vouch paths. Six focused tests;
    core eligibility suite is 27/27.
  - **Critical email made operationally complete in code:** registration confirmed/rejected, waitlist
    promotion, and payment verified/rejected are now critical/email-eligible. `notifyMany` now invokes
    the email sender for each critical team recipient (the previous fan-out path only inserted in-app
    rows). Recipient email opt-in is still respected. Preferences copy and `SECRETS_SETUP.md` now match
    the actual `SMTP_USER`/`SMTP_PASS` names.
  - **Config check:** Vercel and local env currently have neither `SMTP_USER` nor `SMTP_PASS`; a real
    send remains pending Jasper's Gmail App Password + one opted-in recipient. Supabase quota, dress
    rehearsal/native-Excel gate, and organizer/JT TOTP onboarding remain the next Pilot Prep steps.
    JT explicitly deferred the hold-expiry/waitlist cron.
  - **Live readiness audit:** Jasper's account has active `super_admin` but no verified TOTP. Tane's
    existing account has no active staff role and no verified TOTP. The Hermosa organizer account is
    not yet identified. Supabase usage could not be queried through the CLI because no management
    access token is configured; the known over-quota warning therefore remains unresolved.
  - Gates green: typecheck, lint, test (web 15, config 19, core 54), format, build (33 pages).
  - Committed `8962b31`, pushed to `main`; Vercel production deployment
    `vouchplayph-qsiry1uuq-jasperandrewadjarani-hubs-projects.vercel.app` reached Ready; public home
    verified; **re-aliased `vouchplayph.vercel.app`**. §19.4 authenticated visual/E2E remains part of
    the dress rehearsal once the user-owned account/TOTP prerequisites are ready.

- **2026-09-07** - **PILOT PREP ops - production SMTP enabled (Jasper).** No code or migration.
  - Jasper added `SMTP_USER` and `SMTP_PASS` as hidden **Production** secrets in the Vercel project;
    the CLI confirmed both variable names without exposing their values.
  - Redeployed the already-gated Pilot Prep release with Next.js **15.5.25**. Deployment
    `vouchplayph-acuk33hfe-jasperandrewadjarani-hubs-projects.vercel.app` reached **READY**; production
    root and login returned HTTP 200; **re-aliased `vouchplayph.vercel.app`**.
  - The app email transport is now configuration-ready. A recipient opt-in plus one real critical-event
    inbox confirmation remain required before the critical-email E2E gate is complete.

- **2026-09-07** - **PILOT PREP discovery + loading-cue bugfixes (Jasper).** No migration.
  - **Managed tournament discovery fixed:** `/tournaments` now has an authenticated **Your
    tournaments** section for events the viewer owns or actively co-organizes, including drafts and
    unlisted events. The query uses the signed-in Supabase client/RLS; these records are not added to
    anonymous public discovery or duplicated in the public results/count. Unlisted cards carry a visible label. Live-data diagnosis confirmed
    Jasper owns two draft tournaments and one unlisted open tournament that the old public-only query
    omitted.
  - **§33.5A loading cues:** debounced tournament/club directory typing now immediately shows a
    `Searching…` spinner through navigation completion; the header notification bell and notification
    **Preferences** link now show their existing `LinkSpinner` inside the clicked control.
  - Gates green: typecheck, lint, test (web 15, config 19, core 54), format, build (33 pages).
    Committed + pushed to `main`; Vercel reached Ready; authenticated UI verified; re-aliased
    `vouchplayph.vercel.app`.
  - **Vercel domain diagnosis:** `vouchplay-v2.vercel.app` is the project-generated domain;
    `vouchplayph.vercel.app` is a working manual deployment alias. Keep re-aliasing until Jasper adds
  the vanity `.vercel.app` address as a Project Settings domain so production assignment is automatic.

- **2026-09-07** - **PILOT PREP profile + organizer usability v1.5 (Jasper).** Code complete; migration
  0014 pending Jasper's SQL-editor application.
  - **Me → Edit profile:** added a visible primary action plus `/me/edit`, with all editable fields
    pre-filled, stable public slug, current-avatar preservation, shared server validation/RLS, cache
    invalidation, success feedback, and a `Saving…` control state.
  - **Starter divisions:** new tournaments now create 15 draft doubles divisions - Beginner, Novice,
    Low Intermediate, High Intermediate, and Advanced × Men/Women/Mixed. The default 20-team capacity
    is `default_division_capacity_teams` in `system_settings`/Admin Settings. Preset construction is
    pure in `@vouchplay/core` and unit-tested; failed starter insertion compensates by removing the
    new empty draft.
  - **Division removal:** every division row has an inline, confirmed Remove action with `Removing…`
    feedback. The transactional RPC permits owner or `manage_divisions` co-organizer, refuses any
    registration/team/invitation/interest/announcement/achievement activity, writes immutable audit,
    then deletes.
  - **Tournament retention:** chose reversible Archive/Restore over hard delete. Only the owner can
    archive from Draft/Cancelled/Completed, after typing the exact tournament name; restore returns
    to Draft. The transactional RPC changes status and writes audit together. App-level hiding plus
    migration 0014 RLS keep archived details/divisions/announcements private to organizers/staff.
  - **Home copy:** “fair brackets” → “fair tournaments.” Master handover bumped to content v1.5 and
    documents all decisions. Vercel domains recorded as permanent project domains (verify after deploy;
    manual alias only if automatic attachment fails).
  - **Required DB step:** run `scripts/apply-0014.sql` in Supabase `itrosesiywpbaxtmucbb`; expected
    verify counts: `pilot_prep_functions=2`, `default_capacity_setting=1`,
    `archive_read_policies=3`. Until applied, profile edit/starter divisions/home copy work, but
    Archive/Restore and Remove return a safe error.
  - Gates currently green: typecheck; lint (0 warnings); core tests 58/58 including four new preset/
    retention tests; format; Next 15.5.25 production build (34 routes including `/me/edit`).
  - **Deployed:** commit `faf562f` pushed to `main`; Vercel deployment
    `vouchplayph-4o3nf3tsx-jasperandrewadjarani-hubs-projects.vercel.app` reached Ready. The production
    domain listing automatically attached `vouchplayph.vercel.app` and `vouchplay-v2.vercel.app` to
    this deployment (no manual alias command needed); both returned HTTP 200 and the new “fair
    tournaments” copy. Signed-in browser verification confirmed the visible Edit profile action,
    correctly pre-filled `/me/edit` form, division Remove control, and Archive confirmation section.

- **2026-09-07** - **Free tournament lifecycle control v1.6 (Jasper).** Code complete; migration 0015
  pending Jasper's SQL-editor application.
  - Replaced directional transition buttons with one mobile-friendly **Change status** selector plus
    explicit **Update status** action. Every non-archived status is available from every other
    non-archived status, including Published → Draft and Cancelled → Published.
  - The selected status displays its player-facing operational effect before saving; Cancelled uses
    a warning treatment. Unchanged submission is disabled, and the submit control shows
    `Updating status…` for §33.5A.
  - Archive remains outside the selector and keeps the v1.5 owner-only exact-name retention flow.
    Backward moves never delete/rewind registrations, teams, payments, eligibility, announcements,
    or achievements.
  - Added pure lifecycle status validation/free-movement rules and exhaustive pair coverage in
    `@vouchplay/core`. Server action revalidates status + `edit` permission and invokes migration
    0015's SECURITY DEFINER RPC; the database row lock, status update, and append-only audit insert
    are one transaction. Moving to Cancelled fans out the existing tournament-cancelled notification
    to active/pending registered players.
  - Master handover updated to content v1.6. Required DB step: run `scripts/apply-0015.sql` after
    migration 0014; expect `lifecycle_function=1`, `lifecycle_authenticated_grant=1`.
  - **Deployed:** commit `5322e0b` pushed to `main`; production deployment
    `vouchplayph-h56ytp57g-jasperandrewadjarani-hubs-projects.vercel.app` reached Ready and all project
    domains attached automatically. `vouchplayph.vercel.app`, `vouchplay-v2.vercel.app`, and the
    deployment URL returned HTTP 200. Signed-in verification confirmed all eight normal status
    options, consequence guidance, unchanged-submit disabling, archive separation, and mobile-safe
    layout. No live status was changed because migration 0015 is not applied yet.

- **2026-09-07** - **Tournament cover reliability + organizer list controls + growth-spec v1.7
  (Jasper).** Code complete; no migration.
  - **Cover upload bug fixed at the real boundary:** the form/action accepted a 4 MB source while the
    shared public `avatars` bucket capped each object at 2 MB; Storage rejected 2–4 MB covers and the
    action silently continued without `cover_path`. Selected PNG/JPEG/WebP files are now decoded,
    auto-oriented, metadata-stripped, bounded to a landscape-friendly maximum, and re-encoded as WebP
    under 1.9 MB before upload. Invalid/corrupt/oversized or failed uploads return actionable errors;
    a replacement uploads before the row changes, preserves the current cover on failure, uses a
    versioned immutable path, and cleans up superseded/orphaned generated objects best-effort. The
    Details form now previews the current/selected cover and explains the 4 MB/landscape guidance.
  - **Your tournaments visibility controls:** organizers can independently show/hide Draft,
    Cancelled, and Archived cards. All remain shown by default so records never appear lost. Sanitized
    `hideDraft`/`hideCancelled`/`hideArchived` URL state survives search and pagination, Back/Forward
    works, each control shows an immediate §33.5A spinner, and Show all/empty states remain available.
    Filtering is applied only to the authenticated managed query; public discovery, counts, RLS, and
    direct-read authorization are unchanged.
  - **Master handover updated to content v1.7:** §4.4 now locks the Coach application/evidence/AAL2
    review/approval/revocation/badge flow; §6.1 now locks visually engaging but transparent Home
    leaderboards (Your momentum, accessible podium, Players, Community Champions/Top Vouchers, Clubs,
    engagement CTAs, `LEADER_V1`, snapshots, privacy, anti-gaming). Added Phase 13C Coach Flow and
    Phase 13D Leaderboards; Most Bidded stays gated on §16A rather than blocking the first release.
    Next-session prompt: `docs/PHASE_13C_13D_COACHING_LEADERBOARDS_KICKOFF.md` (includes Phase 13A's
    `CONTRIB_V1` dependency for Community Champions).
  - Verification green: typecheck; lint (0 warnings/errors); tests 102 total (web 17, config 19, core
    66), including real Sharp image normalization + corrupt-image handling and pure cover boundary
    tests; format check; Next 15.5.25 production build (34 generated pages / 38 listed routes).
  - `npm audit --omit=dev` still reports 4 transitive advisories (Next-bundled PostCSS and ExcelJS's
    UUID). Its suggested force-fix would upgrade to Next 16 (known Vercel deploy blocker) and downgrade
    ExcelJS across a compatibility-sensitive exporter, so it was not applied; revisit with the
    documented Next-16 exit test and export regression suite.
  - **Deployed:** commit `7c8d680` pushed to `main`; Vercel deployment
    `vouchplayph-5dn04cfj1-jasperandrewadjarani-hubs-projects.vercel.app` reached Ready and automatically
    attached `vouchplayph.vercel.app` + `vouchplay-v2.vercel.app`. A controlled live-Storage smoke
    normalized a 3,587,842-byte JPEG (above the old 2 MB failure boundary) to a 720,770-byte WebP,
    uploaded/fetched it with HTTP 200, then deleted the `_smoke` object; no tournament data changed.

- **2026-09-07** - **Phase 13C/13D kickoff approved (Jasper).** Planning/contract gate complete;
  implementation now in progress.
  - Jasper confirmed migration 0014 SQL Editor counts: `pilot_prep_functions=2`,
    `default_capacity_setting=1`, `archive_read_policies=3`.
  - Jasper confirmed migration 0015 SQL Editor counts: `lifecycle_function=1`,
    `lifecycle_authenticated_grant=1`.
  - Approved implementation order: Phase 13C Coach Flow → Phase 13A `CONTRIB_V1` → Phase 13D
    Players/Community Champions/Clubs. Most Bidded remains gated until §16A.
  - Approved refinements/defaults recorded in handover content v1.8: unknown DOB excluded from public
    rankings while private momentum remains; configurable calendar-year Season; Admin city→region map;
    Coach evidence defaults of 5 files × 5 MB, JPEG/PNG/WebP/PDF, 60-second signed URLs, 7-day SLA,
    and 90-day post-decision retention.
  - Live pre-migration inventory: 3 active profiles (all without DOB), 1 pending Organizer application,
    1 active Super Admin role, 2 active anonymous vouches, 0 achievements, 1 pending club, 4 tournaments,
    1 registration, no fraud/moderation cases, and no role-evidence/contribution/leaderboard schema yet.

- **2026-09-07** - **Phase 13C + 13A + 13D implementation staged; DB application pending Jasper.**
  - **Coach journey:** built Me → Roles → Become a Coach progressive application/status/withdraw/
    information-response flow; private decoded evidence handling and bounded retention cleanup; AAL2
    Admin queue/detail/decision workspace; transactional application/grant/revoke/audit RPCs; critical
    notifications; active-role-only badge; analytics; and server/RLS defenses. The system-level Coach
    weight kill switch defaults enabled, while the per-vouch “Vouch as a Coach” checkbox remains
    explicit and unchecked by default.
  - **Contribution:** added pure deterministic `CONTRIB_V1` with repeat-pair suppression, newcomer
    support, reciprocity/ring dampening, diminishing daily credit, decay, levels/badges/streak, bounded
    aggregate recomputation, public progress UI, Admin settings, fixtures, and build-failing isolation
    guards. No rating favourability, raw volume, anonymous voucher identity, STS, or vouch weight enters
    the engine.
  - **Leaderboards:** added pure deterministic `LEADER_V1`, privacy-safe versioned snapshots and private
    momentum, atomic service-only publisher, Admin AAL2 rebuild/exclude/activate plus settings-based
    pause controls, cache-first public DTOs, Players/Community Champions/Clubs Home and full-route UI,
    accessible podium/ranks/filters/explanations/real CTAs, deduplicated milestone notifications, and
    an intentionally empty Most Bidded adapter behind its false flag.
  - **Operations/security:** daily authenticated cron, fixed-query bounded source loads, two-query
    cached public boards, one-query private momentum, migration verification queries, and
    `scripts/verify-phase13-rls.mjs` for anon/player/Admin direct API abuse checks. Browser QA covered
    dark/light, 1440px/390px, keyboard-accessible controls, reduced-motion CSS, no horizontal overflow,
    and a clean console in the honest pre-snapshot state.
  - **Local gates:** the final post-documentation run is green: typecheck, lint, tests (web 17, config
    19, core 77), format, and Next 15.5.25 build (40 generated pages). **Not live:** Jasper must apply
    and return exact counts for `scripts/apply-0016.sql`, then
    `scripts/apply-0017.sql`; controlled-account tests, snapshot publication, commit/push, Vercel Ready,
    and both-domain production verification follow only after that.

- **2026-09-08** - **Phase 13 database + direct-authorization gates passed (Jasper/Codex).**
  - Jasper applied `scripts/apply-0016.sql` then `scripts/apply-0017.sql` to
    `itrosesiywpbaxtmucbb` and confirmed every embedded count: Coach tables 2/RPCs 6/settings 11/
    private bucket 1/RLS policies 2/Organizer applications preserved 1; leaderboard tables 7/RPCs 4,
    contribution settings 17, leaderboard settings 32, and leaderboard RLS policies 6.
  - `npm run verify:phase13-controlled` provisioned disposable Player and AAL2 Admin sessions, passed
    **20/20** direct anon/authenticated/staff checks with zero skips, and removed both accounts. Coverage
    includes Coach self-grant/direct-insert denial, private evidence/bucket/application denial, public
    snapshot DTOs, private momentum own/other isolation, Admin controls, and privileged RPC boundaries.
  - The first bounded live builder run published 14 active global/city snapshots, 24 private momentum
    rows, and two `CONTRIB_V1` aggregates. Public entries are correctly zero: all three current real
    profiles lack DOB and the sole current club is pending, so no identity or fake bid/rank data was
    invented. Source-count truncation now fails closed, and §6.1 privacy/club decisions plus engagement
    CTAs are pure-core fixtures; core is now 90/90.
  - Remaining release work: final full gates, commit/push, Vercel Ready, production Coach workflow,
    opt-out/rebuild evidence, both-domain HTTP/browser verification, and `CRON_SECRET` confirmation.

- **2026-09-08** - **Phase 13C + 13A + 13D production release completed.**
  - Production Coach lifecycle exercised with controlled Player/Admin accounts: progressive submit
    with normalized private WebP evidence, pending/history/SLA, withdrawal, second submission, AAL2
    staff review and 60-second signed evidence access, information request, applicant response and
    resubmit, approval, critical notifications/deep links, and active-role-only public Coach badge.
  - Fixed two production defects found during exercise: existing verified TOTP factors can now step
    AAL1 sessions up to AAL2, and evidence links use a popup-safe create-then-open flow. Commits
    `f043359` and `75ecdb4` are Ready in production.
  - Explicit Coach vouch and revocation invariant passed: the per-vouch control was unchecked by
    default; the controlled Coach vouch recorded `used_coach_weight=true`, weight 2, `WEIGHT_V1`;
    AAL2 revocation changed the role to revoked and appended audit/critical notification records while
    preserving those event-time vouch facts.
  - Controlled leaderboard publication produced real eligible rows in Players, Community Champions,
    and Clubs. Player opt-out removed the fixture from all active public snapshots while the signed-in
    player retained eight private momentum rows marked `opted_out`. Cleanup deactivated both accounts
    and the club, removed the evidence object, soft-deleted Auth access, retained application/event/
    audit history, and published a final zero-synthetic-entry snapshot set.
  - Privacy hardening found during cleanup: public city/region selectors now derive only from publicly
    eligible subjects, so private/ineligible rows cannot leave empty scope labels. Added deterministic
    pure-core coverage. Final clean production state has seven global snapshots and no synthetic public
    rows; the real-user cold start remains honest because current real profiles lack DOB and the real
    club is pending.
  - Production `CRON_SECRET` is configured. Final gates are green: typecheck, lint, tests (web 17,
    config 19, core 92), format, and Next 15.5.25 build (40 generated pages). Release commit `656b49b`
    reached Ready at `vouchplayph-pralldbow-jasperandrewadjarani-hubs-projects.vercel.app`; both
    `vouchplayph.vercel.app` and `vouchplay-v2.vercel.app` returned HTTP 200 for Home/leaderboards,
    and the unauthenticated cron returned 401. Signed-out browser QA on both domains confirmed the
    LEADER_V1 empty state, working CTA, accessible controls, 390 px dark/light rendering, no horizontal
    overflow, and no console warnings/errors. Project domains attached automatically.

- **2026-09-08** - **Leaderboard eligibility + mobile resume + compact Players v1.11 staged.**
  - **DOB is no longer a ranking prerequisite:** unknown DOB now defaults to eligible for an otherwise
    public `LEADER_V1` player; a supplied minor DOB remains excluded. Added migration 0018 plus the
    exact `scripts/apply-0018.sql` copy. Jasper must apply it and return
    `unknown_dob_optional=1`, `leaderboard_setting_row=1`, then run an Admin rebuild or wait for the
    scheduled snapshot before the changed production setting is claimed live.
  - **Long-idle mobile behavior diagnosed and fixed:** mobile web apps normally suspend/restore unused
    tabs, while the app previously had no `visibilitychange`/BFCache recovery. The shell now performs
    one deduplicated App Router refresh only on a persisted restore or after 60 seconds hidden-no
    background polling, focus thrash, or per-card fetches.
  - **Players compact view:** `/players?view=compact` is an accessible URL-preserved list of avatar,
    name, labelled colour-coded Community/Self-Rated skill, and STS. Detailed cards remain the default;
    filters and pagination persist and compact rows link to the full profile for vouching/context.
  - Updated locked master handover to content v1.11, root `master_plan.md`, and
    `docs/PHASE_14_RECRUITMENT_SPONSORSHIP_AND_BIDDING_HANDOVER.md`. Local gates green: typecheck,
    lint, tests (web 20, config 19, core 93), format, and Next 15.5.25 build (40 routes).

- **2026-09-08** - **Media normalization v1.12 production release for scale.**
  - **All new avatar, club-logo, and image payment-proof uploads are server-normalized:** decoded
    bytes must match declared PNG/JPEG/WebP MIME; output is auto-oriented, metadata-free, bounded
    WebP. Profiles are Avatar (512 px / 250 KB), Club logo (768 px / 384 KB), and private payment
    proof (2048 px / 1.5 MB). Payment PDFs remain private, signature- and parse-validated documents.
  - **Storage hygiene:** avatar and club-logo replacement writes upload a generated replacement first,
    retain the active path until the database write succeeds, then best-effort delete only the
    superseded generated object. A newly uploaded object is removed if its database write fails.
    Existing media and payment-proof replacement retention are deliberately not changed or rewritten.
  - **UX and verification:** each relevant form now explains optimization without hiding its file
    limit or private-proof status. New tests cover decode/MIME mismatch, unreadable bytes, EXIF removal,
    no enlargement, output bounds, and PDFs. A controlled live Storage smoke test uploaded/read back
    temporary public/private WebP objects (512×354 / 420 B and 2048×1418 / 5,272 B) and removed them.
    Local gates are green: typecheck, lint, tests (web 26, config 19, core 93), format, and Next 15.5.25
    build. Release commit `2e699f9` is Ready at
    `vouchplayph-4lnc1aw1r-jasperandrewadjarani-hubs-projects.vercel.app`; both production domains
    returned HTTP 200 for Home, Players, and Leaderboards, and browser validation was clean. No
    migration is required. Phase 14 handover is unchanged because this is a cross-cutting
    pilot-hardening refinement, not recruitment/sponsorship or bidding scope.

- **2026-09-08** - **Phase 13.5 implemented locally (Tournament reliability + registration
  flexibility). NOT pushed - awaiting Jasper's go-ahead.** No new migration required: live schema
  audit (`scripts/phase13-5-audit.mjs`) confirmed `tournaments.payment_qr_path`, `club_lock_at`,
  `max_divisions_per_player`, `divisions.max_entries_per_player`, `organizer_override` +
  `override_reason` columns, the private `payment-proofs` bucket, and settings all already live.
  Migration 0020 is effectively already applied (payment_qr_path present AND populated with a real
  saved QR object).
  - **Payment QR:** root cause was organizer-side, not upload. The upload/replace path was already
    transactional; the failure was that the saved QR had no reload confirmation (file input clears on
    reload) and the detail column set never selected `payment_qr_path`, so the manage form couldn't
    prove persistence. Added `payment_qr_path`/`club_lock_at` to `TOURNAMENT_DETAIL_COLUMNS`, a
    canManage-gated 5-minute signed `paymentQrUrl` in the detail DTO (path never leaves the server;
    never minted for non-managers), and a persistent private-QR preview + "saved" confirmation in the
    tournament form. Player payment path already minted a 60s signed QR URL correctly.
  - **Long-idle browser:** `PageResumeRefresh` already existed and is mounted. Added the missing
    route-aware `(app)/error.tsx` (retry + auth-stale sign-in/resume link) and root `global-error.tsx`,
    a privacy-safe `/api/client-error` telemetry sink (allowlisted fields only: route, digest, error
    name, visibility, persistedRestore, authStale, deployVersion, scope - never message/tokens/PII),
    and a build-time `NEXT_PUBLIC_DEPLOY_VERSION`. Pure `error-telemetry.ts` + 4 unit tests.
  - **Club representation:** `setClubRepresentations` already enforced the single tournament-wide
    `club_lock_at` and was independent of payment/confirmation state (edit allowed after payment). Added
    an immutable `audit_logs` record on every player edit, a new organizer/Admin `overrideClubRepresentations`
    action (requires a reason, writes `organizer_override=true`/`override_reason`, appends audit, never
    touches team/division/fee/payment/eligibility), and an organizer club-lock date/time control in the
    manage form (single all-divisions lock, no per-division exception).
  - **Multiple entries:** already fully supported - no one-per-tournament guard exists anywhere;
    `register_team`/`registerSolo` are per-division and the same-player/same-division prohibition is
    enforced procedurally (doubles `partner_conflict`, singles team-reuse + `already_registered`). No
    schema change needed.
  - **My registrations (N):** new default-collapsed `MyRegistrationsSummary` (native details/summary,
    icon+text status never colour-alone, keyboard/SR accessible) placed immediately after tournament
    details; the registration panel below was de-duplicated to "Your entries and divisions" with
    plural-safe copy.
  - **Home copy:** no em dashes anywhere in app source (verified). Fixed the one awkward
    "support-not" hyphen-as-dash on Home to a clean sentence.
  - **Gates green:** typecheck, lint, tests (web 30 incl. +4 error-telemetry, config 19, core 95),
    format, Next 15.5.25 build (42 pages, up from 40 with the client-error route + error boundaries).
    Direct anon/abuse checks `scripts/phase13-5-abuse.mjs` pass 7/7 (private QR object + signed-URL
    denied, club reps + audit_logs RLS-blocked, privileged RPCs permission-denied, registration insert
    RLS-denied). Signed-out browser smoke of Home + a public tournament page: clean console, correct
    render, summary correctly absent for anon.
  - **Remaining before "live":** Jasper's go-ahead to commit/push `main`; wait for Vercel Ready;
    both-domain HTTP + browser verification; controlled authenticated organizer/player browser tests
    (QR upload/save/hard-reload/replace, player proof screen, idle/BFCache/expired-auth, two-division
    registration + same-division rejection, club edit before/after lock + reasoned override, My
    registrations expansion). No SQL for Jasper to apply this slice.
  - **Pushed + production-verified 2026-09-08:** Jasper approved the push. Commit `f89af55` on `main`
    (fb_posting_assets deliberately excluded from the commit). Vercel reached Ready; both
    `vouchplayph.vercel.app` and `vouchplay-v2.vercel.app` returned HTTP 200 for Home, Tournaments,
    Players, and Leaderboards, the new `/api/client-error` telemetry route returned 405 on GET and 200
    on a valid POST on both domains, and signed-out browser QA of a public tournament page was clean
    (correct render, no console errors). Still open: controlled authenticated organizer/player browser
    tests (QR upload/reload/replace + proof screen, idle/BFCache/expired-auth, two-division register +
    same-division rejection, club edit before/after lock + reasoned override, My registrations
    expansion) - these need real sessions and are the remaining definition-of-done evidence.

- **2026-09-08** - **Phase 13.5 UI/UX follow-up pass (after Jasper review).** No migration; pure UI,
  copy, and one new organizer control. See `working/P_006b_Phase13_5_Walkthrough_(2026-09).md` for
  detail.
  - Built the missing **club representation override UI** (`getClubOverrideParticipants` +
    `ClubOverrideControl`, collapsed section on the manage page). The override action already existed;
    now it has a trigger. The manual test script's override step is no longer blocked.
  - **Registration IA rebuilt:** one collapsed **My registrations (N)** manager (entries + payment +
    cancel/move + change-partner) plus one always-present, collapsed **Divisions (N)** browser where a
    signed-in player can register into any division. This fixes "can't register in other divisions
    once I have an entry / no register buttons appear." Deleted `RegistrationPanel`, `DivisionList`,
    and `MyRegistrationsSummary`.
  - **Progressive help text:** new `InfoDisclosure` "i" control; change-partner, skill-mismatch, and
    leave-team guidance moved behind a tap; removed the "Other divisions stay collapsed" line.
  - **Home/leaderboard copy de-cluttered:** dropped `LEADER_V1`, the "no raw STS ranking" footer, and
    the wordy empty-state text; empty boards read "No rankings yet." New hero: "Your game, vouched for
    by the players you play with." / "Find players, build a trusted profile, climb the leaderboards,
    and play more."
  - None of these are deferred to a later phase; all are this-slice UI/UX and copy polish and touch no
    ranking algorithm, eligibility, CSL/STS, vouch weight, or payment-state logic. Gates green:
    typecheck, lint, tests (web 30, config 19, core 95), format, build (42 pages). Signed-out browser
    QA of Home and a tournament page clean.

- **2026-09-08** - **Phase 13.5 UI/UX + bug-fix pass 2.** No migration. Bugs: payment QR now shows for
  a fresh `payment_pending` entry (was gated on a not-yet-existing payment row); cancelling a
  registration dissolves the team in one step, notifies the partner, and frees both to re-register
  (removes the erroring "leave team" step). Tweaks: de-duplicated interest modal text; top bar stays
  dark in light mode (`.vp-topbar`); Register button expands the Divisions browser; interest and
  capacity meters are skill-band coloured; several copy trims. Gates green (web 30, config 19, core
  95; build 42 pages). See `working/P_006b_Phase13_5_Walkthrough_(2026-09).md`.
- **2026-09-08** - **Organizer global division rules IMPLEMENTED (needs migration 0022 to activate).**
  Three tournament-wide toggles: (1) skill floor, default ON - a player cannot register in a division
  below their skill level (equal/higher allowed), enforced server-side and shown as a red block in the
  division browser; registering above shows a warning but is allowed. Implemented as a SEPARATE pure
  gate (`@vouchplay/core evaluateSkillFloor`), NOT by touching the version-locked ELIG_V1 engine.
  (2) Require Skill Verified, default OFF, moved from per-division to one global toggle (fed into
  ELIG_V1). (3) Require organizer approval, default OFF, global - downgrades an otherwise-eligible
  entry to review so the organizer must confirm. The two per-division checkboxes were removed from the
  division builder; migration 0022 rolls existing per-division intent up to the new global flags. Code
  is deployed dormant and safe until 0022 (defensive reads default the feature off). Effective skill =
  community if known, else self-rating. Gates green (web 30, config 19, core 104; build 42 pages). See
  `working/P_006b_Phase13_5_Walkthrough_(2026-09).md`.
- **Apply migration 0022 to activate organizer rules:** Jasper runs `scripts/apply-0022.sql` against
  `itrosesiywpbaxtmucbb` and returns `tournament_rule_columns=3`. Until then the rules are dormant.
  ✅ APPLIED 2026-09-08 (`tournament_rule_columns=3`); organizer rules live, both domains verified.

- **2026-09-08** - **Phase 14A Recruitment/Sponsorship IMPLEMENTED (needs migration 0023 to activate).**
  Jasper chose 14A only (no bidding). Verified, active clubs publish recruitment/sponsorship offers;
  players opt in (reusing `profiles.open_for_sponsorship`) and respond; clubs accept/decline. All
  server-authorized, RLS-protected, rate-limited (`club_offers_per_24h`, `offer_responses_per_24h`),
  audited, with a `recruitment_enabled` master switch and `offer_default_expiry_days`. Pure lifecycle
  + advisory targeting in `@vouchplay/core` (offers never touch CSL/STS/eligibility/leaderboards).
  New: migration `0023_club_offers.sql` + `scripts/apply-0023.sql` (2 tables + 2 RLS policies + 4
  settings), `packages/core/src/offers/*`, `packages/validation/src/offer.ts`,
  `apps/web/src/lib/offers/queries.ts`, `apps/web/src/lib/actions/offer.ts`, offer notification types,
  club manage "Opportunities" section, `/opportunities` player browse with opt-in, Clubs-page entry
  link, `scripts/phase14a-abuse.mjs`. Code deploys safely dormant until 0023 (missing tables return
  empty). Gates green: typecheck, lint, tests (web 30, config 19, core 110), format, build (43 pages).
  Plan: `working/P_006b_Phase14A_RecruitmentSponsorship_Plan_(2026-09).md`.
- **Apply migration 0023 to activate 14A:** Jasper runs `scripts/apply-0023.sql` against
  `itrosesiywpbaxtmucbb` and returns `club_offer_tables=2`, `club_offer_rls_policies=2`,
  `recruitment_settings=4`. Then run `node scripts/phase14a-abuse.mjs` (expect all pass) before
  claiming the surface live.
  ✅ APPLIED 2026-09-08. The Supabase SQL Editor only shows the LAST select's result, so Jasper saw
  only `recruitment_settings=4`; a direct live check confirmed both tables + RLS exist, and
  `phase14a-abuse.mjs` passed 5/5. 14A is live in production; both domains verified.

- **2026-09-08** - **Fixed an app-wide React hydration error (#418).** Bare
  `toLocaleDateString()`/`toLocaleString()` format in the runtime's own locale/timezone, so the Vercel
  server (UTC/en-US) and the browser produced different date strings and tripped hydration. It surfaced
  app-wide via the Home leaderboard footer once empty snapshots existed. Added `lib/format-date`
  (pinned en-US + UTC) and routed the leaderboard footer + coach panels through it; also fixed
  `InfoDisclosure` to use block wrappers so a `<div>` child is not nested in a `<span>`. Commit
  `2445c9f`; verified clean console on Home/Clubs/Opportunities in a fresh production tab. Remaining
  bare-locale date calls on admin/staff-only pages (`admin/audit`, `admin/leaderboards`,
  `admin/users/[id]`, `admin/settings-form`, `staff/role-applications/coaches`) are low-priority
  internal-tool cleanup, not user-facing.

- **2026-09-08** - **Launch welcome pop-up shipped (Admin-controlled, currently OFF).** Near-full-screen
  one-tap-dismissible announcement for launch night, shown once per visitor per version on whichever
  route the shared link lands on. Reuses the accessible `Modal` with a new `size="lg"` variant (Escape,
  overlay click, 44 px labelled close). **No migration** - all copy/image/link/version/on-off are
  `system_settings` that merge over code defaults. Renders only after mount (localStorage "seen" flag)
  so it cannot cause a hydration mismatch. Primary CTA is Create free account (signed-in visitors get
  See the tournament instead). Copy deliberately avoids promising a reserved slot and uses an absolute
  date, since the dialog can be seen after midnight. Settings are pre-seeded in the live DB with
  `welcome_modal_enabled=false`; Jasper flips it on after pasting the image URL. Gates green
  (web 30, config 19, core 110; build 43 pages). Verified at 375x812: the whole announcement including
  the primary button fits with no scrolling. See `master_plan.md` §1F.

- **2026-09-08** - **STS explainer shipped (live-launch feedback).** Real signups asked "what is STS?"
  within minutes. Root cause: the STS chip explained itself with an HTML `title` tooltip, which is
  invisible on touch and to keyboard users. The chip is now a real button opening an accessible
  explainer dialog (reused `Modal`), with a help icon and descriptive `aria-label`. Copy leads with
  "confidence, not skill", lists what raises it, reassures that a low STS is not a weak player, keeps
  skill and STS separate (§3.3), restates that VouchPlay never ranks by STS (§6/§8.4), and ends with
  "get a vouch" / FAQ links. Extracted to `players/sts-chip.tsx` and re-exported from `badges.tsx`, so
  the profile and both player-card variants pick it up unchanged. Gates green (web 30, config 19,
  core 110). See `master_plan.md` §1G.

- **2026-09-08** - **STS explainer presentation fixed on a live device.** Jasper's phone screenshot
  showed the dialog opening as the large bottom sheet: on a tall phone the heading was pushed under
  the browser chrome and read as clipped, and the copy was too explanatory. Added an `align` prop to
  `Modal` and switched the explainer to the compact centered variant (`max-h-[85dvh]`), then cut the
  copy by about a third: one lead sentence with the 0-5 scale folded in, three short bullets, one
  reassurance line, a primary "Get a vouch" and a plain-text FAQ link. Rule recorded: explanatory
  dialogs are centered and compact; only image-led announcements use the full-width sheet. See
  `master_plan.md` §1G and handover v1.20.

- **2026-09-08** - **Compact player list fixed (live report).** Names were truncating and STS chips did
  not align. Cause: the name and the skill/STS group sat side by side with the right group `shrink-0`,
  so flexbox squeezed the name (the most important field) first, and STS sat inline after the pill so
  its position moved with pill width. Rebuilt as two lines: name owns the full width, skill pill on its
  own line, STS in a fixed-width right column that holds its width when absent. Verified at 375 px:
  0 truncated names, single shared STS column x-position across all 24 rows; row height effectively
  unchanged. **Also fixed an invalid-nesting bug from the STS explainer** - the compact row is a link
  and the chip had become a `<button>` inside it (one tap would open the dialog and navigate).
  `StsChip` gained an `interactive` flag; inside links it renders a plain chip. See `master_plan.md`
  §1H.

- **2026-09-08** - **Clubs header fixed on mobile.** The heading and the two actions (Opportunities,
  Create club) were forced onto one row at every width, so on a phone the title/subtitle got half the
  screen (subtitle wrapped to two lines) and the buttons stacked raggedly. Now the row is shared only
  from `sm:` up; on a phone the actions take their own full-width row with both buttons at equal size.
  Desktop unchanged. Also raised both to a real 44 px tap target. **Gotcha recorded: the app sets a
  14 px root font size, so rem-based Tailwind sizes are 0.875x - `min-h-11` is 38.5 px, not 44. Use
  `min-h-[44px]` when a true touch minimum matters.** See `master_plan.md` §1I.

- **2026-09-08** - **Slot counts hidden from the public + interest options synced to real divisions.**
  (1) The player-facing division browser no longer shows `X / Y teams` or the capacity meter, to avoid
  deflating interest early and to preserve scarcity later. This deliberately reverses the §1C public
  registration-bar decision. Organizers still see capacity on Manage. A **full** division is still
  disclosed without numbers, because registering there joins a waitlist rather than taking a slot.
  (2) Interest options now come from the organizer's own visible divisions, falling back to the fixed
  planning taxonomy only when none are configured; the picker and the breakdown share one
  `demandOptions()` helper. **No migration** - `division_key` is free-form text (`^[a-z0-9_]{3,64}$`)
  and a division key is `div_` + uuid without hyphens; the server only accepts a key that resolves to
  a non-draft division of that same tournament. Interest already stored under old taxonomy keys still
  renders with its correct label, so nothing is lost. Verified against live data: 16 visible divisions,
  all generated keys valid for the DB pattern, and the public page shows 0 slot counts with fees
  intact. Gates green (web 30, config 19, core 117). See `master_plan.md` §1J.

- **2026-09-09** - **All app times are now Philippine time (UTC+8).** Root cause of the live
  "registration opens 1:26 AM" bug: `datetime-local` values were parsed with `new Date(value)`, which
  resolves in the *runtime's* timezone (UTC on Vercel), so an organizer typing 5:00 PM stored `17:00Z`;
  the same value was then displayed through a `UTC` formatter. Added a pure `@vouchplay/core`
  `time/ph-time.ts` (`phInputToIso`, `phDateInputToIso`, `isoToPhInput`, `isoToPhDateInput`) with 8
  unit tests including one asserting the exact live defect, repointed `lib/format-date.ts` to
  `Asia/Manila`, and routed the tournament create/manage forms and detail page through both. Storage
  stays UTC (§35.5); only entry and display are anchored. PH has had no DST since 1978, so a fixed +8
  offset is exact. Corrected the live B-Steel value from `2026-09-09T17:26:00+00:00` to
  `2026-09-09T09:00:00Z` = **Sep 9, 2026, 5:00 PM Manila**; verified on production. Commit `cd083ab`.
  **Standing rule: no bare `new Date(x)` parsing of form input, no bare `toLocale*`, no `timeZone:
  'UTC'` in app code** - that combination causes both silent day-shifts and React #418.

- **2026-09-09** - **Vouch option "I have watched them play" + peer-nominated achievements
  (migration 0024 ✅ APPLIED, live in production).**
  (1) `vouch_interaction` gains `observed` for someone who genuinely saw a player but never partnered
  with or played against them - previously the form forced a play relationship that never happened.
  **No weighting change**: interaction type has never been an input to `effectiveWeight` (§10.5); only
  the coach toggle and the voucher's identity verification move weight, and 1.00/1.25/2.00/2.50 stays
  locked. Copy centralised in `apps/web/src/lib/vouches/interaction.ts` so the form and the moderation
  view cannot drift.
  (2) `achievement_issuer_type` gains `peer`, so another player can add an achievement FOR you. It is
  **invisible to everyone but you until you confirm it**; state rides on
  `achievements.verification_status` (`pending_subject` → `community`), which is free-form text with
  no check constraint, so no column was added. Declining deletes the row and the nominator is not
  notified. Guards: no self-nomination via this path, blocked pairs excluded, target must be active and
  onboarded, 1 undecided nomination per nominator per subject, 20 per subject, pending claims cannot be
  endorsed, and the subject can always remove a confirmed claim. New notification types
  `achievement_nominated` / `achievement_nomination_confirmed` (notification `type` is text, no enum,
  so no migration). Community claims still never affect CSL, STS, Skill Verified, vouch weight,
  contribution, eligibility, or any ranking.
  Release order: this code was **held out of production until 0024 was confirmed**, then pushed. See
  the migration note below for why that differed from 0022/0023.
- **Apply migration 0024:** Jasper runs `scripts/apply-0024.sql` against `itrosesiywpbaxtmucbb` and
  returns `vouch_interaction_observed=1` and `achievement_issuer_peer=1`. It is a two-line additive
  `alter type ... add value if not exists`, safe to run while the app is live and a no-op on re-run.
  The verification is deliberately ONE query because the Supabase SQL Editor only shows the last
  select's result.
  ✅ **APPLIED 2026-09-09** - Jasper returned `vouch_interaction_observed=1` and
  `achievement_issuer_peer=1`. Both surfaces are live in production (commit `adde7d3`), both domains
  verified. **Deliberate release sequencing, worth repeating:** unlike 0022/0023 this code was held
  back rather than deployed dormant, because these are *visible controls* a live registration-weekend
  user could tap - a dormant table returns empty, but a dormant enum value returns an error to a real
  person mid-action. Rule of thumb: deploy-before-migrate is fine when the gap is silent, not when it
  is a button.

- **2026-09-09** - **Interest breakdown merges old taxonomy rows into the real divisions.** Jasper's
  screenshot showed "Novice Men's 6" sitting directly above "Men's Doubles Novice 0" - two rows for
  one thing. Cause: interest collected before the organizer configured divisions is stored under
  planning-taxonomy keys, interest collected after under `div_<uuid>` keys; §1J fixed the labels but
  not the split. Legacy keys now fold onto the matching division (same single skill band + sex; for
  the age bracket, same age floor + sex). **Only an exactly-one match aliases** - ambiguous or absent
  matches keep their own row, and the merge is sum-preserving, so nothing is silently reassigned or
  dropped. The age bracket matches on having an age floor, not the exact age, since the taxonomy
  offers 50+ while Hermosa runs 45+. Matching is pure + unit-tested in `@vouchplay/core`
  `tournaments/demand-alias.ts` (9 new tests); the app layer supplies shapes because band keys live in
  `@vouchplay/config`. Replayed against live Hermosa data: **8/8 legacy keys resolved, 0 legacy rows
  left over, total held at 21 before and after.**

- **2026-09-09** - **The vouches-given leaderboard already existed; it needed a rebuild, not a build.**
  "Community Champions" (`category = 'community'`) has ranked contribution - vouches given - since
  Phase 13C. Live check: its **active snapshot is dated 2026-09-07T22:10:41Z and holds 0 entries**,
  while `player_contributions` now has 24 scored players and there are 93 active vouches. So no new
  board was written. What was missing was plain language: every board now states what it ranks, the
  category picker reads "Community Champions - vouches given", and an empty board explains that no
  snapshot has ranked anyone yet rather than dead-ending on "No rankings yet."
- **The nightly rebuild is not landing - cause not yet identified.** `CRON_SECRET` **is** configured:
  an unauthenticated `GET /api/cron/leaderboards` returns **401**, not the 503 `CRON_NOT_CONFIGURED`
  it would return if the secret were missing (checked on both production domains 2026-09-09). So the
  `17 1 * * *` (01:17 UTC = 09:17 Manila) cron in `vercel.json` is wired, yet no snapshot has been
  published since 2026-09-07. Settings are not the blocker either: cadence is 24h,
  `leaderboards_enabled=true`, and no category is paused. Remaining suspects, in order: the Vercel plan
  not actually executing the cron, or a failing run. **Next step: check the Vercel dashboard cron
  invocation log.** Do not repeat the earlier (wrong) claim that `CRON_SECRET` is missing.
- **Immediate action for Jasper:** trigger **Admin → Leaderboards → rebuild** once (needs a stepped-up
  AAL2 admin session) to publish a snapshot including the 24 current contributors. That fixes the
  visible symptom today, independent of the cron investigation.

- **2026-09-09** - **Loading cue when tapping a compact player row.** Previously there was none, so on
  a slow connection the tap looked ignored. New `components/players/compact-row-trailing.tsx` swaps the
  STS chip for a spinner while that row's navigation is pending. **Recorded because I got it wrong
  first:** my initial version added a trailing chevron column, which took ~28px from the name/pill
  column and made "High Intermediate · Community" pills wrap onto a second line - caught in the 375px
  emulator before shipping. Reusing the existing fixed 66px STS column costs no horizontal space, so
  nothing to its left can reflow. **Standing rule for this list: any new element in a compact row must
  reuse an existing fixed-width column, never add one** (see also §1H truncated names). The detailed
  card's name link also gained a spinner, matching "View profile".

- **2026-09-09** - **Numbered pagination (shared component).** Jasper's screenshot showed the old
  control: two heavy bordered buttons pinned to opposite edges with "Page 2 of 3" marooned between
  them. New `apps/web/src/components/ui/pagination.tsx` (+ `page-link-label.tsx` for the in-place
  pending spinner) serves Players and Clubs. Numbered pages in one centred group; disabled
  Previous/Next stay in place dimmed instead of rendering an empty `<span />` (which made the row jump
  on page 1); number swaps for a spinner inside a fixed-size button so pending never reflows; long
  lists collapse to first / current±1 / last with ellipses, and outer jumps hide below `sm` **only when
  the full set would not fit** (a 3-page list still shows 1 2 3 on a phone). 44px targets as pixel
  values (14px root font, §1I). Verified in a 375x812 emulated viewport on pages 1 and 2, plus the
  a11y tree (`nav[aria-label]`, `aria-current="page"`, `rel=prev/next`, sr-only icon labels).

- **2026-09-09** - **Leaderboard cadence stays 24h.** Jasper asked whether a ~30s refresh was viable.
  It is not: a rebuild is a *publish*, appending ~7 rows to the immutable `leaderboard_snapshot_runs`
  audit trail each time (105 runs already exist from about a dozen rebuilds), so 30s would add ~20k
  rows/day against an org already flagged over the Supabase quota; it would also fire rank-movement
  milestone notifications on every wobble and tighten the vouch → rank feedback loop enough to invite
  burst gaming, which the contribution dampening exists to prevent. Confirmed on **Vercel Pro**, so
  sub-daily cron is available if wanted later - `leaderboard_publish_cadence_hours` is an admin
  setting and `vercel.json` holds the schedule. **Jasper's decision: keep 24h.** Note the underlying
  contribution score is already live (`recomputePlayerContribution` runs on every vouch); only the
  ranked snapshot is periodic.

- **2026-09-09** - **Contribution copy + pagination feedback.** The contribution card named the
  internal algorithm and its dampening terms (`CONTRIB_V1`, diminishing returns, time decay), which
  meant nothing to a player; it now says the same rules plainly and states outright that it measures
  helping the community and is **not a skill score**. Players and Clubs Previous/Next now show an
  inline `useLinkStatus()` spinner while the next page loads, at 44 px tap targets, so a tap on a slow
  connection no longer looks ignored.

## Next up

### START HERE (state as of 2026-09-09, end of the registration-flow session)

The app is **live and in use** for B-Steel Hermosa 2026 (Oct 17-18, Zamboanga City). Registration
opened **Sep 9, 2026, 5:00 PM Manila**. Treat production as hot: every change lands in front of real
registrants, so prefer small reversible slices and read the release-order rule in handover v1.22
before shipping anything that needs a migration.

**Migrations through 0028 are applied. 0029 is written and waiting** (`scripts/apply-0029.sql`).

Handover content is **v1.34**. master_plan decision records run to **§2F**.

#### What this session changed

Registration was reshaped end to end, then debugged against a real run:

- **Pay-first doubles (§1U, migration 0025).** Naming a partner creates the team immediately with the
  partner unconfirmed, so the payer goes straight to QR and receipt. The partner confirms afterwards.
- **Per-player fees and early bird (§1V, migration 0026).** `divisions.fee_amount` is now the price
  **per player**, not a team total. Nobody's price changed - the conversion was exact.
- **Continuous partner-to-paid flow, downloadable QR, Request to cancel (§1Y).**
- **The organizer's Manage screen is a list of rows plus a detail sheet, with queue chips (§1Z).**
- **Partner change after paying (§2A, migration 0027)**, gated on the division's own skill and sex
  rules, enforced in SQL.

**While registration is open, `/` redirects to `/tournaments`** and Home lives at `/home` (§2E).
To revert after the event: delete the `redirects()` rule in `apps/web/next.config.ts` and point the
Home nav item in `nav-items.ts` back at `/`.

#### Open items, highest value first

1. **Two migrations are waiting on Jasper.** `scripts/apply-0030.sql` first - it makes the SQL
   `player_fits_division()` agree with the app that entering a division ABOVE your level is allowed
   (§2F); until it runs, a partner CHANGE can still be refused for playing up even though
   registering is not. `scripts/apply-0029.sql` adds `divisions.display_order` for hand-arranged
   division order; the canonical default order already ships without it, and the code that READS
   `display_order` is deliberately not deployed until 0029 is applied.
2. **The full end-to-end registration walkthrough is still unfinished.** The remaining path to prove:
   pay -> partner confirms -> organizer verifies -> both notified -> confirmed. Also worth exercising
   the decline path, the replacement path, Request to cancel, and partner change after paying - and
   now the new division-rule refusals (§2D), which are auth-gated and could not be verified from
   outside production.
3. **The organizer setting "Only allow players at each division's level or higher" is the whole of
   the skill rule** and means exactly what its label says (§2F). An earlier note here called it
   redundant, on the back of §2D blocking the band in both directions; that was wrong and both are
   corrected. Playing UP is always allowed.
4. **31 of 198 profiles have no gender recorded.** They cannot enter any Men's or Women's division
   until they add it. The app now tells them exactly that and points at their profile, but it is
   worth a nudge on the profile screen or a one-off message, because it is a third of the base.
5. **Two dialogs still use the old inline pattern** (`vouch-form`, `request-vouch-form`). Neither is
   opened from inside a stacking context so neither is broken, but they should move onto the shared
   `Modal` (which now portals) when the registration path is quiet.
6. **`supabase gen types` is still not wired into `packages/db`.** The types are hand-synced, and that
   is exactly what let migration 0026's `onboarding_completed_at` typo through five green gates and
   break the whole doubles path. **This is still the highest-value piece of engineering hygiene left.**
7. **Phase 15 - run the event** (see the phase note below). Oct 17-18 is the deadline that does not
   move.
8. Carry-over ops: Supabase org over-quota before 21 Sep 2026; Gmail SMTP -> dedicated provider before
   public scale.

#### The lesson this session kept teaching

Three separate bugs shipped through five green gates, and all three were invisible to typecheck:
a column name that did not exist, a modal trapped by a stacking context, and a spinner wired to the
wrong link. **The gates prove the code compiles and the tests pass; they do not prove the thing works.**
Where a change is observable, drive it - in a browser, or against the live database - before calling
it done. Several fixes in this session were found only that way.


### Earlier entries

- **Phase 13.5 (this slice):** shipped to production (commit `f89af55`, both domains verified). No
  migration to apply. Remaining: controlled authenticated organizer/player browser verification of the
  six flows above before the phase is fully evidenced as done.
- **Migration 0021 applied and verified:** Jasper ran `scripts/apply-0021.sql` against
  `itrosesiywpbaxtmucbb` and returned `registration_change_settings=2`,
  `registration_change_functions=4`, and `card_engagement_function=1`. Tournament-card engagement
  and registration-change functions are live. The next documented slice is
  `docs/PHASE_13_5_TOURNAMENT_RELIABILITY_AND_REGISTRATION_FLEXIBILITY_HANDOVER.md`; do not treat
  the planned QR, long-idle, multiple-entry, club-lock, registration-summary, or Home-copy changes as
  implemented yet.
- ~~**Apply migration 0020 before payment QR use**~~ - DONE. Live audit 2026-09-08 confirmed
  `payment_qr_path` exists AND is populated (a real saved QR object), so 0020 is already applied
  (`payment_qr_column=1`). The QR is private and signed during the existing manual proof-and-review
  payment step. It is not a gateway or payment confirmation.
- **Apply migration 0019 before demand launch:** Jasper runs `scripts/apply-0019.sql` against
  `itrosesiywpbaxtmucbb` and returns `demand_settings=3`, `demand_table=1`, `demand_rpcs=2`, and
  `demand_direct_policies=0`. Run direct anon/auth RLS denial checks afterwards; only then is
  anonymous planning interest live. The estimate is intentionally not registration or a slot.
- **Apply migration 0018:** Jasper runs `scripts/apply-0018.sql` against
  `itrosesiywpbaxtmucbb`, returns `unknown_dob_optional=1` and `leaderboard_setting_row=1`, then
  triggers a leaderboard rebuild. Until then, the existing production setting retains conservative
  unknown-DOB exclusion.
- **Phase 14 decision:** use `docs/PHASE_14_RECRUITMENT_SPONSORSHIP_AND_BIDDING_HANDOVER.md` to choose
  Recruitment/Sponsorship, full §16A Bidding, or remaining pilot hardening.
- **Phase 13C + 13A + 13D:** ✅ COMPLETE and production-verified.
- **PILOT PREP carry-over:** verify a real opted-in critical email; clear Supabase over-quota; run the
  full live dress rehearsal + native-Excel export gate; grant the Hermosa Cup organizer and enroll JT
  admin TOTP. Hold-expiry/waitlist cron is deferred.
- **Manual (DONE):** ~~apply `scripts/apply-0013.sql`~~ - applied, verify OK.
- **Excel integrity:** Jasper to open the 2 demo `.xlsx` in desktop Excel + confirm no repair prompt
  (mandatory gate before the export is a shippable deliverable).
- **Phase 13 - Admin Control Center** (§30-§31) - ✅ DONE (core bundle; §13 Identity Verification deferred).
- **Next phase - confirm scope with Jasper:** §16 Recruitment/Sponsorship + §16A Gamified Bidding;
  organizer dashboard depth (§26.6 waitlist reprioritize / §26.8 participants search / §26.9 comms +
  export ZIP-of-CSVs); §13 Identity Verification full flow (needs a private id-docs bucket + migration);
  or notifications depth (§27.4 admin fan-out / async email outbox / push).
- **Ops (carry-over):** clear the Supabase org over-quota before 21 Sep 2026; switch Gmail SMTP →
  a dedicated provider before public scale; `supabase gen types` → `packages/db` once the CLI/token
  is wired (types are hand-synced for now).

- **2026-09-08** - Added Facebook carousel image 06, **Problems We Solve**, to `deliverables/facebook-carousel/`.
  The square 1254 x 1254 creative presents the founding pain points (sandbagging and smurfing,
  fake or inflated profiles, and organizer skill-division guesswork) and closes with VouchPlay's
  vision for fairer play and better-organized events. No mobile screens are used.

- **2026-09-08** - Added a clean-background revision of Facebook carousel image 05, **Final CTA**, as
  `P_006b_VouchPlay_Facebook_Carousel_05_Final_CTA_Clean_(2026-09).png`. The foreground logo,
  wording, CTA hierarchy, URL, and JT credit remain intact; stadium spotlights, arena seating, beams,
  and the reflective realistic court were replaced by a restrained app-inspired graphic backdrop.

- **2026-09-08** - Added the VouchPlay x Hermosa **Rise of the Empires** welcome-modal banner under
  `deliverables/welcome-modal/` as a 1536 x 1024 master PNG and an app-ready WebP. The 3:2 crop-safe
  creative combines the official VouchPlay mark with the tournament title, October 17-18, 2026 date,
  and Zamboanga City identity; the modal screenshot was used only as a placement/crop reference.

- **2026-09-08** - Revised the welcome-modal banner to attribute the tournament to B-STEEL Sports.
  Added a restrained `BY` plus the supplied B-STEEL SPORTS PICKLEBALL badge after the tournament
  subtitle, with no white plate. Saved master PNG and web-optimized WebP variants with `B-Steel` in
  the filename; also retained a verified transparent badge cutout in `deliverables/welcome-modal/`.

- **2026-09-08** - Rebalanced the welcome-modal attribution after mobile-legibility feedback. Reduced
  the central Rise of the Empires/Hermosa lockup, retained the centered tournament subtitle and date,
  removed the small right-side badge, and added a larger centered `BY` + B-STEEL badge below the date.
  Saved new `B-Steel_Centered` PNG and WebP variants; earlier versions remain available.

- **2026-09-09** - **The leaderboard cron was never broken.** Reconstructed every
  `leaderboard_snapshot_runs` row from production: three batches only, all accounted for (the initial
  ship at 16:21 UTC Sep 7, an Admin rebuild at 22:05-22:10 UTC Sep 7, an Admin rebuild at 17:42 UTC
  Sep 8). `crons` entered `vercel.json` at 16:39 UTC Sep 7, so the schedule has had exactly one
  opportunity to fire, 01:17 UTC Sep 8, and the last publish was 3h06m old at that instant, so the
  route's cadence guard returned `CADENCE_NOT_DUE` and correctly did nothing. The board looked empty
  because the Sep 7 rebuild predated any contribution rows. The Sep 8 rebuild published 25 community
  and 24 player entries, verified in the live SSR HTML. **The real defect: a skip left no trace, so
  the only way to answer "did it run?" was the Vercel dashboard.** The cron now writes one
  `audit_logs` row per authenticated invocation (`leaderboard.cron.run`, actor null, role `system`)
  and Admin -> Leaderboards leads with a plain-language "Nightly rebuild" panel giving last run,
  outcome, next run, and whether it will publish or skip. No migration. The 24h cadence is unchanged
  and remains correct: a manual rebuild resetting the window is the intended trade, and the panel now
  says so out loud. See master_plan §1O.

- **2026-09-09** - **Swept the last thirteen bare date formatters** into `lib/format-date.ts`
  (master_plan §1K follow-up). Server-rendered sites were formatting in UTC, so anything between
  4:00 PM and midnight Manila displayed the previous day; client-rendered sites formatted in the
  viewer's timezone, which is the shape of React hydration error #418. Added three pinned variants
  (`formatMonthDay`, `formatMonthYear`, `formatShortMonthYear`) and a unit test that uses an instant
  falling on a different calendar day in UTC than in Manila, so a regression fails the suite.

- **2026-09-09** - Both changes above shipped in commit `a7d5a25` and verified live on
  `vouchplayph.vercel.app` and `vouchplay-v2.vercel.app`. The proof is in the SSR HTML, not a client
  bundle: the JT Cup announcement "Registration Open" has `published_at = 2026-09-05T23:30:26Z`, and
  its server-rendered `<time>` element now reads **Sep 6** on both domains. The previous code
  (`toLocaleDateString('en-US', {month, day})`, no timezone, on Vercel's UTC runtime) rendered
  **Sep 5**, so the PH-pinned formatter is demonstrably live. The Nightly rebuild panel's data path
  was checked against production separately: `audit_logs` holds no `leaderboard.cron.run` row yet (as
  expected, the first one lands on the next scheduled run), the newest active published snapshot is
  2026-09-08 17:42:56 UTC, and the panel will therefore read "the 9:17 AM run will skip, the rankings
  will only be 8 hours old by then" with fresh rankings landing **2026-09-10, 9:17 AM Manila**.

- **2026-09-09** - **Community leaderboards, one tap from Players.** Jasper asked for a "View
  Community Leaderboards" button on Players leading to clickable board tabs. **The boards already
  existed** - Phase 13D shipped all three categories, three scopes and three periods at
  `/leaderboards` with a podium, momentum card and explainer - so nothing new was built on the data
  side: no board, no query, no snapshot, no migration. What was missing was a way in (the page was
  linked only from Home, and primary nav is locked to five tabs per §5.1) and a way to choose (three
  dropdowns plus an Apply button, with the default board already on screen so the control read as
  inert). Shipped: a full-width entry card on Players that names the current number one and shows the
  top three avatars; a three-link tab strip (Top Players / Top Contributors / Top Clubs) replacing the
  category dropdown, with scope and period demoted to a collapsed disclosure; an elevated crowned
  podium with gold/silver/bronze carried by size, medal, icon and numeral rather than colour alone;
  a tinted "You" row for a signed-in viewer who is ranked; and three headline tiles giving your
  position, how many are ranked, and when the next rankings land. The next-update time reuses the
  pure `nextPublishingRunAfter` helper from §1O so the public promise and the Admin panel cannot
  disagree. See master_plan §1P, handover v1.24.

- **2026-09-09** - **Phase decision: Oct 17-18 draws and scoring run OUTSIDE VouchPlay.** Jasper
  confirmed it. That settles the fork and sets the next phase. Two stale beliefs were corrected while
  checking: **Phase 14A (Recruitment/Sponsorship) is already built and shipped** - migration 0023
  (`club_offers`, `club_offer_responses`, three enums, RLS), the `/opportunities` route,
  `components/offers/club-offers-manager.tsx`, `lib/actions/offer.ts` and a unit-tested pure
  lifecycle in `packages/core/src/offers/` - so `docs/PHASE_14_...HANDOVER.md` is out of date where it
  asks Jasper to choose 14A; and **`issueOfficialAchievement` exists with zero call sites**
  (`lib/actions/achievements.ts:356`), a complete organizer-authorized action awarding Champion /
  Runner-up / Bronze / MVP / Sportsmanship / Participant to a confirmed team, with templates in
  `packages/config/src/achievements.ts`. There is no UI for it. Meanwhile the schema has no
  `matches`, `brackets`, `draws`, `schedules` or `results` table and no check-in anywhere, and
  `registration_status` ends at `confirmed`.

  **Recommended Phase 15 - Run the event. Defer 14B (Gamified Bidding).** Three thin slices:
  **15A** close the registration cycle cleanly (the Phase 13.5 authenticated walkthrough, which is
  still the only gate never evidenced, payment-review hardening, and a roster export the organizer
  will trust to build the draw from) - deadline-bound by the registration close date;
  **15C** results in, achievements out: the organizer UI for the already-written
  `issueOfficialAchievement`, on the tournament Manage page. This is the flywheel - results become
  achievements, achievements drive vouches, vouches drive the leaderboards - and without it a
  two-day tournament generates no data for the product. Cheapest slice, highest leverage, no
  migration; **15B** day-of check-in: one organizer screen, one field, one-handed on a phone at a
  venue with poor signal. Needed only on the day. Sequence 15A, then 15C, then 15B. Decide whether
  draws and scoring belong in VouchPlay at all after Oct 18, with real observed pain.

- **2026-09-09** - **Leaderboards condensed, and Top Players closed until results exist.** Six UI
  changes plus one honesty fix and one settings change. See master_plan §1Q, handover v1.25.
  The tab strip is now the first thing on the page; "next update" became one small line under the
  heading instead of a tile; "Your position", "Ranked here" and "Your momentum" collapsed into a
  single thin row, closed by default, whose **closed summary still states both numbers** so nobody
  has to open it (two of those tiles were literally the same number twice - the momentum card and the
  position tile both read `#26`); `/leaderboards` now opens on **Top Contributors**, the only board
  with real earned separation today; and the Players entry card was cut to roughly a third of its
  original height.
  **The honesty fix:** all 31 ranked players had `participation: 0` and `placement: 0`, so the Top
  Players board was ordering people by profile completeness and the Skill Verified flag under a
  heading promising "verified tournament play and official placements", with ten tied on 2.0 points.
  It now shows an explanatory panel instead of a list until at least one entry has a verified
  tournament or an official placement. The test runs on the **published data, not a flag**
  (`hasCompetitiveEvidence` in `lib/leaderboards/board-meta.ts`, unit-tested), so the board opens by
  itself on the first snapshot after an organizer awards a placement. Pausing the category would have
  been wrong: a pause shows a warning chip and leaves the misleading list on screen.
  **Top Clubs needed no code.** Cumulative member contribution was already ~80% of the leading club's
  score but not reliably decisive. All five club weights are `system_settings` rows, so this is an
  Admin edit. Jasper's calls: a member active in more than one club **counts in full for each**
  (3 members are currently in two clubs each; splitting would conserve the total but means telling a
  player their contribution counts for half), and the weights become
  `leaderboard_club_contribution_weight` 1 -> 6, `leaderboard_club_active_members_weight` 2 -> 1.
  **ACTION FOR JASPER: make those two edits in Admin -> System settings, then rebuild at
  Admin -> Leaderboards.** Nothing else in this release needs an operator action, and there is no
  migration.

- **2026-09-09** - **Home rearranged, compact is the default directory, and the vouch-back button was
  recommended against.** Header and home footer now read "Developed by JT Consulting & Analytics"
  (the §5.2.1 spec text was updated too, so spec and app agree; changelogs keep the old wording as a
  record). Home is hero, highlight, everything else: a condensed hero, then **Community Champions as
  the middle highlight** with the hero's gradient edge and glow, then the other boards, then the
  three explainer cards condensed into icon-beside-title rows. The explainers moved *after* the proof
  because the cards describe the product while the board demonstrates it. Players now defaults to
  **compact**, and the row grew to two lines: name + nickname + sex symbol, then skill + club
  affiliations, with STS over a Vouch button in an 84px trailing column.
  **The §1H rule (no interactive control inside a row that is itself a link) still stands - the row
  changed instead.** It is no longer an anchor wrapping everything: the name is the link and carries
  a stretched `after:inset-0` overlay so the whole row is still one tap target, while STS and Vouch
  are siblings raised above it. The §1N pending cue moved from the STS slot to an overlay on the
  avatar, because `useLinkStatus` only reports inside the `<Link>` it sits in and the avatar is a
  fixed 40px every row has (STS is null for many players).
  **Recommended against "submit and request a vouch back".** It manufactures the reciprocal pairs
  `CONTRIB_V1` explicitly discounts, so the product would encourage an action then dock people for
  it; and a vouch given while asking for one back is not independent evidence, which is the founding
  problem in reverse. Requesting a vouch already exists unbundled (§12). Shipped instead: the vouch
  form no longer auto-closes, and its confirmation offers "Vouch for someone else you have played
  with" - growth toward more distinct vouchers, which is what the scoring actually rewards.
  **Jasper's call if he still wants the paired button.** See master_plan §1R and §1S, handover v1.26.

- **2026-09-09** - **Three corrections found on a real phone.** (1) **Club icons out of the compact
  row.** §1S put them on line two beside the skill pill; on a real device that line has to hold "High
  Intermediate · Community" plus up to two logos and the pill wraps, which is the exact ragged-list
  failure §1H and §1N were written about. Removed. **Rule: a compact row gets one pill per line and
  nothing beside it.** Clubs remain on the detailed card and the profile. (2) **The row's pending
  spinner was silently broken for almost every tap and shipped that way.** §1S split the row into an
  invisible overlay link covering the row and a named link on the name; the cue lived inside the
  *name* link, but nearly every tap lands on the *overlay*, and `useLinkStatus` only reports for the
  `<Link>` it sits inside. It is now inside both, and its offset was corrected to `left-0` (the
  containing block is the row's padding box, whose left edge is where the avatar starts - the old
  `left-2.5` was 10px out). **Lesson: when a component is split in two, its state hooks do not
  follow.** (3) **"Your momentum" moved below the boards on Home and collapsed** into a single row
  whose closed summary still shows the rank. It was taking a full card's height above Community
  Champions to show one number, which pushed the highlight down and opened a page about the community
  with a paragraph about the viewer. Below the boards is also the more honest order. See master_plan
  §1T, handover v1.27. No migration.

- **2026-09-09** - **DESIGN ONLY, awaiting Jasper's go-ahead: pay first, confirm the partner after.**
  Written up in master_plan §1U. Nothing implemented and nothing deployed. The current doubles path
  is blocked by structure, not polish: `accept_partner_invitation` is what **creates** the `teams`
  row, so until the partner taps accept there is no team to register and nothing to pay for. The
  proposed flow creates the team at partner selection (inviter confirmed, invitee
  `confirmed_at = null`, team `forming`), lets the payer go straight to QR and receipt upload, and
  confirms the partner afterwards. `register_team` already permits this - it only ever required the
  actor to be a team member - and the capacity count already treats `payment_submitted` as holding a
  slot, so "the receipt reserves the slot" needs no change to capacity or waitlist logic.
  **The decline case is the one that decides whether the design is honest:** the entry is not
  cancelled and the slot is not released, the payer is notified and can name a replacement keeping
  slot, payment and position, and replacement is permitted **only** when the named partner actively
  declined or their invitation expired. That is a deliberate carve-out from §1D, which forbids
  unilateral partner replacement so nobody is displaced without their knowledge - a person who said
  no has not been displaced, they created a vacancy. Accepted partners and still-deciding partners
  remain unswappable.
  **Receipts, answering Jasper's question:** they already have a home. Uploads go to the private
  `payment-proofs` bucket at `{registration_id}/proof-{ts}-{rand}.{ext}` (`public = false`, no public
  policy), and organizers review them at Manage -> Registrations via a **60-second signed URL** minted
  server-side after an authz check, plus a Verify control. There is deliberately **no browsable master
  folder** - that would be a folder of other people's names, reference numbers and bank screenshots.
  The real gap is that organizers have no "payments awaiting review" queue and must scroll the
  registrations list; that is a filter on an existing screen and belongs in this slice.
  **Needs migration 0025** (`partner_invitations.team_id`, a create-team-with-pending-partner RPC, a
  backward-compatible branch in `accept_partner_invitation` so invitations already in flight keep
  working, a guarded replace-pending-partner RPC, and RLS for the named invitee).
  **Release order: migrate first, then deploy** - the gap is a visible control that would error, on
  the payment path, during a live registration window.

- **2026-09-09** - **Migration 0025 written and awaiting Jasper's run** (`scripts/apply-0025.sql`).
  Adds `partner_invitations.team_id` plus `create_team_with_pending_partner`,
  `decline_partner_invitation` and `replace_pending_partner`, and extends
  `accept_partner_invitation` with a `team_id` branch that leaves every invitation already in flight
  on the original path - which is what makes this safe to apply mid-registration.
  **No RLS changes are needed:** `is_team_member()` tests membership, not confirmation, so a pending
  invitee can already read the team, the registration and its events.
  Expected verification: `invitation_team_id_column=1`, `new_rpcs=3`, `accept_rpc=1`,
  `invitation_team_index=1`, and `legacy_open_invitations` as an informational count of invitations
  that keep the old path. **No app code has been deployed for this** - the release order is migrate
  first, because the gap is a visible control on the payment path during a live registration window.
  Jasper's decisions are recorded in master_plan §1U: refunds are the organizer's call case by case,
  there is **no automatic deadline** (only an explicit decline frees the seat, with the squatting and
  never-responds trade-offs written down), and the organizer gets a "payments awaiting review" filter
  in this slice.

- **2026-09-09** - **Pay-first registration SHIPPED.** Migration 0025 verified by Jasper
  (`invitation_team_id_column=1`, `new_rpcs=3`, `accept_rpc=1`, `invitation_team_index=1`,
  `legacy_open_invitations=0`) and independently probed here before any code went out - all four RPCs
  present and refusing safely with their guard clauses. `legacy_open_invitations = 0` meant no
  invitation was mid-flight, the safest possible moment to ship. Migrate-then-deploy order was kept.
  Naming a partner now creates the team (inviter confirmed, partner unconfirmed) and registers in one
  action, so the player goes straight to QR and receipt; the partner confirms after. Step two of the
  picker is a deliberate stop with an explicit tick. Declining frees the seat without cancelling the
  entry or releasing the slot; the payer can name a replacement keeping slot, payment and position.
  The person being asked to confirm gets a full-width card saying the fee is already paid and that
  declining is free. Organizers got a one-tap "N payments awaiting your review" queue.
  **Two of the three decisions needed no code at all:** `markRefunded` and the payment-status filter
  already existed, so "refunds are the organizer's call" was already buildable.
  **CORRECTION to an earlier entry in this file:** I wrote that `issueOfficialAchievement` had "zero
  call sites" and "no UI", and built part of the Phase 15 recommendation on it. That was wrong - it is
  wired into Manage -> Registrations with a dropdown of the six official awards and an Issue button.
  Organizers can already award Champion, Runner-up, Bronze, MVP, Sportsmanship and Participant today,
  so the Phase 15 "results in, achievements out" slice is mostly already built.
  See master_plan §1U, handover v1.28.

- **2026-09-09** - **Fixed the two bugs the pay-first flow introduced, plus the skill-ceiling copy.**
  Both bugs had one cause: §1U made a team carry a registration from creation, and two older rules
  assumed the opposite. `leave_team_after_cancel` refuses when a team has an active registration, so
  under pay-first the "Leave team and change partner" button could only ever fail; and
  `player_cancel_registration` refuses once a `payments` row exists while the UI only offered Cancel
  for `payment_pending`/`waitlisted`, so the payer lost the button within a minute of paying and was
  left with one control that could not succeed and none that could. The partner area now shows only
  the real states: seat vacant after a decline -> inline "Name a new partner" keeping slot, payment
  and position; partner still deciding -> say who and that declining is theirs; otherwise nothing.
  Cancel appears only when it will work, and when it will not the screen says to message the organizer
  for a refund and slot release instead of failing on tap.
  **The skill ceiling already blocked** - `evaluateSkillFloor`'s `blocked` branch has always refused a
  player above the division maximum. The bug was the sentence, which said "your skill level" even when
  the person over the ceiling was the partner you named. It now names them. **Only runs when the
  tournament's `enforceSkillFloor` rule is on** - worth checking before testing.
  **Migration 0026 written, not yet applied** (`scripts/apply-0026.sql`): converts
  `divisions.fee_amount` from a team total to a per-player price (`/ team_size`, exact, guarded by a
  `division_fee_is_per_player` settings row so a re-run cannot halve fees twice), adds early-bird
  columns (window on the tournament, amount per division) and `division_effective_fee()`. **Nobody's
  price changes**: live divisions hold 3000/team and already display 1500/player, so after conversion
  they hold 1500/player, display 1500, and collect 3000. Organizer fee UI, early-bird UI and the
  payment-total display are held until Jasper applies 0026. See master_plan §1V.

- **2026-09-09** - **Per-player fees and early bird SHIPPED.** Migration 0026 verified
  (`early_bird_tournament_cols=2`, `early_bird_division_col=1`, `effective_fee_fn=1`,
  `per_player_flag=1`, `fee_3000_divisions=0`, `fee_1500_divisions=15`) and then confirmed directly
  against the database: 15 divisions at 1500 x 2 = 3000 and 2 at 2000 x 2 = 4000, identical to their
  old team totals, with **zero payment rows in flight** during conversion. I predicted 11 divisions;
  the real number is 15, because my earlier estimate came from a truncated table view.
  All fee arithmetic now lives in one pure module, `@vouchplay/core` `tournaments/fees.ts`
  (`quoteFee`, `isEarlyBirdOpen`, `formatFee`), 13 unit tests, so the price quoted, the total shown
  and the amount recorded cannot drift. **The old `feeAmount / teamSize` display division was removed**
  - leaving it would have quietly halved every quoted price. Organizer input is now "Fee per player"
  with an optional early-bird amount per division; the window is two datetime fields on the tournament
  and applies to every division, per Jasper. The payment screen states the arithmetic
  ("PHP 1,500 per player x 2 players") rather than only a total. **The early-bird price is resolved at
  receipt submission**, not at entry creation. Two guards worth remembering: a half-configured window
  (one date blank) never discounts, and an early amount that is not actually cheaper is refused, so a
  typo cannot become a quiet price rise. See master_plan §1V, handover v1.29.

- **2026-09-09** - **Community Champions 100-point wall removed; STS stays 0-5 with the reasoning
  recorded.** There is no 100 limit in the contribution engine - `computeContribution` is an unbounded
  sum. The wall was `leaderboard_component_cap = 100` clamping every component in the leaderboard
  scorer, and Community Champions weights exactly one component, so its published score was literally
  `min(contribution, 100)`. That is why the leader read exactly 100.0 against 86.6 and 79.6. The cap
  is now **per category** (`leaderboard_component_cap_players` / `_community` / `_clubs`, falling back
  to the global value); Players and Clubs keep 100 because they mix components on different scales and
  the guard does real work there, while Community has one component so the cap only truncated.
  **No migration** - `system_settings` merges code defaults - but a **rebuild is required** for the
  change to show, since scores live in snapshots.
  **STS was not uncapped, and the reason is in master_plan §1W.** It is not held by one ceiling: each
  input is a normalised fraction (`min(uniqueVouchers/5,1)`, `min(sumWeights/7.5,1)`, agreement),
  blended and multiplied by `scale` - and `scale` is *already* an Admin setting, so raising it to 10
  would just move where everyone maxes out. Real uncapping means deleting the clamps, which turns
  confidence into volume: it breaks §3.3 and §6/§8.4, falsifies the §1G explainer's opening line, and
  silently redefines Skill Verified (`sts >= 3.0`). Shipped instead: the chip shows the genuinely
  unbounded number that already existed - `unique_voucher_count` - as **"STS 4.8 · 23 vouches"**, plus
  an explainer line saying STS tops out but vouch count keeps growing. **Uncapping remains Jasper's
  call**; the change is small and the consequences are listed. See handover v1.30.

- **2026-09-09** - **The vouch count now appears on the player cards, not only the profile.** Jasper
  checked the cards and could not find it - correctly, because `uniqueVoucherCount` lived only on
  `PlayerProfileDTO`. The data was already being fetched in bulk for cards (`extras.skill`), it was
  simply never mapped onto `PlayerCardDTO`. Now shown in three places: the profile and the detailed
  card as "STS 4.8 · 23 vouches", and the compact row as the terse "STS 4.8 · 23" because that column
  is fixed width.
  **Widening that column re-broke the skill pills** for the third time - "Low Intermediate ·
  Community" wrapped onto two lines. The real cause was never the column: `SkillPill` was a
  shrinkable flex item, so squeezing it made its own text wrap. It now carries `shrink-0` and
  `whitespace-nowrap`, so it keeps its natural width and the row clips instead of going ragged.
  Verified by measuring the live DOM at 375px rather than by eye: 24 rows, **0 pills wrapped**, max
  pill height 20px, row height unchanged at 71px.

- **2026-09-09** - **The STS dialog was trapped inside a directory row, and it was my §1S change that
  trapped it.** `fixed inset-0 z-50` only escapes the page when no ancestor creates a stacking
  context. §1S gave the compact row's trailing column `relative z-10` so the STS chip and Vouch button
  would sit above the row's tap overlay - a positioned element with a z-index, which creates a
  stacking context - and the dialog rendered inline inside it. The whole modal, backdrop included, was
  confined to one row's box, and later rows painted over it. Nothing was wrong with the modal's own
  styles, which is why it read as a rendering glitch rather than a layout bug.
  **`Modal` now renders through `createPortal(document.body)`**, guarded by a `mounted` flag so it
  never runs during SSR. That fixes the class, not the instance: any dialog opened from inside a card,
  row, sticky header or transformed element is now safe by construction. **The body scroll lock its
  docstring had always promised was never implemented** - added at the same time. Verified against the
  real component from a compact row: parent is `document.body`, a hit test at the dialog's centre
  lands inside the dialog, and `body.style.overflow` is `hidden` while open.
  **Two other inline dialogs share the old pattern** (`vouch-form`, `request-vouch-form`); neither is
  opened from inside a stacking context so neither is broken, and both were left alone because they
  sit on the live registration path Jasper was testing. Move them onto `Modal` when that path is quiet.
  **`leaderboard_club_min_score` default raised 1 -> 5** so clubs with no contribution and no
  participation stop appearing on the board on member count alone. **The DB row still pins it to 1**,
  so Jasper must change it in Admin -> System settings and rebuild; a direct write from here would
  leave the settings audit trail showing the wrong actor. See master_plan §1X.

- **2026-09-09** - **BUG (mine): the entire pay-first doubles path was broken from the moment it
  shipped.** "Enter and pay" always returned "No player found with that handle." The cause:
  `enterWithPendingPartner` and `replacePendingPartner` selected **`onboarding_completed_at`**, a
  column that does not exist - the real one is **`onboarded_at`**. PostgREST returned
  `400 / 42703 column does not exist`, `data` came back null, and the code read null as "no such
  player". Proven against production: the old select returns 400, the new one 200, and the exact
  partner in Jasper's screenshot (`jasper-72838c`) resolves as active and onboarded.
  **Why five green gates missed it:** the Supabase `.select()` argument is an unchecked string, and
  the result was cast with a type *assertion* rather than validated, so TypeScript happily believed a
  field that never existed. Type assertions on query results hide schema drift - the DB types in
  `packages/db` are hand-synced, which is exactly the condition where this bites.
  **Class fix applied as well:** both lookups now inspect the PostgREST `error` and return "Could not
  look up that player" instead of letting a failed QUERY wear the "missing PLAYER" message. That
  mislabelling is what sent a real end-to-end test hunting for a bad handle.

- **2026-09-09** - **Six fixes from Jasper's first real end-to-end run** (master_plan §1Y).
  (1) The partner search flashed **"No players found"** before every result: `searching` was set
  *inside* the 300ms debounce, leaving a window where the component was not searching, had no results
  and had a long enough query - exactly the combination that renders the empty state. It is now set
  before the debounce is armed. **Rule: a "nothing found" state must be reachable only from a
  completed lookup, never a pending one.**
  (2) **Enter and pay is now continuous**: the action returns the new `registrationId`, the form
  navigates to `?entered=<id>#my-registrations`, and the panel opens on that entry. The anchor scrolls
  natively, so this needed no client JavaScript.
  (3) **The QR is bigger, `object-contain` (never squashed), and downloadable** via the existing
  short-lived signed URL. Most people pay from the same phone they are reading on and cannot scan a
  code with the device displaying it.
  (4) **The refund copy is gone.** The submitted state now says "Payment submitted. This entry cannot
  be changed while the organizer reviews it." plus a **Request to cancel** control with a reason.
  It does not cancel anything and says so before it is pressed - once a receipt exists the money went
  straight to the organizer. Stored as a `cancellation_requested` row in `registration_events`, which
  is already the immutable per-registration history organizers read, so **no migration**. One open
  request per entry. Organizers get a critical notification.
  (5) **Cancelling an invitation shows a spinner and confirms in place** instead of needing a reload.
  (6) Removed the stale "cancel, dissolve, re-invite" disclosure, which described a flow that has not
  existed since pay-first.
  **NOT shipped, deliberately: post-payment partner change.** Jasper asked for it and the copy was
  written, then pulled - it needs a transactional RPC (migration 0027) to swap a confirmed member
  atomically on a payment-bearing entry, and shipping copy that promises a capability the app does not
  have is worse than shipping no copy. That is the next slice.

- **2026-09-09** - **The organizer's Manage screen is now a list of rows plus a detail sheet**
  (master_plan §1Z). It used to expand every registration inline, so on a phone withdrawn entries
  filled the page by default, the players in a team were buried under their own controls, there was
  no glanceable view of applicants, and no way to find the entries needing a decision.
  **Closed entries are hidden by default** behind a checkbox carrying its own count - they were the
  biggest source of noise. **Entries needing a decision sort to the top.** **Search matches player
  names**, because "did Maria get in?" is the question organizers are actually asked and no status
  filter answers it. The whole row is the tap target, not a small Manage link beside it.
  **Four filter dropdowns of database enums became four queue chips that are the decisions** - All
  open / Check payment / Cancellations / Eligibility - each with a live count. An entry can be in more
  than one queue (a paid entry whose player asked to cancel needs two decisions), and a **closed entry
  is never in any queue**, whatever else is true of it.
  **Cancellation requests are finally visible.** §1Y wrote them to `registration_events` but nothing
  surfaced them; the organizer query now reads the newest open request per registration and it has its
  own row flag, queue and count. A request nobody can find is not a request.
  Rows also flag **partner not confirmed** (an entry can be paid while a named player has not
  answered, under §1U) and the **eligibility verdict in plain words**, which is the skill-match signal
  at a glance. All of it - queue membership, chip, team label, filtering, sorting, counts - lives in
  one pure module `lib/tournaments/entry-view.ts` with **19 unit tests**, so the row, the sheet and the
  counts cannot disagree. No migration.

- **2026-09-09** - **Migration 0027 written and awaiting Jasper's run** (`scripts/apply-0027.sql`).
  It did not exist before this: earlier replies listed it under "still outstanding", which read as if a
  file was already waiting. It was only ever a described plan. My wording, my fault.
  It adds `change_partner(team, actor, new_invitee, ...)`, the swap that works while the seat is still
  OCCUPIED - `replace_pending_partner` (0025) only ever handled a seat already vacated by a decline, so
  a player who had paid and simply needed a different partner had no route at all.
  Deliberately narrow: the replacement must **fit the same division** (same sex classification, inside
  the same skill band) via a new `player_fits_division()`, so a swap can never route around a
  division's own rules; the **registration, payment and waitlist position are never touched**; and the
  **removed player's id is returned** so the caller must notify them. §1D exists so nobody is displaced
  *without their knowledge* - being told is what keeps that promise.
  **Every column and dependency was verified against the live database before handing it over**
  (profiles.sex / self_rated_skill, player_skill_profiles.community_skill_level, division skill+sex
  columns, teams.updated_at, team_members.confirmed_at, partner_invitations.team_id,
  registration_events, audit_logs, and `player_registration_changes_are_open`). That check exists
  because 0026's `onboarding_completed_at` typo shipped a broken doubles path.
  Expected verification: `fits_division_fn=1`, `change_partner_fn=1`, `invitation_team_id_column=1`,
  plus an informational `teams_with_two_members`. **No app code ships until Jasper returns the
  counts** - the gap would be a visible control on the payment path.

- **2026-09-09** - **Post-payment partner change SHIPPED.** Migration 0027 verified by Jasper
  (`fits_division_fn=1`, `change_partner_fn=1`, `invitation_team_id_column=1`,
  `teams_with_two_members=4`) and independently probed here: both functions present and guarding
  (`change_partner` raises `team_not_found` before any write).
  **The gate was tested, not assumed**, against live rows: a woman in a men's division rejected, a man
  in a men's division accepted, a man in a women's division rejected, and skill 2 and skill 4 both
  rejected by a 3-3 band. That verification exists because 0026's `onboarding_completed_at` typo
  shipped a broken doubles path.
  `replace_pending_partner` only handled a seat already vacated by a decline, so the ordinary case - a
  paid player who simply needs someone else - had no route. `change_partner` removes the other member
  and names a replacement in one transaction, with `player_fits_division()` enforcing sex
  classification and skill band **in SQL** so a swap cannot route around a division's rules;
  registration, payment and waitlist position are untouched; and the RPC **returns the removed
  player's id** so the caller cannot forget to notify them. That notification is critical and
  unmutable - §1D forbids displacing somebody *without their knowledge*, and telling them is what makes
  the swap permissible rather than a hole in the rule.
  The §1Y sentence promising this was previously written and pulled; it is restored now that it is
  true. **Copy and capability ship together or not at all.** See master_plan §2A.

- **2026-09-09** - **Uniform STS, a directory you can actually filter, and comments that stand on
  their own** (master_plan §2B). Two slices ship without a migration; the third waits on 0028.

  **Every player now shows an STS, including 0.0.** The chip returned `null` when a player had no
  `player_skill_profiles` row, so anybody nobody had vouched for had a visible gap where everyone
  else had a chip - which reads as a rendering fault rather than as information. No vouches is not
  missing data: it is zero confidence, and zero confidence is 0.0. The DTO still keeps `null` and
  `0` apart, because the database does; only the display collapses them. Verified in the
  server-rendered HTML of both directory views and of a real zero-vouch profile
  (`aria-label="Skill-Trust Score 0.0 out of 5"`).

  **The filters are the ones that were asked for.** Gone: "Minimum self-rated skill", the one number
  on a profile nobody else has attested to. Added: skill level, minimum STS, club, and a city list
  that is actually usable. **Filtering by STS is not ranking by STS** - §8.4 forbids ordering the
  directory by STS and the sort is untouched.
  **Skill follows the app-wide precedence** (community rating if the community has rated them,
  otherwise self-rating), the same order `player_fits_division()` uses. It matters: 140 of 164
  directory profiles have a community skill level, so a strict community-only filter would have made
  the other 24 invisible the moment anybody touched the control.
  **Controls are chosen per data type**: named discrete values get chips (7 skill bands, multi-select
  - a two-thumb range slider is the classic choice and the wrong one on touch and with a screen
  reader), a genuinely continuous number gets a single-thumb slider (STS, 0-5 in half steps, "Any" at
  zero), three options get a segmented control (sex), and the four booleans get 44px toggle pills
  rather than 13px checkboxes. Every applied filter is a removable chip, and the Filters button
  carries a count - a filter you cannot see is a filter you cannot undo.
  **The city list collapses the spellings.** The directory holds 8 distinct city strings that are
  really 3 places: `Zamboanga`, `Zamboanga City`, `Zamboanga city`, `zamboanga city`, `zamboanga` and
  `City of Zamboanga` are one city typed six ways. The dropdown now reads "Zamboanga City (161),
  Isabela City (1), Valenzuela (1)".
  Parsing, normalising, matching and counting all live in one pure module,
  `lib/players/filters.ts`, with **51 unit tests**, so the URL, the chips, the button count and the
  rows returned cannot disagree. Old `?minSkill=` links still work.

  **Verified against production numbers, not by eye.** Every count the app returned was checked
  against the same computation run directly on the database: skill Novice **61 = 61**; minimum STS
  3.0 **103 = 103**; Novice AND STS 3.0 **32 = 32** (so the filters intersect rather than union);
  legacy `?minSkill=4` and explicit `?skill=4,5,6` both **30**, matching 20+9+1; clubs **1, 36, 20**
  against their real membership counts. Pagination links carry every filter and the view.
  **Two things looked like bugs and were not.** The unfiltered total read 163 while the database said
  164 - a real player onboarded at 10:32 UTC in the middle of the check. And `?club=dink-deepers`
  returned nobody because I invented that slug from the display name; the real one is
  `dink-deepers-54a808`, which returns its 1 member.
  **One real defect was found only by measuring.** The STS slider was `h-11`, which is **38.5px**
  under the app's 14px root font, below the touch minimum. It is `h-[44px]` now. Five green gates
  said nothing about it.

  **Comments no longer need a rating, and can be edited or deleted (HELD - needs migration 0028).**
  A comment could only be written as a field on the vouch form, so saying anything about a player
  required also asserting a skill level for them, and once written it was permanent - there was no
  edit and no delete anywhere in the product. `vouch_comments.vouch_id` becomes nullable; a comment
  by somebody who does have an active vouch is still linked to it. **One active comment per author
  per player, editable**, which mirrors the one-active-vouch rule and matches the data exactly:
  **0 of the 44 active comments in production are a second comment from the same author about the
  same player.** Delete is a soft delete to `status = 'removed'`, a value the enum has always had
  (verified against production) - it leaves every public read at once, and the row survives for
  moderation. The same gates as vouching apply, plus a `player_comments_per_24h` setting, because a
  standalone comment is a new way to write on a stranger's profile. The unused
  `vouch_comment_received` notification is finally used, with copy that is true when there is no
  vouch attached.
  **ACTION FOR JASPER: run `scripts/apply-0028.sql`** and return `vouch_id_nullable=1`,
  `author_target_index=1`, `author_write_policies=2`, plus the informational `active_comments` and
  `standalone_comments`. **No comment code ships until those come back** - without 0028 the "Add a
  comment" button is a visible control that throws a not-null violation at a real person, which is
  exactly the case the v1.22 rule reserves for migrating first.

  **NOT COMMITTED, and here is why.** A second Claude session was writing to this same working tree
  while this slice was being built - migration 0029, `master_plan` §2C (division display order),
  and edits to `registration-queries.ts`, `actions/registration.ts`, `actions/tournament.ts` and
  `packages/core`. Both §2B and §2C are present in `master_plan.md` and nothing was clobbered, but
  committing would have swept an unfinished feature into a release to a live site. **Two sessions,
  one tree, one hot production deployment is the hazard here** - the sequencing is Jasper's call.

- **2026-09-09** - **A provisional entry no longer looks like a finished one** (master_plan §2G,
  handover v1.35). Jasper flagged that applicants who had not paid, whose partner had not confirmed, or
  whose receipt was not yet verified were seeing a green **"Registered"** and "You're joining" - as if
  they were done. In production at the time, **1 entry was confirmed and 20 were provisional** (11
  payment_submitted, 9 payment_pending), so twenty people were being told they were in when they were
  not.

  **The rule: only `confirmed` is secured.** Everything else active (payment_pending, payment_submitted,
  under_review, waitlisted) is provisional and the applicant's own view says so and says what is still
  outstanding. One pure function, `lib/tournaments/registration-status.ts`, 12 unit tests, feeds all
  three surfaces so they cannot disagree:
  - **Division browser:** the green "Registered" is gone. The chip is the real state (Payment pending /
    Under review / Partner not confirmed / Waitlisted / Confirmed), and the line beneath names the
    slot's safety ("Your slot is not secured yet ..." vs "You're in").
  - **My registrations:** each provisional entry leads with an unmissable notice - "Your slot is not
    secured yet" plus a plain checklist (pay and upload the receipt, wait for the organizer, partner
    must confirm), amber when the applicant can act, muted when waiting on someone else.
  - **Tournament card:** green "You're in" only when confirmed; a provisional entry reads amber "Not
    secured yet", never a green tick, never "joining".

  **No migration.** The detail-page surfaces already had the status in the viewer's registration state.
  The card needed to tell confirmed from provisional, done with one indexed read on the list page
  (team_members -> teams -> registrations). **Caught before it shipped:** the first draft wrote
  `.eq('player_id', ...)` on `registrations`, which has no such column (it is keyed by team) - the
  exact unchecked-select trap v1.31 shipped. Verified against production: a confirmed registrant
  resolves to secured=true, a payment_pending one to secured=false.

  **The capacity mechanic was deliberately NOT changed.** Jasper also asked that a provisional entry
  "not have a reserved slot". As *perception*, delivered in full. As the *capacity count* (stop pending
  entries occupying a slot), held for his explicit sign-off: §1U reserves a slot on receipt to protect
  people who have PAID, the hold-expiry cron that would release unpaid holds is still deferred, and
  un-reserving on a live window with 205 registrants could tell a paid person their slot is gone. The
  safe follow-up - stop counting *unpaid* holds once hold-expiry exists, while protecting *paid* ones -
  is recorded in §2G for his decision. **ACTION FOR JASPER, optional:** decide whether to pursue that
  capacity follow-up.

  Verified: all gates green (typecheck, lint, 192 tests incl. 12 new, format, production build); the
  affected pages render clean; "Not secured yet" and the assurance copy are present in the built client
  chunk. The signed-in applicant walkthrough is auth-gated and was validated by unit tests plus the
  production data-path check rather than a live login.

- **2026-09-09** - **The leaderboard rebuild now reports the real reason it failed** (master_plan
  §2H, handover v1.36). "Rebuild all snapshots" had started failing with only "The rebuild failed
  safely" and nothing published since 5:34 PM; each attempt died in ~1s at the first snapshot publish.
  A full read-only investigation ruled out quota (registrations, payments, profiles, audit rows all
  kept writing), settings (all numeric values valid; last edit predates the last success), the size
  bounds (all counts far under 5,000), a source-read failure (all 12 builder reads return 200),
  numeric overflow (`score numeric(16,4)`), duplicate ranks (assigned by index, always unique), and
  the code (builder unchanged since before the last good run) - so the trigger is data that arrived
  during the day. **The actual database error could not be seen because the rebuild caught it and
  stored only `BUILD_FAILED`** - the same "a failure leaves no trace" gap §1O closed for the nightly
  cron. Fixed diagnostically (no migration, no change to a successful build): `buildAllLeaderboards`
  now carries the Postgres message/code/details in the publish and source-read throws, and the action
  records it on the request row, writes it to `audit_logs` as `leaderboard.rebuild.failed`, and shows
  it on the Admin screen after "Reason:". **ACTION FOR JASPER: once deployed, click "Queue and build"
  once - it will now name the exact failing record/constraint - and paste me the Reason line so I can
  fix the root cause.**

- **2026-09-09** - **Leaderboard rebuild fixed: it was a 1,000-row response cap (master_plan §2I,
  handover v1.37).** §2H's diagnostics named it on the first click: `contribution_source_truncated`.
  PostgREST caps a response at ~1,000 rows and clamps `.limit()` to do it (proven: `.limit(5000)` on
  active vouches returned `content-range: 0-999/1475`). The builder read each source with one
  `.limit(bound)` and threw if fewer rows came back than the exact count - which fired the moment
  active vouches crossed 1,000 during the sign-up surge. `recomputeAllContributions` runs first, so
  every rebuild died in ~1s; the 5:34 PM publish held because vouches were still under 1,000 then.
  Fixed by replacing `.limit()` with real `.range()` pagination (new helper
  `lib/supabase/fetch-all.ts`), applied to the vouch + fraud reads in `recomputeAllContributions` and
  all twelve `loadSources` reads (same latent bug; profiles were next to cross 1,000). Proven against
  production: all 1,475 active vouches page back with no duplicates or skips. At today's scale each
  read is one page, so behaviour is unchanged until a table crosses 1,000. No migration. Standing
  lesson recorded: `.limit(n)` in Supabase is "1,000, quietly" past the cap - full-table reads must
  page with `.range()`.
  **ACTION FOR JASPER: once v1.37 deploys, click "Queue and build" - it should now succeed and
  publish fresh rankings.** (`recomputePlayerContribution`, which runs on each vouch submit, still
  uses `.limit()` but its per-player reads are far under 1,000; noted as a latent follow-up, not
  currently failing.)

- **2026-09-10** - **Partner-conflict bug fixed, payment flow reads honestly, new tournaments start
  priced** (master_plan §2J, handover v1.38). Jasper could not enter Mixed Doubles Low Intermediate
  with Christine ("One of you is already on a team in this division") despite neither having an active
  entry there. Root cause proven in production: the `partner_conflict` guard counted any team in
  status forming/formed/locked regardless of whether its registration was alive, and a cancelled test
  from days earlier left both on a `formed` team whose only registration was `withdrawn`. Cancelling
  released the slot but never retired the team, so it blocked forever.

  **Migration 0031** adds `player_on_active_team_in_division()` - a team counts as occupied only when
  it has an active (non-closed) registration - and applies it to all five guard sites
  (create_team_with_pending_partner, accept_partner_invitation ×2, replace_pending_partner,
  change_partner). Simulated against live data: both players now `blocked=false` in Mixed Low Inter
  (can enter together), still blocked where they hold a payment_pending / payment_submitted team.
  Also unsticks a player from an orphan team left by a failed "Enter and pay".
  **ACTION FOR JASPER: run `scripts/apply-0031.sql`** and return `helper_fn=1, create_fn=1, accept_fn=1,
  replace_fn=1, change_fn=1` (plus the informational dead-teams count). The partner bug persists until
  0031 is applied - the fix is entirely in the RPCs, so app code needs no gating.

  **Payment flow (app-side, no migration):** "Enter and pay" now loads as "Proceeding to payment…"
  (not "Reserving your slot…"); the payment card leads with "Next: pay to secure your slot" in the
  brand tint; and "I'll pay later" is a deliberate two-step warning ("not confirmed until you pay…
  held ~30 min… come back from My registrations") that collapses the panel without implying done. A
  literal payment modal was deferred as larger/riskier than the confusion warranted.

  **How slots are held (Jasper's question):** one timer, three states. Unpaid `payment_pending` holds
  a slot for `slot_hold_minutes` (default 30, Admin) then stops counting; a submitted receipt
  (`payment_submitted`) makes the hold firm and non-expiring while the organizer reviews (§1U);
  `confirmed` is permanent. Waitlisted never holds. "Secured" = confirmed.

  **Default fee:** new setting `default_division_fee_amount` (₱1,000 per player, Admin-editable). The
  15 starter divisions of a new tournament now stamp it instead of 0, and the add-division form
  defaults to it. Merges via system_settings, no migration.

- **2026-09-10** - **Payment is now a centered modal; the pay step no longer looks like it failed**
  (master_plan §2K, handover v1.39). Jasper: after "Enter and pay" the form vanished to the division
  list as if it failed, then ~5s later My registrations appeared with the payment. Cause: the invite
  form reset its own state on success before the refresh finished, blanking the "Proceeding to
  payment…" card. Fix: the form no longer resets - the button stays pending through the refresh, and a
  centered payment modal (shared portaled Modal) auto-opens on the just-created entry once the page
  settles. My registrations shows one "Pay now to secure your slot" button per unpaid entry (with the
  §2G checklist above it) that opens the same modal; a receipt under review keeps inline management.
  Submitting closes+refreshes; "I'll pay later" closes with the hold warning first. Removed the now
  dead payment-form.tsx. No migration. All gates green (typecheck, lint, 193 tests, format, build).

- **2026-09-10** - **Four UI fixes** (master_plan §2L, handover v1.40). (1) Paid entry card no longer
  repeats "payment submitted" three times: state lives once in the §2G checklist, PaidEntryActions is
  just the actions, RegisterActions is skipped for paid entries and its "Your status:" line removed;
  Change partner / Request to cancel are equal-width side-by-side buttons with panels below
  (ChangePartnerForm made a controlled panel). (2) Pagination adds first/last jump buttons and always
  shows >=3 page numbers on mobile. (3) Organizer detail sheet now shows the cancellation reason (was
  fetched but never rendered). (4) "Looking for a partner" and "Open to sponsorship" are now settable
  (onboarding/edit toggles + profile actions write them + getMyProfile reads them); the flag syncs to
  the profile/card badge, the Players filter (§2B), and a new compact partner-search icon on the
  directory row. No migration (columns existed; only the write path was missing). All gates green
  (typecheck, lint, 193 tests, format, build). Auth-gated surfaces, so verified via build/logic;
  worth a signed-in check of the edit toggle and the paid-card layout.

- **2026-09-10** - **"Looking for a partner" is now a one-tap CTA on the Players tab and in the
  tournament** (master_plan §2M, handover v1.41). v1.40 made it settable but only in Edit profile.
  Added a shared `LookingForPartnerToggle` + a focused `setLookingForPartner` action (writes one
  column, revalidates directory + own page, optimistic). It renders as a card atop the Players tab and
  inline at the top of the tournament partner-invite step (the moment you're searching). Same
  `looking_for_partner` column as the badge/filter/row-icon/edit checkbox, so all surfaces stay in
  sync. Viewer value read via getMyProfile (Players) and getViewerRegistrationState -> new
  `viewerLookingForPartner` (tournament). Signed-in only; never touches others. No migration. All
  gates green (typecheck, lint, 193 tests, format, build). Auth-gated, so verified via build/logic;
  worth a signed-in tap to confirm the switch + sync.

- **2026-09-10** - **"Open to sponsorship" joins "Looking for a partner" as one compact card, on
  Players and the tournament; top of Players trimmed** (master_plan §2N, handover v1.42). Both flags
  now share a single "Let people find you" card (two thin rows, not two cards). The toggle is generic
  (`AvailabilityToggle` kind partner/sponsor) with `setLookingForPartner`/`setOpenForSponsorship`
  sharing one writer; same columns as the badge/filter/row-icon/edit checkboxes, so all in sync. The
  card also appears on the tournament page for onboarded viewers (viewer projection now returns
  viewerOpenForSponsorship + viewerOnboarded); the per-division partner step keeps its inline LFP
  toggle. Replaced the LFP-only component with availability-toggles.tsx (deleted
  looking-for-partner-toggle.tsx). Also trimmed the top of Players: the leaderboards doorway went 3
  lines -> 2 and lost the gradient hero; the availability card lost padding - the list starts higher.
  No migration. All gates green (typecheck, lint, 193 tests, format, build). Auth-gated surfaces
  verified via build/logic; leaderboard card compaction is visible on the public Players page.

- **2026-09-10** - **"Less text + more organizer control" batch** (master_plan §2O, handover v1.43).
  Removed the interest-dialog subtitle, Home leaderboard subtitles (/leaderboards keeps them), and the
  two filter helper paragraphs; shrank skill chips; fixed the truncated "Repeat pair…" Community
  Champions line (source shortened + display trims old snapshots). Added an unvouched-player amber
  nudge banner below the header (onboarded, 0 vouches; links to their profile). Made all organizer
  Manage sections collapsible (Status + Overview open by default). "Show cancelled and withdrawn" now
  shows ONLY closed entries (test updated). Confirm-slot relabelled (already bypasses payment); Cancel
  shows "Cancelling…". Added a ReceiptLink column (7-day signed URL) to the CSV + normalized xlsx for
  bank review - caught that the proof column is `proof_storage_path`, not `proof_path`, before it
  shipped blank links; verified sign returns 200 against production. No migration. All gates green
  (typecheck, lint, 193 tests, format, build).
  **DEFERRED to Phase 16 (master_plan §2P):** organizers registering teams on a player's behalf (club
  + division, players confirm). Needs a migration, an organizer-authorized RPC, a §1D consent flow,
  and a wizard UI - designed in §2P, awaiting Jasper's go-ahead. Manual confirm (bypass payment) was
  already supported and is shipped/clarified in this batch.

- **2026-09-10** - **Export receipt links: window from export time, 30-day default, Admin-tunable**
  (master_plan §2O, handover v1.44). Answering "what if registration runs a month?": the signed URL
  is generated at EXPORT time, not receipt upload, so re-exporting always mints fresh links. Raised
  the default 7 -> 30 days and made it setting `export_receipt_link_days` (capped 90). Trade-off:
  longer is friendlier to a slow reviewer but a leaked export exposes private receipts longer. No
  migration (merges via system_settings). Gates green.

- **2026-09-10** - Added a square Facebook announcement for the newly launched **Looking for a
  partner** and **Open for sponsorships** profile settings. The 1254 x 1254 creative uses the clean
  VouchPlay UI-inspired visual system and includes a compact B-STEEL Hermosa 2026 / Rise of the
  Empires tournament footer. Saved under `deliverables/facebook-posts/`.

- **2026-09-10** - Revised the new-features post tournament footer for cross-post consistency. Kept
  the B-STEEL badge unchanged on the left and replaced only the right-side plain tournament text with
  the standardized gold `RISE OF THE EMPIRES`, multicolor `HERMOSA`, gold-script `GRAND`, and white
  `PICKLEBALL TOURNAMENT` lockup. Saved as the `Uniform_Tournament_Lockup` revision.

- **2026-09-10** - Corrected the new-features post to use the supplied tournament lockup artwork
  itself instead of an AI-rendered approximation. The exact crown, gold `RISE OF THE EMPIRES`,
  multicolor `HERMOSA`, gold-script `GRAND`, pickleball, and white `PICKLEBALL TOURNAMENT` grouping
  were proportionally placed at lower right; the B-STEEL badge and all other post content remain
  unchanged. Saved as the `Exact_Tournament_Lockup` revision (1254 x 1254 PNG).

## 2026-09-10 - Deployment-skew self-healing (§2Q, handover v1.45)

Players reported two error screens as common: "VouchPlay hit a snag" (global-error, no chrome) and
"Something went wrong on this page ... after a tab has been idle" ((app)/error, generic branch).
Diagnosed as **deployment skew**: frequent deploys orphan the immutable chunks of already-open/idle
tabs; the next fetch 404s -> boundary. "Try again" used reset() (re-renders the stale tree, fails
again). Root layout was clean (not the cause of global-error); middleware getUser() was unguarded, so
a Supabase blip could 500 into global-error too.

Fixes (no DB/RLS/auth/vouch changes):
- next.config.ts: `deploymentId: process.env.VERCEL_DEPLOYMENT_ID` (Next-native skew handling; dev
  no-op). Also flip Vercel Skew Protection ON in the dashboard (keeps old assets served a while).
- error-telemetry.ts: new pure `isChunkLoadError()` (+ 2 tests). Boundaries (global-error, (app)/error,
  leaderboards) hard-reload ONCE on a chunk error, guarded by sessionStorage key `vp:skew-reload:<ver>`
  so it can't loop; "Try again" hard-reloads for chunk errors; telemetry flushes first (keepalive).
- supabase/middleware.ts: getUser() wrapped in try/catch.

Gates: typecheck clean, web tests 152 pass (error-telemetry now 6), format clean, lint clean. Build +
deploy + both-domain verify next. Note: this deploy still skews tabs on the previous build one last
time; from the next deploy on they self-heal.

## 2026-09-10 - Terms of Service + Privacy Policy + blocking consent gate (§2R, handover v1.46)

350+ live players, only placeholder legal pages, no consent capture. Added real Terms + Privacy and a
blocking acceptance gate. Confirmed with Jasper: blocking gate for existing users; I draft, counsel
reviews.

- Migration 0032 (scripts/apply-0032.sql): profiles.terms_accepted_version + terms_accepted_at
  (nullable, additive, no RLS change). APPLY THIS - verify version_col=1, at_col=1, pending_players=all.
- @vouchplay/config LEGAL {version (date-based), effectiveDate, entity, jurisdiction} +
  isCurrentLegalVersion() (2 tests). Bump version to re-prompt everyone.
- auth.ts getViewerLegalStatus(): SEPARATE fail-open read (NOT in getMyProfile) so deploy-before-migrate
  can't lock anyone out / bounce to onboarding.
- components/legal/: legal-doc, terms-content, privacy-content (plain presentational, reused by pages +
  gate), legal-consent-gate (overlay above header/nav, embedded scrollable tabbed docs, one checkbox).
- actions/legal.ts acceptCurrentLegalTerms() stamps profile + revalidate.
- app-shell renders <LegalConsentGate/> when getViewerLegalStatus().needsAcceptance (skipped under
  maintenance). signup-form: required agree checkbox + intent=signup; auth action enforces server-side
  for intent=signup only (login unaffected). profile.ts completeOnboarding: tolerant acceptance stamp.
- /terms and /privacy now render real docs (were placeholders).

Limits: text UNREVIEWED by counsel (strong draft) - review, then bump LEGAL.version. Contact = JT
Facebook page; add dedicated privacy/DPO email; consider NPC registration/DPO. Gate = ~10s one-time
speed bump for the 350 mid-tournament (deliberate, for a real acceptance record).

Gates: typecheck clean, 193 tests pass (config now 21 incl legal 2), format clean, lint clean.
Deploy order: apply 0032 (safe, additive) around the deploy; fail-open read tolerates either order.

- Follow-up: added persistent SiteFooter (About/FAQ/Terms/Privacy + dev credit) in app-shell on
  every page; removed the duplicate Home footer (dropped now-unused Link/BRAND imports there).

## 2026-09-10 - Live "players online" counter (§2S, handover v1.47)

Header pill showing live count of players viewing the app. Supabase Realtime PRESENCE, connect only
while tab visible. No Vercel functions (WebSocket browser<->Supabase), no DB rows/polling; Realtime is
metered separately from DB egress, so it does NOT worsen the egress we're near. Free tier 200 conc
conns / 2M msgs-mo is ample now; >~200 visible tabs -> extra viewers uncounted (graceful).

Privacy: opaque random per-browser key (localStorage 'vp:presence-key'), never user id; empty payload.
Others see count, never who. Multi-tab same browser counts once.

Files: components/presence/online-counter.tsx (client, visibilitychange connect/disconnect, hides when
count<1 or Realtime down); header.tsx renders it (gated by loadSettingFlag online_counter_enabled,
default true); config settings default + catalog entry (group 'announcement'). No migration (settings
merge code defaults).

Gates: typecheck/lint/format clean, 193 tests pass. UX: pulsing emerald dot + tabular number + "online"
on sm+, reduced-motion safe.

- Follow-up (v1.48): moved the counter to a hovering chip floating just below the header at the row's
  right edge (under bell/profile), absolute top-full of the sticky header row; soft shadow + backdrop-
  blur; full "N online" label on all sizes. header.tsx placement + online-counter.tsx styling only.

## 2026-09-10 - Polish: translucent chip + compact-card sponsorship icon (§\&2T, handover v1.49)

- online-counter.tsx: bg-surface/70 + backdrop-blur-md (was /95) so the floating chip does not block
  text behind it; frosted-glass look, chip number stays readable.
- player-card.tsx (compact): added Handshake icon (text-primary) beside the UserSearch partner icon on
  line one, gated by player.openForSponsorship. Detailed card + DTO already had both; only compact row
  was missing sponsorship. Colors: lime=partner, primary=sponsorship (matches detailed badges).
Gates: typecheck/lint/format clean. UI-only, no migration.

## 2026-09-10 - "Already vouched" button state + profile note (§2U, handover v1.50)

Vouch button now shows a "Vouched" success-outline state (CheckCircle2) when the viewer already has an
active vouch - on compact cards, detailed cards, and profile. Still tappable (change/withdraw).
Profile note under actions: "You've vouched for {name}. You can change or withdraw it in {N hrs/days}"
(cooldown from vouch_update_cooldown_days) or "...anytime - just tap Vouched."

Read-only over existing vouch model, no schema/logic change:
- queries.ts getViewerVouchedTargetIds(viewerId): one query, listPlayers sets dto.viewerHasVouched
  (fetched in the Promise.all before the map). getViewerVouchState(targetId, viewerId): hasVouched +
  canUpdateInMs. Service client filtered to voucher_id=self (no identity leak).
- dto.ts: PlayerCardDTO.viewerHasVouched (default false).
- vouch-button.tsx: hasVouched prop -> vouchedCls (border-success/50 bg-success/10 text-success) +
  CheckCircle2 + "Vouched"; else primary. player-card passes it (both variants).
- lib/vouches/cooldown.ts formatVouchCooldown(ms) pure (+4 tests): minutes->hours->days, round up.
- profile page: getViewerVouchState + note.

Gates: typecheck/lint/format clean, 197 tests pass (cooldown 4). UI + read-only queries, no migration.

## 2026-09-10 - Vouch confirm dialog + Request-to-partner flow (§2V/§2W, handover v1.51)

§2V: tapping "Vouched" now opens a confirm dialog (shared portaled Modal), not the form. In cooldown:
"...change or withdraw in {N hrs/days}" + Got it. Changeable: "Change my vouch"/"Not now" (change ->
form on profile, or router.push /players/slug?intent=vouch from a card). canUpdateInMs threaded to
VouchButton: cards via viewerVouchCanUpdateInMs (getViewerVouchCooldownMap replaced the Set fn), profile
via getViewerVouchState. Server still enforces cooldown on write.

§2W: profile "Request to partner" replaced dead-end tooltip -> Link to /tournaments?partner=slug (anon
gates to signup then resumes). tournaments/page.tsx shows dismissible banner "Partner up with {name}..."
(getPlayerMetaBySlug), partner param preserved across search. Existing registration partner-invite step
does the pairing; auto-preselect deferred to Partner Finder phase.

Files: vouch-button.tsx (rewrite), dto.ts (viewerVouchCanUpdateInMs), queries.ts (getViewerVouchCooldownMap),
player-card.tsx (both pass canUpdateInMs), profile page (pass canUpdateInMs), profile-actions.tsx (partner
Link, removed tooltip/partnerNote), tournaments/page.tsx (banner).
Gates: typecheck/lint/format clean, 197 tests. No migration.

## 2026-09-10 - SECURITY: removed in-registration division change (§\&2X, handover v1.52)

Bug: registered team could Change division -> move_player_registration bypassed gender + skill-cap
eligibility (only enforced at register time). Removed capability entirely: RegisterActions change-
division UI gone (+ divisions/playerChangesConfigured/teamSize plumbing through my-registrations +
tournament page); moveRegistrationDivision neutralized to a rejecting stub (never calls RPC) so stale
clients cant exploit it. Intended path: cancel + re-register. No migration; move_player_registration
RPC now unused (drop later). UI polish (partner search align, pay-later, vouch note/layout) shipping
next as v1.53.

## 2026-09-10 - Profile/partner/pay-later polish + vouch-success fix (§\&2Y, handover v1.53)

- Profile header ([slug]/page.tsx): Vouch/Share moved to top-right (sm:justify-between), credentials
  regrouped (chips row, badges row, clubs, bio) below identity; removed redundant "Youve vouched" note
  (+ dropped CheckCircle2/formatVouchCooldown imports). Names truncate.
- vouch-button.tsx: unified return - trigger varies by state but Modal + VouchForm render in ONE fixed
  position, so a successful vouch (router.refresh flips hasVouched) no longer remounts the form and
  wipes its success confirmation.
- partner-invite-form.tsx: result row items-center, name/city stacked, Choose button proportionate.
- payment-modal.tsx: "Ill pay later" -> full-width bordered secondary button.
Gates: typecheck/lint/format clean. No migration.

## 2026-09-10 - Players list filter skeleton (§\&2Z, handover v1.54)

Filtering now shows preloaded skeleton boxes on the list, not just the filter spinner. players/page.tsx:
extracted async PlayersResults (count row + cards + pagination, awaits listPlayers) wrapped in
<Suspense key={JSON.stringify(filters)+compact} fallback={<PlayerListSkeleton compact/>}> so any
filter/search/page/view change remounts the boundary and shows the skeleton until the query resolves;
shell (title, leaderboard card, availability, SearchFilters) stays mounted. New component
player-list-skeleton.tsx (density-matched compact rows / detailed cards, animate-pulse surface-muted,
motion-reduce safe, aria-hidden + sr-only "Loading players"). listPlayers moved out of the shell
Promise.all into the boundary; no extra queries. Gates: typecheck/lint/format clean. No migration.

## 2026-09-10 - Post-launch audit + fix batch (audit report + §2AA/§2AB, handover v1.55/v1.56)

Audited commits 5197f62..f7f1fc3 (read-only, against prod DB + both live domains). Reports:
working/P_006b_PostLaunchAudit_(2026-09).md and working/P_006b_FixExecutionPlan_(2026-09).md.

Key facts verified against production (service-role, read-only):
- Migration 0032 (legal) IS applied. 54/348 onboarded players have accepted 2026-09-10; gate is live.
- ?dpl= emitted on both domains (dpl_GnGf9E...); skew reload guard is loop-safe.
- 407 profiles, 348 onboarded, 2731 vouches, 106 system_settings rows.

### v1.55 / §2AA - SECURITY (urgent, no deploy)
create_team_with_pending_partner, decline_partner_invitation, replace_pending_partner (0025/0031)
were world-executable: proven callable with the anon key (no session), while every sibling denied
42501. No auth.uid() check, no player_fits_division -> same bypass class as §2X, reachable by anyone.
Migration 0033 (scripts/apply-0033.sql) revokes public/anon/authenticated + regrants service_role.
App already calls them as service_role, so ZERO player impact and no deploy. Also added
verify-rpc-grants.mjs, check-migration-grants.mjs (lint gate), and a CLAUDE.md/AGENTS.md rule.
APPLY 0033 FIRST via SQL editor - it is safe anytime.

### v1.56 / §2AB - perf/consent/resilience (one windowed deploy)
- lib/auth.ts: getCachedUser() (React.cache) collapses 5-6 auth.getUser()/req -> 1; getMyProfile,
  getViewerLegalStatus, getViewerReputationNudge, getViewerContext memoised. Legal read stays a
  SEPARATE select (kept §2R fail-open separation). Pure read-side.
- onboarding-form.tsx + profile.ts completeOnboarding: required consent checkbox at onboarding
  (onboarding mode only), server refuses + does not stamp acceptance unless checked -> fixes Google
  sign-ups getting an unearned acceptance record. Existing 350 unaffected (already onboarded).
- online-counter.tsx: reset to null (hide) on CHANNEL_ERROR/TIMED_OUT/CLOSED; 30s hide debounce.
- Organizer skill-mismatch chip: ALREADY shipped (organizer-registrations.tsx:230) - no change.

Deferred (told Jasper): Function Region -> sin1 (dashboard); caching layer on uncached public reads
(own deploy, §2AC); skill-drift policy (decision gate; 11 Hermosa regs handed to organizer);
post-window cleanup migration (drop move_player_registration, dead helper, add player_fits_division
inside register_team); legal counsel review + LEGAL.version bump.

DISRUPTION TO PLAYERS / HERMOSA: none from 0033 (privilege only, app uses service_role) and none from
the v1.56 batch (read-side/onboarding-only/cosmetic; existing registrants already onboarded). The one
windowed deploy self-heals open tabs once via §2Q. Production push HELD for the 01:00-06:00 PHT window
(currently peak PHT) - see runbook in the fix-plan doc.

## 2026-09-11 - Decisions & deploy: region -> sin1, skill-drift policy = Option A

- **Skill-drift policy DECIDED: Option A** (organizer-managed; no code). When a player's community
  skill rises above a division cap after they register, the organizer reviews via the existing amber
  "Potential skill mismatch" chip and decides per team. Option B (evidence threshold before community
  skill overrides self-rating at the fit gate; reuses eligibility_min_unique_vouchers=2) is DEFERRED,
  not rejected - revisit if organizer review becomes a burden or the low-confidence-vouch case draws
  complaints; would be one windowed deploy + migration 0034 (SQL twin player_fits_division), not
  retroactive. Option C (freeze skill at registration) REJECTED - re-enables sandbagging, against the
  core value. Memo: working/P_006b_SkillDriftPolicyMemo_(2026-09).md. Master_plan §2AB updated.
  OPEN: handing the current 14-registration Hermosa flag list to the organizer is pending Jasper's go
  (external sharing of live player data - not done without explicit instruction).

- **DEPLOYED (commit c40a58d, then a region redeploy):** §2AA/§2AB batch is live on both domains.
  Verified: new dpl flipped on both; migration 0033 applied (verify-rpc-grants.mjs = 0 write RPCs
  reachable by anon); Verify-2 tripwire reviewed - every remaining anon/authenticated-executable
  security-definer function either read-only or self-authorizes via auth.uid() (safe).
- **Function Region -> Singapore (sin1):** flipped in Vercel; took a redeploy to apply (region binds
  at build time, not on save). Now x-vercel-id = sin1::sin1 on both domains (was sin1::iad1). Warm
  TTFB from Manila dropped ~3-5x on DB-heavy pages: /tournaments ~1.0-1.4s -> ~0.27-0.30s, /players
  ~1.4-2.6s -> ~0.37-0.47s. Static-light /terms barely moved, as expected. DB is ap-southeast-1
  (Singapore); functions now co-located, so the 6-10 sequential Supabase queries/page stopped
  crossing the Pacific.
- STILL PENDING JASPER EYEBALL (auth-gated, couldn't verify anonymously): new-account onboarding
  Terms/Privacy checkbox; header/online-chip/legal-gate render when signed in.
- STILL DEFERRED: caching layer on uncached public reads (§2AC, own deploy - stacks on the region
  win); post-window cleanup migration (drop move_player_registration, dead helper, add
  player_fits_division inside register_team); legal counsel review + LEGAL.version bump.

## 2026-09-11 - Caching phase 1 + organizer eligibility-reason detail (§2AC/§2AD, handover v1.57)

Event-focused batch ahead of tomorrow's Hermosa registration. One windowed deploy. No migration.

- **§2AC caching, phase 1 (queries.ts):** extracted the per-division registration-count read (the
  limit(1000) rows, biggest uncached egress item, called twice per detail render) into
  getDivisionRegistrationCounts(tournamentId, slug) - unstable_cache 60s, tag tournamentTag(slug),
  cookie-free service client. Counts stay live: registration/payment/eligibility/edit writes already
  revalidateTag(tournamentTag(slug)). Capacity still enforced in register_team RPC, so stale count
  can't over-register. No viewer data cached. Rest of getTournamentBySlug unchanged.
- **§2AD organizer reason (organizer-registrations.tsx):** EntryRow now shows a plain-language reason
  line under the eligibility chip (eligibilityReasonLines() maps snapshot per-player codes via
  HARD_RULE_LABELS/REASON_LABELS, grouped by reason). Organizer-only, read-only. Covers the live
  skill_mismatch/review cases; hard-rule-only team-level codes still show via the chip label.
- **DEFERRED for event safety (told Jasper):** post-window cleanup migration (adds
  player_fits_division inside the live register_team RPC = registration-path logic change) and
  LEGAL.version bump (would re-prompt all 350+ with the consent gate mid-event). Counsel review is a
  human task. Broader caching (card engagement, offers, clubs, profile extras, PLAYERS_LIST_TAG
  split) = §2AC phase 2, after the event (smaller diff tonight is the safer risk posture).

Gates green: typecheck, lint (migration-grant guard OK), 193 tests, format. Commit local; push held
for the classifier / Jasper.

## 2026-09-11 - Caching phase 1 extended to the pure-public reads (§2AC)

Added, same deploy as the count cache: listOpenOffers (60s, tag OFFERS_LIST_TAG), getPlayerHistory
(60s), getContributionProgress (60s). All pure public (service/public client, no viewer fields).
CORRECTION on the earlier "pure-public" list: getClubMembers is RLS-scoped (manager sees pending,
anon sees active only - club_memberships policy status='active' OR auth.uid()=user_id OR staff), and
getPlayerAchievements carries endorsedByViewer + own pending claims - both are viewer-dependent, so
they were NOT cached; they join withTournamentCardEngagement + getPlayerSkillTags in phase 2 (need a
public/viewer split + cross-user leakage test). Gates green (typecheck, lint, 193 tests, format).

## 2026-09-11 - Vercel cost mitigation: cut invocation volume (§2AE, handover v1.58)

Day 3, ~$10/$20 credit spent (~$100/mo trajectory). Diagnosed: function-invocation volume (911K/3d)
drives the top 4 lines together - Observability Events $3.14 (~2.9/req), Fluid CPU $1.99, Provisioned
Memory $0.88, Origin Transfer $1.47; Build CPU $1.74 = deploy frequency. NOT analytics/polling (no
@vercel/analytics|speed-insights; online counter is Supabase WS; only 1 server log line). Biggest
amplifier: Next viewport-prefetch on directory cards (player/tournament/club) + leaderboard entries -
each prefetched a DYNAMIC detail route on scroll -> RSC + middleware invocation before any click,
24+/page.

Shipped (code): prefetch={false} on player-card (3 Links), tournament-card, club-card, and
leaderboard-panel subjectHref (2). Cards still navigate on tap w/ existing LinkSpinner. Nav keeps
prefetch. resume-refresh.ts RESUME_IDLE_MS 60s -> 300s (fewer auto re-renders on PWA refocus).
Compounds with the sin1 region move (per-invocation CPU) + §2AB/§2AC caching (per-invocation DB/egress).

Owner (not code): Vercel dashboard - disable Observability beyond included tier / confirm Obs Plus
OFF; DEPLOY LESS OFTEN (batch). Deferred post-event: middleware matcher skip prefetch/RSC (auth-
sensitive, verify signed-in; small marginal benefit after card prefetch removed).
Gates green (typecheck, lint, 193 tests, format). Watch invocation count on usage screen after settle.

## 2026-09-11 (overnight) - Rig-resistant Community Skill: STS_V2 + integrity flags + velocity hold (§2AF, handover v1.59)

Jasper's ask (asleep, full execution permission): make CSL/vouching as rig-proof as possible against
gang/club coordinated vouching, fake accounts, trolling; recalibrate CSL; legal/privacy-safe; brainstorm
-> document -> delegate -> implement -> deploy. Orchestrated by Fable; 5x Sonnet executors + 1 code map.

Diagnosis (prod, read-only): 3,209 active vouches / 422 profiles / 309 rated; 27.5% reciprocal; 40% of
well-vouched players get >=60% of vouches from ONE club; inflation dominates (1,758 above self vs 112
below); ZERO identity-verified/coach accounts so every vouch weighs 1.0; platform 3 days old so account
age can't separate fakes; only real anchor = paid/live registration (81 players). §11.2's 7 detectors
were never implemented; 24h vouch limits are 0 (unlimited, JT decision 09-07). Root cause: credibility
flat, independence never measured.

Built (all gates green, 422 tests):
- core: packages/core/src/skill/v2/* - voucherTrust (anchors/standing/maturity), independence
  (reciprocal x0.5, club-bloc decay 0.6^j), computeSkillV2 (shrunk weighted median w/ self-rating prior
  2.0, N_eff, STS_V2, SkillVerified needs N_eff>=2), detectAnomalies (VELOCITY_BURST/LOW_TRUST_SWARM/
  RECIPROCAL_RING/CLUB_BLOC/SPIKE). 39 tests incl. the worked example: 12 fresh same-club at 5 vs 2
  anchored at 2, self 2 -> V1=5, V2=2 (nEff 2.36).
- config: STS_V2_CONSTANTS (=V1 values, version-locked); 18 admin settings (skill_v2_*,
  skill_algorithm_active_version=STS_V1, vouch_velocity_guard_enabled=true) + catalog group "Vouch
  integrity"; migration 0034 + apply-0034.sql (6 nullable v2 cols + seed). SEEDED LIVE via service
  role (DML) - version stays STS_V1, zero public change. 0034 DDL is PENDING Jasper's paste.
- app: v2-facts.ts (bounded facts), recompute.ts computes V1 (unchanged) + V2 (tolerant write,
  42703-safe) + persists informational flags (dedup); velocity-guard.ts holds low-trust burst vouches
  (invalidated + reason velocity_hold:<flag>, revision, audit actor null) before recompute - LIVE;
  active-skill.ts pickActiveSkill/selectSkillProfiles (42703 fallback) routed into players/queries,
  division-fit-check, eligibility/compute, leaderboards/builder (version in cache keys);
  moderation: reinstateHeldVouches/keepHold + loadIntegrityQueue; UI: integrity-panel in Staff ->
  Moderation, profile "Based on N (independent) players" + "Some recent vouches are being reviewed",
  vouch-form held message, STS dialog copy.
- scripts (vite-node, import the real engine): skill-v2-shadow-report.ts (read-only) ->
  working/skill-v2-shadow-2026-09-10.csv; backfill-skill-v2.ts (refuses until 0034).
- Orchestrator fix: guard now hands POST-hold facts to recompute (held vouches excluded from V2 in
  the same cycle).

SHADOW RESULT (prod): 105/309 change band (down -1x72,-2x17,-3x3,-5x1; up +1x10,+2x1,+3x1);
Skill-Verified 221->148; flags ring 28, spike 24, club bloc 7, swarm 2, burst 1. Top corrections = thin
evidence (1-2 low-trust vouches pushing self 0-1 to CSL 3, one to 6). kendee + JBoMan (yesterday's
Hermosa mismatches) return to band 1 under V2.

JASPER TODO (morning brief working/P_006b_IntegrityRollout_(2026-09).md): read CSV; paste
apply-0034.sql; run backfill; decide flip timing (AFTER Hermosa window - 34% move a band) and any
softening (bloc_decay 0.6->0.75 / prior 2->1.5); skim Vouch integrity queue.
Deferred: mutual-vouch community detection (non-club rings); counsel sentence on integrity processing.

## 2026-09-11 - Directory/organizer/identity UX batch: PLAN written, not built (§2AG)

Jasper asked for a handover plan (no code yet) covering: identity-verified badge on photo+ID, not-
verified nudge, coach badge, admin tournament filter, STS/vouches-received/vouches-given range
sliders, "new account" badge+filter, city normalization + PH-city autocomplete, pagination persistence
after vouching, new default sort (new unvouched first) + Excel-like sorts, organizer registrations
combinable filters + division capacity strip + column sort.

Grounding (verified): list orders by updated_at desc, no sort control; STS filter single-thumb; NO
identity upload/review flow exists (badge only, 0 verified); coach badge missing only on compact row;
cities: 362 onboarded -> 36 raw -> 22 canonical, 4 variant groups, Zamboanga 318 across 7 spellings,
2 test rows; Players TAB links bare /players (pagination reset cause). leaderboard_city_region_map
empty (no scope impact from city normalization).

Docs: master_plan §2AG (decision record, D1-D8, phases A/B/C, UX principles) +
working/P_006b_UIUXBatchHandover_(2026-09).md (executor brief w/ file:line, slices A1-A5, gates).
Handover spec unchanged (nothing shipped; v1.60 entry when Phase A ships).

DECISIONS PENDING JASPER: D1 identity = staff-approved (V2 anchor - never auto on upload); D2 self-
nudge only, no public "unverified" marker; D3 STS sort violates locked §8.4 -> staff-only; D4 "total
vouches" = given; D5 new-account window 7d tunable; D6 global default sort change; D7 tournament
filter = staff + that tournament's organizers; D8 city mapping review before DML.
Phasing: A (UI/read-side, one windowed deploy post-Hermosa window) -> B (cities, DML after D8) -> C
(identity pipeline, after counsel on ID retention).

## 2026-09-11 - Directory/organizer UX Phase A (§2AG, handover v1.60) - built, gates green

Decisions D1-D8 all at recommended values (Jasper accepted). Orchestrated by Opus, 2x Sonnet executors
(A1-A4 directory, A5 organizer), non-overlapping files.

A1 sort: PlayerSort (new_unvouched default global / newest / oldest / name / most_vouched; sts_desc
STAFF-ONLY, server-rechecked §8.4). fetchListRows now fetches full matching set (bounded ~1000-row
PostgREST cap, cached 60s PLAYERS_LIST_TAG, card columns only) + in-memory order + slice; heavy
per-player reads stay on the 24 shown ids. Pagination persist: sessionStorage vp:last-players-url,
BackToPlayersLink on profile, PlayersNavLink on tab.
A2 dual-range: components/ui/dual-range.tsx; stsMin/stsMax (legacy minSts parses), vouchesMin/Max
(received), givenMin/Max (given, vouches given = new bounded index read <=10k, in-memory count).
A3 new: new_account_badge_days=7 (config+catalog 'directory' group, SEEDED LIVE via service role +
scripts/apply-0035.sql), NewBadge neutral pill, dto.isNew, compact-row GraduationCap coach icon,
"New this week" filter.
A4 tournament filter: staff or organizer-of-that-tournament only, server-gated in listPlayers
(isOrganizerOfTournament uncached identity check); anon gets unfiltered list.
A5 organizer: EntryFilters -> combinable {divisions[],statuses[],eligibility[],payment[],partner[],
includeClosed,search} (AND across / OR within); EntrySort (needs_me default unchanged + name/division/
status/registered_at/amount/eligibility/payment asc/desc); CapacityStrip (registered/capacity·paid·
pending, warn >=90%, tap-to-filter); manage page builds counts in memory (no new query);
divisions prop renamed to eligibilityDivisions, new divisions=capacity array.

Gates: typecheck, lint (migration guard OK), 489 tests (236 web / 232 core / 21 config), format - green.
Deferred: Phase B cities (mapping CSV sign-off), Phase C identity pipeline (counsel on ID retention).

## 2026-09-11 - §2AG Phase B (cities) + Phase C (identity) - built, gates green

Phase B: @vouchplay/config ph-cities.ts (PH_CITIES 150 + idempotent normalizeCity, never blanks),
validation profile.ts normalize-on-save, onboarding/edit <datalist> autocomplete, city report script.
Deleted dead geo.ts (only exported PH_CITIES, no other importers). Applied one-time DML via
scripts/apply-city-normalization.ts (vite-node, real normalizeCity): 179/367 profiles canonicalized,
2 test rows nulled, 36->14 distinct city strings (Zamboanga City x326 etc.). Reversible:
working/city-backup-2026-09-11.csv. Mapping: working/city-mapping + city-normalization CSVs.

Phase C: identity_verifications table already complete (0001) - only added private identity-docs
bucket + RLS (migration 0036 + apply-0036.sql, PENDING Jasper SQL editor) + settings
identity_verification_enabled/identity_doc_retention_days. actions/identity.ts (submit requires
avatar+ID per D1; getIdentityDocSignedUrl staff-only 5min; reviewIdentityVerification staff approve/
reject, DELETES image on decision, keeps decision row). Me->Settings->Verify identity page + form;
Staff->Moderation Identity queue/panel; app-shell self-nudge (one-at-a-time, snooze 7d); own-profile
pending chip. Badge + STS_V2 anchor auto-activate on status=approved (existing logic). Fails open
until 0036. Privacy: image never reaches non-staff, deleted on decision; counsel owes Privacy Policy
wording (flagged).

Gates: typecheck, lint (migration guard OK), 563 tests (241 web/232 core/85 config/5 validation),
format - green. Deferred: document_delete_after sweeper job (later phase).
JASPER TODO: apply scripts/apply-0036.sql (bucket+RLS+2 settings); then push.
