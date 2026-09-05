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

## Next up
- **Waiting on secrets** (Jasper setting up per docs/SECRETS_SETUP.md): Supabase URL + anon +
  service_role; Google OAuth client id/secret; Gmail App Password. Into `apps/web/.env.local` +
  Supabase SMTP.
- **Then (no more code blockers for auth):** `supabase link` + `db push` (apply 0001/0002),
  `supabase gen types` → `packages/db`, smoke-test signup/login/Google/onboarding end-to-end,
  validate RLS + role-spoofing, seed JT admin accounts, Admin MFA framework (Phase 1 gate).
- **Deferred within Phase 1:** avatar upload on onboarding (needs `avatars` bucket); set-password
  page for reset link landing (`/me/settings/password`).
