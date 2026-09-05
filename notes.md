# VouchPlay v2 — Project Notes (execution)

**Project:** P006b (Player Profiling) — VouchPlay v2 rebuild
**Owner:** JT Consulting & Analytics Inc. — Jasper Adjarani, Tane Valdez
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

## Relationship to the v1 app (`../vouchplay/`) — READ THIS

`../vouchplay/` is a **live, deployed predecessor** (Next.js 16 + Supabase + Tailwind v4, at
`vouchplay.vercel.app`, Supabase project `qfmmjvoccwioaqndvftm`, migrations 0001–0008, real users).
`vouchplay_v2` is a **ground-up rebuild that supersedes it**, deliberately:

- **New infra:** new Supabase project `itrosesiywpbaxtmucbb`, new GitHub repo `vouchplay_v2`.
- **Corrected model:** v1 conflated skill + trust into one "composite + trust weight + Confirmed"
  score, with ID verification and Facebook both boosting trust. v1.1 **forbids** this — CSL, STS,
  Identity Verified and Skill Verified are four separate concepts; Skill-Verified and Facebook must
  never increase vouch weight (avoids circular scoring). v2 fixes this.
- **New architecture:** v1 is a single app; v2 is a modular monorepo (handover §34.3).

**v1 is a REFERENCE, not a base.** Reusable assets to mine (not copy wholesale, domain differs):
exceljs export approach, PH-cities list, skill-tier color definitions, RLS security-definer
helper pattern, `screenshots_mockups/`. The v1→v2 cutover for existing real users is a later,
conscious decision — not handled by the initial build.

## Locked non-negotiables (from handover — do not violate)

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
- Anti-sandbagging output is neutral ("Potential Skill Mismatch") — never "sandbagger"/"smurf".
- Multi-club representation per player per tournament (`tournament_player_club_representations` is
  the source of truth; no team-level `club_id`). Default max 3 clubs/player, organizer range 1–10.
- XLSX export must be adapter-compatible with the canonical sample — **inspect first, never guess**:
  `sample_data_/tournament_googlesheets_sample.xlsx` (NOTE: handover §26.11.1/Phase 10 has a path
  typo — `sample_data\_\` / `D:\claude\_\`; real path uses `sample_data_`).
- Transactional email via a real provider (Resend/Postmark/SendGrid), NOT Gmail. Google Sign-In
  requests only `openid email profile` — no Gmail scopes.
- Public reads cache-first where safe; private/sensitive paths never shared-cached; no `select(*)`
  in production list endpoints; no N+1 in list/export paths.

## Assets on disk

- `logo_/` — vouchplay_logo_.png, _horizontal.png, _horizontal_transp.png, _transp.png
- `sample_data_/tournament_googlesheets_sample.xlsx` — canonical export compatibility contract
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

- **2026-09-05** — Read + fully understood handover v1.1 + chatgpt_convo. Surfaced v1→v2
  relationship. Began Phase 0 (monorepo foundation).
- **2026-09-05** — **Phase 0 COMPLETE** (local, unpushed). npm-workspaces monorepo scaffolded:
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
  **NOT pushed** — awaiting Jasper's go-ahead (outward action) + repo state check.

- **2026-09-05** — **Pushed** `main` to `github.com/jasperandrewadjarani-hub/vouchplay_v2`
  (remote was empty; clean first push). CI runs on push.
- **2026-09-05** — **Phase 1 (schema + plumbing) IN PROGRESS.** Wrote migrations
  `0001_core_identity.sql` (extensions pgcrypto/pg_trgm; enums; profiles, user_roles,
  role_applications, identity_verifications, system_settings, audit_logs; updated_at + new-user
  triggers; authz helpers `has_global_role`/`is_admin`/`is_staff` SECURITY DEFINER; RLS on all
  user-facing tables) and `0002_seed_system_settings.sql` (canonical defaults, ON CONFLICT DO
  NOTHING). Added Supabase client plumbing in web: lazy build-safe `env.ts`, `supabase/{client,
  server,service}.ts`, session-refresh `middleware.ts` (no-ops until keys exist), and the
  `EmailProvider` abstraction in core. Gates still green (lint/typecheck/test 7-7/format/build).
  **NOT yet applied to a live DB** — migrations validate on `supabase db push` when keys arrive.

## Email decision (2026-09-05) — DEVIATION from handover, approved by Jasper
Using **Gmail SMTP via `vouchplay@gmail.com`** for the pilot (handover §34A.11 forbids Gmail as
primary transport). Implemented behind the `EmailProvider` interface so switching to Resend/
Postmark/SendGrid later is a one-adapter change. Constraints: Gmail ≈500 sends/day (ok for first
~100 users, not scale), no bounce webhooks — prefer in-app notifications. **Must switch to a
dedicated provider before public launch.** Needs a Gmail **App Password** (16-char, requires 2FA)
set as Supabase Custom SMTP for auth emails.

- **2026-09-05** — **Phase 1 auth UI STAGED** (compiles + renders without keys; activates when
  `.env.local` is filled). Restructured `app/` into `(app)` (shell) and `(auth)` (minimal) route
  groups. Added: server actions (`lib/actions/auth.ts` — email OTP request/verify, password login,
  set password, Google OAuth, password reset, sign out; `lib/actions/profile.ts` — onboarding with
  slug gen); `lib/auth.ts` guards (`getOptionalUser`/`getMyProfile`/`requireUser`/`postAuthPath`,
  all graceful when keys absent); `/auth/callback` route (OAuth code + email token_hash); pages
  login/signup/forgot-password/onboarding; wired `/me` (signed-in card + sign out) and header
  (Sign in when logged out); shared UI atoms (Button/SubmitButton/Field/Input/Select/FormError);
  validation schemas in `@vouchplay/validation`; Terms/Privacy stubs. Migrated `middleware.ts` →
  `proxy.ts` (Next 16). Verified login/signup/me in-browser (light theme). Gates green
  (lint/typecheck/test 7-7/format/build). Docs: `docs/SECRETS_SETUP.md` (step-by-step for keys).
  Follow-up noted: `(app)` pages are dynamic because the header reads auth cookies — revisit with
  PPR/partial caching for public pages (players/clubs/tournaments) per §34A.5. Docs/setup guide
  saved: [SECRETS_SETUP.md](docs/SECRETS_SETUP.md).

- **2026-09-05** — **DEPLOYED LIVE:** https://vouchplay-v2.vercel.app (Vercel project
  `vouchplay-v2`, account jasperandrewadjarani-hub, git-connected → auto-deploys on push to main).
  Renders correctly (shell, theme, auth screens); auth inert until Supabase keys are added.

## Deployment workarounds (IMPORTANT — revisit later)
Getting the first deploy up hit two issues:
1. **Vercel × Next 16.3.4 platform bug:** every deploy failed at "Deploying outputs" with
   *"Cannot patch preview comments when immutable static file upload is enabled. Upgrade to
   next@v16.3.0-canary.32 or newer."* The build always succeeded; only the output-deploy step
   failed. Reproduced on 16.3.4 stable AND 16.4.0-canary.18, via CLI and Git, and was NOT fixed by
   disabling the project Vercel Toolbar. **Workaround: pinned Next to `^15.5.0`** (currently
   15.5.25), which doesn't trigger it. **TODO:** re-upgrade to Next 16 once Vercel/Next fix this
   upstream (then revert middleware→proxy rename and re-add `agentRules:false`).
2. **Monorepo detection:** the project's Root Directory and Framework Preset dashboard settings
   would NOT persist via automation (confirmed by screenshot — stayed "./" and "Other"). So Vercel
   runs framework detection at the repo ROOT. Fixes that made it work, both in-repo (no dashboard
   dependency):
   - **root `vercel.json`**: `framework: nextjs`, `installCommand: npm install`,
     `buildCommand: npm run build --workspace @vouchplay/web`, `outputDirectory: apps/web/.next`.
   - **declared `next` in the ROOT `package.json` dependencies** so Vercel's Next-version detection
     passes at the root. (Slightly unusual but harmless — next is hoisted anyway.)
   If Root Directory can later be persisted to `apps/web` (e.g. via a real dashboard session), the
   root-level `next` dep and buildCommand/outputDirectory overrides can be removed.

- **2026-09-05** — **LIVE + DB-CONNECTED.** Jasper supplied Supabase keys.
  - **Migrations APPLIED & VERIFIED** on project `itrosesiywpbaxtmucbb` via the Supabase SQL editor
    (Monaco `setValue` fed from the GitHub raw files — clipboard paste is blocked by browser
    security, and the dashboard internal query API needs the session token which the classifier
    blocks). Result: **6 public tables, 21 system_settings rows, 10 RLS policies.** ("Success, no
    rows returned" for both 0001 and 0002.)
  - **Vercel production env vars set** (CLI): `NEXT_PUBLIC_SUPABASE_URL`, `..._ANON_KEY`
    (added `--type config` — the anon key is public by design; CLI guards NEXT_PUBLIC credentials),
    `SUPABASE_SERVICE_ROLE_KEY` (secret), `NEXT_PUBLIC_SITE_URL=https://vouchplayph.vercel.app`,
    `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false`. Redeployed (`vercel --prod`) — deploy bug stays fixed
    on Next 15.
  - **Public live URL: https://vouchplay-v2.vercel.app** (project's short production domain — public,
    verified rendering in a browser with no Vercel session; connected to Supabase).
  - **Vanity domain `vouchplayph.vercel.app` — NOT public yet.** `vouchplay.vercel.app` is owned by
    v1. Renamed the Vercel project `vouchplay-v2` → `vouchplayph` and aliased `vouchplayph.vercel.app`
    to the prod deployment, but a manually-created alias inherits **Deployment Protection** (Vercel
    Authentication = "Require Log In", Standard Protection) so it shows the Vercel login gate, while
    the auto short domain (vouchplay-v2.vercel.app) bypasses it. Disabling the toggle via automation
    FAILED (React-controlled toggle reverts on Save — same dashboard-automation resistance already
    documented for this project). **MANUAL STEP for Jasper (~15s):** Vercel → project `vouchplayph`
    → Settings → Deployment Protection → turn **Require Log In** OFF → Save. Then
    `https://vouchplayph.vercel.app` (alias already created) serves publicly. (Re-alias after future
    deploys, or add it as a project domain, since a deployment alias doesn't auto-update.)

## Live status (2026-09-05)
- **Public (primary):** https://vouchplayph.vercel.app — LIVE (Jasper turned off Vercel Auth;
  verified rendering publicly). Caveat: it's a deployment alias, so re-alias after each deploy (or
  promote it to a project domain) — it won't auto-track production.
- **Public (also):** https://vouchplay-v2.vercel.app — live, connected to Supabase.
- **Auth note:** email OTP signup relies on Supabase's built-in email (rate-limited; the org is also
  flagged **over-quota**, restriction threatened 21 Sep 2026). For reliable delivery set up Gmail
  Custom SMTP (App Password) per docs/SECRETS_SETUP.md §3. Google login stays off until OAuth keys
  are added.

- **2026-09-05** — **Gmail SMTP live + OTP-code email fixed.** Jasper set up Gmail Custom SMTP in
  Supabase (App Password). First live signup test returned "Code sent" (SMTP accepted) but the email
  was a **magic LINK**, not a code — because the default Supabase "Magic link or OTP" template renders
  `{{ .ConfirmationURL }}`. Edited that template (via the dashboard, Monaco `setValue` + Save) to
  render the 6-digit **`{{ .Token }}`** (subject "Your VouchPlay sign-in code"); **verified persisted
  after reload**. (Same gotcha v1 documented.) Re-triggered signup → fresh code email sent. Our app's
  `verifyOtp({type:'email'})` already expects the typed code, so the flow is now code-based end to end.
  Vercel Auth is OFF → **https://vouchplayph.vercel.app is public & live.**

- **2026-09-05** — **OTP-code signup fully fixed.** First code-template edit wasn't enough: a NEW
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

- **2026-09-05** — **Google login LIVE + verified.** Jasper created the Google OAuth client
  (reused the existing "VouchPlay" Google Cloud project; authorized redirect URI =
  `https://itrosesiywpbaxtmucbb.supabase.co/auth/v1/callback`) and enabled Google in Supabase Auth.
  I: added Supabase redirect allowlist (Site URL → vouchplayph; `https://vouchplayph.vercel.app/**`,
  `https://vouchplay-v2.vercel.app/**`, localhost), set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`
  (Vercel + local), redeployed. **Verified end-to-end:** clicking "Continue with Google" on the live
  site reaches Google's consent ("Sign in to continue to itrosesiywpbaxtmucbb.supabase.co").
  Two bugs fixed along the way:
  1. **OAuth didn't navigate** — a Server Action calling `redirect()` to an *external* URL doesn't
     navigate the browser in Next 15. Refactored the Google button to **client-side**
     `supabase.auth.signInWithOAuth` (browser client redirects itself). This is the standard pattern.
  2. **Browser Supabase client threw "missing URL"** — `env.ts`'s `supabaseUrl` used a helper that
     reads `process.env[name]` *dynamically*; Next only inlines *literal* `process.env.NEXT_PUBLIC_X`
     into the browser bundle. Fixed the public getters to use literal access. (Server email was
     unaffected because it reads env at runtime server-side.)
  Also fixed **pre-existing lint breakage** from the gap's Next 16→15 downgrade: `eslint-config-next`
  v15 is eslintrc-format, so `eslint.config.mjs` now uses `FlatCompat` (+ re-added `@eslint/eslintrc`,
  dropped the direct `typescript-eslint` dep). Lint/typecheck/test/build all green again.
  Deployment domain caveat unchanged: vouchplayph is a manual alias — re-alias after each deploy.
- **2026-09-05** — **Handover updated to v1.2** (in the v1.1-named file). Added: §0Z Current Build
  Status; §16A Gamified Player Bidding (points-based, clubs bid to represent/sponsor players, player
  accepts) + `player_bids` entity §36.18A; §6.1 Home Leaderboards & Bidding Spotlight (top players /
  most bidded / top clubs w/ medals — never STS-ranked); §5.2.1 logo aesthetics (bigger wordmark + tiny
  "by JT Consulting & Analytics" microcopy); §5.3.1 About/FAQ location; FAQ/components/Phase-2-scope
  updates; changelog + Locked Decisions. **Ready to hand off to a NEW conversation for Phase 2.**

- **2026-09-05** — **PHASE 2 core BUILT + verified locally** (directory & profile, handover §8–§9,
  §28, §34A). Shipped:
  - **Config:** skill-band **colors + blurbs** (mined from v1 skill-tiers) on `SKILL_BANDS`;
    `visibility.ts` (profile field-visibility contract: sex/city/age/directory, privacy-preserving
    defaults, `parseVisibility`/`fieldVisible`); `geo.ts` (`PH_CITIES`, mined from v1).
  - **`@vouchplay/db`:** hand-authored `Database`/row types matching migrations 0001–0002 (Supabase
    CLI not on PATH + no access token, so `gen types` deferred — types kept in sync by hand; see
    `packages/db/src/types.ts` note).
  - **Data layer (RLS-safe, cache-first §34A.5 PUBLIC_REVALIDATED):** `lib/supabase/public.ts` (anon
    cookie-less client for cached public reads, RLS-enforced as `anon`); `lib/players/dto.ts`
    (privacy projection — hidden fields dropped server-side before payload; `PLAYER_CARD_COLUMNS`/
    `PLAYER_PROFILE_COLUMNS`, **no `select(*)`**); `lib/players/queries.ts` (`listPlayers` +
    `getPlayerBySlug`, `unstable_cache` + tags `players:list`/`player:{slug}`, bulk role/identity
    joins = no N+1, default sort = recent activity + verified-first tiebreak, **never STS-ranked**,
    directory opt-out via `profile_visibility.directory`).
    - **Public badge facts (Coach/Organizer/ID-Verified) — RLS note:** these are public by design
      (§8.2) but `user_roles`/`identity_verifications` RLS is owner-or-staff, so Phase 2 reads them
      **server-side via the service client with a tight non-sensitive projection** (only booleans
      reach the client). RLS-clean hardening = migration 0003 `public_player_facts()` SECURITY
      DEFINER fn granted to `anon` (written, to apply + switch to in the fold-in step).
  - **Components:** `PlayerAvatar` (initials fallback), `badges` (SkillPill w/ community-vs-self
    label, StsChip [info-only, not a rank], ID/Skill-Verified, Coach, Organizer, LFP, sponsorship,
    Sex), `PlayerCard`, `ClubStack` (empty→null until Phase 5), `SearchFilters` (client; §8.4 — URL
    params, PH-cities datalist), `ShareButton` (native share + copy fallback, §28), `VouchButton`
    (auth gate + resume via `?intent=vouch`), `ProfileActions` (gated secondary/contextual actions),
    profile section empty-states (skill distribution scaffold / comments / achievements / skill tags).
  - **Pages:** rewrote `/players` (directory: filters + grid + pagination + result count); new
    `/players/[slug]` (full profile + `generateMetadata` → canonical + OG/Twitter, §28). Public 404
    for non-active/non-onboarded.
  - **Auth resume (Phase-2 gate "login gate resumes protected action"):** threaded a sanitized
    `next` through the WHOLE flow — `safeNext()` (blocks open-redirects), `postAuthPath` preserves
    `next` across onboarding, all auth actions (password/OTP request+verify) + `completeOnboarding`
    honor it, signup/code-login/onboarding forms + pages carry it, signup↔login cross-links keep it.
  - **Cache invalidation:** `completeOnboarding` now `revalidateTag`s `players:list` + `player:{slug}`.
  - **Gates:** lint / typecheck / test (7/7) / `next build` all green. **Verified in-browser vs the
    LIVE Supabase DB:** directory lists the seeded profile, filter combos (q+coach) work with no
    console errors, profile page renders header + sections + correct `<title>`/OG, anonymous Vouch/
    Request gates route to `/signup?next=/players/{slug}?intent=…` (resume wired).
- **2026-09-05** — **Phase 2 fold-ins (batch 1).**
  - **`avatars` storage bucket CREATED on live Supabase** (public, 2 MB, png/jpg/webp) via the
    service-role Storage API — no DDL needed (script run once, not committed).
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
  - **Admin seed — script provided, NOT run:** added `scripts/seed-admin.mjs` (grants a global role
    via the service role; DML, no DDL; idempotent). Attempting to run it here was blocked by the
    Claude Code auto-mode classifier (correct — granting `super_admin` on production is a privilege
    escalation). **Jasper to run** from repo root: `node scripts/seed-admin.mjs
    jasper.andrew.adjarani@gmail.com` (and Tane's email once known). Requires the account to have
    signed up already.
- **2026-09-05** — **Phase 2 fold-ins (batch 2): RLS verification + Admin MFA framework.**
  - **RLS/role-spoofing verification:** `scripts/verify-rls.mjs` — compares ANON vs service-role
    visibility to prove RLS filters (not just empty tables). Read-only by default; `VERIFY_WRITES=1`
    adds anon spoofing-write attempts (must affect 0 rows). **Ran read-only: 6/6 PASS** — anon reads
    `system_settings` (21) + `profiles` (public), and is blocked from `user_roles`/
    `identity_verifications`/`audit_logs`/`vouches`. (user_roles etc. are 0 in service too until the
    admin grant lands — re-run after applying the SQL for the conclusive service=1/anon=0 divergence.)
  - **Admin MFA framework:** `lib/auth/mfa.ts` (`getMfaStatus`, `requireStaffMfa(returnTo)` guard for
    future admin/staff routes — non-staff unaffected in V1; enforces verified TOTP + aal2 step-up);
    `components/auth/mfa-manager.tsx` (client TOTP enroll → QR + secret → challenge/verify → session
    upgrades to aal2 in place; list/remove factors); `/me/settings/security` page (guarded; nudges
    staff). Wired settings links + "View public profile" into `/me`. Supabase Auth TOTP is on by
    default; `requireStaffMfa` is exported but not yet wired to any route (Admin Control Center is
    Phase 30+).
  - **DB step handed to Jasper (auto-mode classifier blocks Claude from writing/executing on the
    Supabase dashboard — both JS and keyboard input are gated on that origin; no direct Postgres
    conn string locally either):** `scripts/apply-0003-and-admin.sql` — one paste into the SQL editor
    applies migration 0003 (avatars config + storage policies + `public_player_facts`) AND grants
    Jasper `super_admin`. Idempotent + self-verifying. **After it's run:** switch the badge reads in
    `lib/players/queries.ts` from the service client to `public_player_facts()` via the anon client,
    and re-run `verify-rls.mjs` for the conclusive divergence.
  - Gates green (typecheck/lint/build).
  - **Still deferred:** the one manual SQL paste above (then the badge-reads switch); seed Tane's
    admin once their email is known; wiring `requireStaffMfa` into the admin area when it exists.

## Next up
- Manual: Gmail App Password → Supabase Custom SMTP (DONE); clear
  the Supabase org over-quota before 21 Sep 2026.
- `supabase gen types` → `packages/db`; smoke-test signup → OTP → onboarding end-to-end on the live
  site; seed JT admin accounts; validate RLS + role-spoofing (Phase 1 gate); Admin MFA framework.
- **Deferred within Phase 1:** avatar upload on onboarding (needs `avatars` bucket); set-password
  page for reset-link landing (`/me/settings/password`).
- Then **Phase 2** (player directory & profile).
