# VouchPlay v2 — Leaderboard Eligibility, Resume Recovery, and Compact Players Plan

## 1. Prompt Contract

### In scope

- Make date of birth optional for public `LEADER_V1` ranking: an unknown DOB no longer excludes a
  public, otherwise eligible player; a supplied DOB below the configured minimum age still excludes
  that player.
- Ship a bounded client-side resume recovery for mobile/browser tabs suspended while unused, without
  background polling or shared-cache bypasses.
- Add a URL-preserved compact Players-directory view that prioritizes quick player recognition,
  labelled skill colour/source, and STS confidence. Detailed cards remain available.
- Update the locked handover, execution notes, migration/apply script, and a Phase 14 handover.

### Out of scope

- No age-verification product, account-creation rule, Realtime subscription, polling loop, ranking
  algorithm change, or Most Bidded work.
- No changes to CSL, STS, vouch weight, Skill Verified, player visibility, RLS, or anonymous-voucher
  protections.

### Success criteria

- A public player with an unknown DOB is eligible when every other `LEADER_V1` condition passes;
  supplied minors remain excluded.
- Existing Supabase settings change through migration 0018, with a copy in `scripts/`, and preserve
  the Admin setting as the operational override after application.
- A hidden tab refreshes once on return after 60 seconds or a persisted page restore; it never polls,
  does not refresh repeatedly on focus, and exposes a polite refresh status.
- `/players?view=compact` is keyboard-accessible, responsive, preserves existing filters/pagination,
  and renders only avatar/name, labelled skill colour/source, STS, and a profile destination.
- Typecheck, lint, tests, formatting, build, migration verification, live deploy, and both-domain
  browser/HTTP checks pass.

### Assumptions and risks

- The current production `leaderboard_exclude_unknown_dob=true` row overrides code defaults, so the
  database change must be applied by Jasper before production behavior changes. The migration is
  intentionally explicit and verifiable.
- Browser suspension is normal mobile-web behavior. The codebase has no `visibilitychange` or
  persisted-page recovery, so stale App Router/auth/network state survives until navigation. The
  recovery refreshes only on resume and leaves cache-first server reads intact.
- Users without DOB can be minors. The requested rule accepts that trade-off; supplied under-age DOB
  remains an exclusion and Admin exclusion/fraud/account/privacy gates remain unchanged.

## 2. System Architecture and Component Specs

### Eligibility flow

`system_settings.leaderboard_exclude_unknown_dob` defaults to `false`. The pure eligibility function
continues to accept the setting, so Admin can restore conservative unknown-age exclusion when needed.
`0018` updates the existing production setting; the bounded snapshot builder continues to pass the
setting into the pure scorer.

### Resume recovery flow

`PageResumeRefresh` is mounted once in the authenticated/public app shell. A pure predicate receives
timestamps and event facts. On `visibilitychange` to visible, persisted `pageshow`, or reconnect after
at least 60 seconds hidden, it invokes one `router.refresh()` transition. A 15-second dedupe window
prevents overlapping refreshes. It performs no work while hidden and does not keep timers alive.

### Compact directory flow

`view=compact` is a sanitized URL parameter. A small two-option control pushes the current player URL
with the parameter added or removed, retaining filters and pagination. `PlayerCard` gains a compact
variant that uses the existing safe `PlayerCardDTO`—there are no new queries, fields, or client fetches.

## 3. File Action Matrix

- `[NEW] apps/web/src/lib/navigation/resume-refresh.ts`: pure resume/dedupe predicate and tests.
- `[NEW] apps/web/src/components/ui/page-resume-refresh.tsx`: client lifecycle listener and polite
  refresh status.
- `[NEW] apps/web/src/components/players/player-view-toggle.tsx`: accessible view selector with
  navigation feedback.
- `[NEW] supabase/migrations/0018_leaderboard_unknown_dob_optional.sql`: changes the seeded setting
  and returns verification counts.
- `[NEW] scripts/apply-0018.sql`: exact SQL-editor copy.
- `[NEW] docs/PHASE_14_RECRUITMENT_SPONSORSHIP_AND_BIDDING_HANDOVER.md`: next-phase scoped handover.
- `[MODIFY] packages/config/src/settings.ts`: fallback default becomes `false`.
- `[MODIFY] apps/web/src/lib/settings.ts`: unknown-DOB fallback becomes `false`.
- `[MODIFY] packages/core/src/leaderboards/eligibility.test.ts`: fixture coverage for optional DOB
  and supplied-minor safety.
- `[MODIFY] apps/web/src/components/app-shell.tsx`: mounts resume recovery once.
- `[MODIFY] apps/web/src/app/(app)/players/page.tsx`: parses `view`, preserves it in pagination, and
  selects detailed versus compact rendering.
- `[MODIFY] apps/web/src/components/players/player-card.tsx`: compact semantic row variant.
- `[MODIFY] VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md`, `notes.md`, and this plan:
  locked rule, operational diagnosis, release record, and handover links.

## 4. Phased Execution Plan

### Phase 1: Lock rules and migration

- [x] Update §6.1, §8.1, §34A.6, §0Z, and the changelog before implementation.
- [x] Add migration/apply copy and copy-byte verification.
- [x] Change code defaults and pure eligibility fixtures.

### Phase 2: Resume resilience

- [x] Implement the pure 60-second/persisted-page/dedupe decision function and unit tests.
- [x] Mount one lifecycle-aware refresh component in the app shell.
- [ ] Validate simulated browser hidden/resume behavior before release.

### Phase 3: Compact Players UI

- [x] Implement URL-safe view parsing and an accessible detailed/compact selector.
- [x] Render a dense, tappable compact row from the existing safe DTO; preserve detailed cards.
- [ ] Test desktop/mobile, filters, pagination, empty states, keyboard use, dark/light, and reduced
  motion.

### Phase 4: Release and handoff

- [x] Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run format:check`, and
  `npm run build`.
- [ ] Commit/push `main`, wait for Vercel Ready, and verify both production domains.
- [ ] Jasper applies `scripts/apply-0018.sql`, returns verification counts, then triggers an Admin
  rebuild or waits for the scheduled snapshot before claiming the optional-DOB ranking change live.

## 5. Verification and Safety Protocol

- Automated: pure eligibility/resume fixtures; full repository gates; `cmp -s` equivalent hash check
  between migration and apply copy.
- Manual: simulated hidden/resume and BFCache-style page-show browser checks; 390px and desktop player
  directory checks; screen-reader labels and no horizontal overflow.
- Rollback: Admin can set `leaderboard_exclude_unknown_dob=true` and rebuild snapshots immediately;
  the resume component and compact UI are isolated, reversible source changes. Revert the release
  commit if a client lifecycle regression appears.
