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

## UI/UX follow-up pass (2026-09-08, after Jasper review)

Requested changes after the first production release. All shipped in the same phase.

1. **Club representation override control (built the missing UI).** The override action existed
   server-side but had no trigger. Added `getClubOverrideParticipants` (bounded per-player: current
   clubs + selectable active-membership clubs) and a `ClubOverrideControl` in a collapsed
   "Club representation override" section on the manage page. Organizer/Admin picks a player, sets
   clubs, gives a required reason, and the audited action writes the override.
2. **Register in other divisions when you already have an entry.** Root cause: when a tournament was
   not `registration_open`, the old panel showed only your registered division and a read-only
   division list with no register buttons; even when open, registration lived in a separate panel.
   Replaced with a single always-present, collapsed **Divisions (N)** browser where every division
   expands to its facts and the correct register action for a signed-in player, so a player with one
   entry can enter more divisions. Divisions you already hold link back to My registrations.
3. **Merged "Your entries and divisions" into "My registrations".** There is now one collapsed
   "My registrations (N)" manager (entries, status, payment, cancel/move, change-partner) plus the
   separate Divisions browser. The old `RegistrationPanel`, `DivisionList`, and
   `MyRegistrationsSummary` components were deleted.
4. **Progressive help text.** New reusable `InfoDisclosure` ("i" control). Change-partner guidance,
   the skill-mismatch note, and the leave-team control are now behind a tap instead of always-on
   blocks. Removed the "Other divisions stay collapsed until you open them" helper text.
5. **Home / leaderboard copy de-cluttered.** Removed the `LEADER_V1` scoring-version tag, the
   "no raw STS ranking" footer line, and the wordy "No eligible activity in this scope and period
   yet. Private momentum may still be available." Empty boards now read simply "No rankings yet."
6. **Home hero copy.** Headline is now "Your game, vouched for by the players you play with." and the
   subtext "Find players, build a trusted profile, climb the leaderboards, and play more."

Not deferred to a later phase: every item above is UI/UX and copy polish that belongs to this
hardening slice. None touch Phase 14 (Recruitment, Sponsorship, Bidding) scope, and none change any
ranking algorithm, eligibility, CSL/STS, vouch weight, or payment-state logic.

New/changed files: `apps/web/src/components/ui/info-disclosure.tsx`,
`apps/web/src/components/tournaments/my-registrations.tsx`,
`apps/web/src/components/tournaments/division-browser.tsx`,
`apps/web/src/components/tournaments/club-override-control.tsx`,
`apps/web/src/lib/tournaments/registration-queries.ts` (`getClubOverrideParticipants`),
`apps/web/src/app/(app)/tournaments/[slug]/page.tsx` and `.../manage/page.tsx`,
`apps/web/src/components/leaderboards/leaderboard-panel.tsx`, `apps/web/src/app/(app)/page.tsx`.
Deleted: `registration-panel.tsx`, `division-list.tsx`, `my-registrations-summary.tsx`.

## UI/UX + bug-fix pass 2 (2026-09-08)

Second round of Jasper feedback. No migration.

**Bugs fixed**
1. **Payment QR not visible to a paying player.** `getViewerRegistrationState` gated the signed QR on
   a payment-row status (`pending`/`rejected`), but a fresh `payment_pending` entry has no payment row
   yet, so the QR never showed. Now gated on the registration status
   (`payment_pending`/`payment_submitted`) or a rejected proof, matching where the payment form
   renders. Signed URL TTL raised to 300s.
2. **Cancel then re-register friction / "leave team" error.** Cancelling a registration now dissolves
   the team in one step: it removes members, marks the team disbanded, writes an audit record, and
   notifies the partner. The player can immediately register again (the doubles division shows the
   partner invite again). This removes the separate "leave team" step that was erroring and the
   partner is properly notified. The change-partner guidance was updated to the one-step flow.

**UI tweaks**
3. **Interest modal** no longer prints the "Your interest has been counted..." line twice (it was in
   both the modal subtitle and body).
4. **Dark is already the first-render default** (`defaultTheme="dark"`, `enableSystem=false`) - verified,
   no change needed.
5. **Top bar stays dark in light mode.** New `.vp-topbar` utility re-pins the dark palette tokens (and
   an explicit `color`) on the header so the logo, bell, and profile area never lighten under the
   light theme.
6. **Register button expands the division browser.** The upper Register control (and a shared
   `?register=1` link) now opens the collapsed Divisions `<details>` and scrolls to it.
7. **Skill-coloured meters.** The interest-by-division bars and the real-division capacity/joining bars
   are coloured by skill band (Beginner green, Novice teal, Low Intermediate blue, High Intermediate
   violet, Advanced orange; age/open/custom use the brand primary). Counts and labels remain, so
   colour is never the only signal.
8. **Copy trims:** shorter file hints, a clearer "this entry can no longer be changed" line, and a
   tighter anonymous register prompt.

None of these are deferred to a later phase.

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
