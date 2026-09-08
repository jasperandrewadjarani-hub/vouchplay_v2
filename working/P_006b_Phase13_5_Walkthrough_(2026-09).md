# Phase 13.5 Walkthrough - Tournament Reliability and Registration Flexibility

**Date:** 2026-09-08
**Status:** Code complete, all local gates green. NOT pushed. Awaiting Jasper's push go-ahead and
controlled authenticated browser verification. No SQL migration to apply this slice.
**Spec:** `docs/PHASE_13_5_TOURNAMENT_RELIABILITY_AND_REGISTRATION_FLEXIBILITY_HANDOVER.md`,
`master_plan.md` §1C-§1E.

## Summary of changes

### 1. Payment QR reliability (organizer + player)
- **Root cause:** the upload/replace path in `updateTournament` was already transactional (upload new
  private object, persist path only on success, retain old path on failure, best-effort delete the
  superseded object). The reported "save/reload failure" was organizer-side feedback: the file input
  clears on reload and `TOURNAMENT_DETAIL_COLUMNS` never selected `payment_qr_path`, so the manage
  form could not prove the QR persisted.
- **Fix:** added `payment_qr_path` and `club_lock_at` to `TOURNAMENT_DETAIL_COLUMNS`; the detail DTO
  now carries a `paymentQrUrl` (canManage-gated, 5-minute signed URL) and `clubLockAt`. The raw path
  is read server-side only and never placed in the DTO or sent to the browser. The tournament form
  shows a persistent private-QR preview and a "Payment QR saved" confirmation after save.
- The player payment path already minted a correct 60-second signed QR URL at the authorized payment
  step; unchanged.
- Migration 0020 verified already applied live (`payment_qr_path` present and populated).

### 2. Long-idle browser recovery
- `PageResumeRefresh` (60s idle / persisted-restore, deduped `router.refresh`) already existed and is
  mounted in the app shell; unchanged.
- Added the missing route-aware `app/(app)/error.tsx` (accessible retry, plus a sign-in/resume link
  when the error is auth-stale) and root `app/global-error.tsx`.
- Added `/api/client-error`, a privacy-safe telemetry sink accepting an allowlist only (route,
  digest, error name, visibility, persistedRestore, authStale, deployVersion, scope). It never
  accepts the error message, tokens, form values, or PII.
- Added build-time `NEXT_PUBLIC_DEPLOY_VERSION` (short commit SHA on Vercel).
- New pure `lib/navigation/error-telemetry.ts` (auth-stale classifier + payload builder) with 4 unit
  tests.

### 3. Club representation
- `setClubRepresentations` already enforced the single tournament-wide `club_lock_at` deadline and was
  independent of payment/confirmation state, so edits after payment or confirmation were already
  allowed up to the lock. Added an immutable `audit_logs` record (before/after club ids) on every
  player edit.
- New `overrideClubRepresentations` server action for authorized organizer (edit permission) or staff
  Admin: requires a reason, writes `organizer_override=true` + `override_reason`, appends an audit
  record, and never changes team, division, fee, payment state, or eligibility.
- Added a single all-divisions club-lock date/time control to the tournament manage form
  (`clubLockAt`, validated, no per-division exception).

### 4. Multiple entries
- Verified against live schema and RPCs: no one-per-tournament guard exists anywhere.
  `register_team`/`registerSolo` operate per division; the same-player/same-division prohibition is
  enforced procedurally (doubles `partner_conflict`; singles active-team reuse + `already_registered`).
- No schema change required.

### 5. My registrations (N)
- New default-collapsed `MyRegistrationsSummary` placed immediately after the tournament details.
  Native `details`/`summary` for keyboard and screen-reader support; per-entry division, team, status
  (icon plus text, never colour alone), and next valid action. The registration panel below was
  de-duplicated to "Your entries and divisions" with plural-safe copy.

### 6. Home copy
- No em dashes anywhere in app source (verified programmatically). Fixed one awkward "support-not"
  hyphen-as-dash on Home to a clean single sentence.

## Verification results

- `npm run typecheck` - clean.
- `npm run lint` - clean.
- `npm run test` - web 30 (incl. +4 error-telemetry), config 19, core 95; all pass.
- `npm run format:check` - clean.
- `npm run build` - Next 15.5.25, 42 pages (up from 40: +`/api/client-error`, +error boundaries).
- `node scripts/phase13-5-abuse.mjs` - 7/7 pass: anon cannot download the private QR object or mint a
  signed URL; club representations and audit_logs are RLS-blocked from anon; privileged registration
  RPCs are permission-denied; anon registration insert is RLS-denied.
- Signed-out browser smoke (Home + a public tournament page): clean console, correct render, and the
  My registrations summary correctly absent for anonymous viewers.

## Not yet done (requires Jasper / real sessions)

- Commit/push `main`, wait for Vercel Ready, verify both production domains over HTTP and in a browser.
- Controlled authenticated browser tests: QR upload/save/hard-reload/replace + player proof screen;
  idle return / BFCache / expired-auth recovery; two-division registration with same-division
  rejection; club edit before/after lock plus reasoned organizer/Admin override; My registrations
  expansion and per-entry actions.

## Key files

- `apps/web/src/lib/tournaments/dto.ts`, `queries.ts` - detail columns + gated `paymentQrUrl`,
  `clubLockAt`.
- `apps/web/src/components/tournaments/tournament-form.tsx` - QR preview/confirmation + club-lock field.
- `apps/web/src/app/(app)/error.tsx`, `apps/web/src/app/global-error.tsx`,
  `apps/web/src/app/api/client-error/route.ts`, `apps/web/src/lib/navigation/error-telemetry.ts`.
- `apps/web/src/lib/actions/registration.ts` - player-edit audit + `overrideClubRepresentations`.
- `apps/web/src/lib/actions/tournament.ts`, `packages/validation/src/tournament.ts` - `clubLockAt`.
- `apps/web/src/components/tournaments/my-registrations-summary.tsx` (new); `registration-panel.tsx`.
- `apps/web/src/app/(app)/page.tsx` - Home copy fix.
- `scripts/phase13-5-audit.mjs`, `scripts/phase13-5-abuse.mjs` (new verification scripts).
