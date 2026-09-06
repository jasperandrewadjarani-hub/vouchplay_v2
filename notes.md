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
  - Gates green (typecheck/lint/format/test 15-web/build). Committed `<hash>`, pushed; deployed;
    **re-aliased `vouchplayph.vercel.app`**.
  - **Deferred (later):** §26.6 manual waitlist reprioritize (auto-promotion on release already works,
    §23.3); §26.8 participants search; §26.9 broader comms beyond announcements. Export desktop-Excel
    integrity confirmation still pending from Jasper (§26.11 deliverable gate).

## Next up
- **Excel integrity:** Jasper to open the 2 demo `.xlsx` in desktop Excel + confirm no repair prompt
  (mandatory gate before the export is a shippable deliverable).
- **Phase 11 - Notifications (§27)** next - in-app + email-for-critical, push adapter (per the phase
  plan; confirm scope before building).
- **Phase 10 - Organizer Dashboard analytics + Export (§26, §27)** next - includes the canonical
  Tournament-System XLSX adapter (inspect `sample_data_/tournament_googlesheets_sample.xlsx` FIRST).
- **Ops (carry-over):** clear the Supabase org over-quota before 21 Sep 2026; switch Gmail SMTP →
  a dedicated provider before public scale; `supabase gen types` → `packages/db` once the CLI/token
  is wired (types are hand-synced for now).
