# VouchPlay v2 — Leaderboard, Resilience, Directory, and Media-Normalization Plan

> **Addendum v1.13 — Tournament demand signal, Club Administration, and dark-first Home.** This
> addendum is an approved extension of the active hardening plan. It deliberately does **not** turn
> interest into registration, a reserved slot, eligibility, or a marketing-consent list.

## 1A. Tournament demand-signal contract

- A public, published or registration-open tournament may collect one expression of interest per
  signed-in player or per anonymous browser. The anonymous path uses a random, HTTP-only first-party
  cookie whose HMAC is stored; it never fingerprints a device, stores the raw token, or collects PII.
  Cookie clearing/new browsers can produce a new count, so the UI calls this an *interest estimate*,
  never a verified unique-player total.
- The visitor selects a demand taxonomy before the count is recorded: Beginner, Novice, Low
  Intermediate, High Intermediate, or Advanced × Men’s/Women’s/Mixed, plus 50+ Men’s/Women’s/Mixed.
  This taxonomy informs planning only; it does not create a tournament division or determine skill,
  age, eligibility, registration priority, or a slot.
- Public detail shows an aggregate count, a capped overlapping stack of only public signed-in profile
  avatars, and an accessible division-count dialog. Anonymous interest is intentionally never
  identifiable. The dialog shows aggregate counts, not names or per-division identities.
- After a successful anonymous response, the user may create an account, complete a profile, or
  create/join a club for when registration opens. Copy must state plainly that no slot is held.
- A new private-RLS table, SECURITY DEFINER write RPC, HMAC cookie, status validation, bounded daily
  anonymous limit, explicit Admin settings, audit-safe aggregate read, and cache invalidation protect
  the flow. Direct anon/auth table access and RPC execution remain denied.

## 1B. Administration and home UX

- `/admin/clubs` is a discoverable AAL2 Admin surface for every non-deleted club, with verification
  and activity controls reusing the existing audited Staff actions. It complements, rather than
  weakens, the focused Staff moderation queue.
- Home leads with the three concise Discover Players → Build Trust → Play More cards, then Community
  Leaderboards. Leaderboard cards use a trophy/medal visual cue while retaining text labels; supporting
  copy is shortened.
- Dark is the first-render default independent of OS preference. The existing explicit Light/Dark
  choice remains available; a prior user choice is respected.

## 1. Prompt Contract

### In scope

- Make date of birth optional for public `LEADER_V1` ranking: an unknown DOB no longer excludes a
  public, otherwise eligible player; a supplied DOB below the configured minimum age still excludes
  that player.
- Ship a bounded client-side resume recovery for mobile/browser tabs suspended while unused, without
  background polling or shared-cache bypasses.
- Add a URL-preserved compact Players-directory view that prioritizes quick player recognition,
  labelled skill colour/source, and STS confidence. Detailed cards remain available.
- Normalize every newly uploaded player avatar, club logo, and image payment proof server-side before
  storage. Images must be decoded, auto-oriented, metadata-stripped, dimension-bounded, and emitted
  as adaptive WebP; payment-proof PDFs remain private, validated documents and are not rasterized.
- Clean up a just-uploaded public avatar or club-logo object if its database write fails, and remove a
  superseded generated public image only after its replacement is committed.
- Update the locked handover, execution notes, migration/apply script, and a Phase 14 handover.

### Out of scope

- No age-verification product, account-creation rule, Realtime subscription, polling loop, ranking
  algorithm change, or Most Bidded work.
- No client-side image processing, changes to CSL, STS, vouch weight, Skill Verified, player
  visibility, RLS, anonymous-voucher protections, payment state transitions, payment-proof retention,
  or destructive retroactive rewriting of existing media.

### Success criteria

- A public player with an unknown DOB is eligible when every other `LEADER_V1` condition passes;
  supplied minors remain excluded.
- Existing Supabase settings change through migration 0018, with a copy in `scripts/`, and preserve
  the Admin setting as the operational override after application.
- A hidden tab refreshes once on return after 60 seconds or a persisted page restore; it never polls,
  does not refresh repeatedly on focus, and exposes a polite refresh status.
- `/players?view=compact` is keyboard-accessible, responsive, preserves existing filters/pagination,
  and renders only avatar/name, labelled skill colour/source, STS, and a profile destination.
- Every new avatar, club logo, and image payment proof is stored as a valid, metadata-stripped WebP
  within its bounded output profile. Invalid/deceptive bytes fail safely with actionable form errors;
  a PDF proof remains a validated private PDF.
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
- Compression is irreversible for newly uploaded images. This is deliberate for public-display media
  and private payment-proof images, where a 2048px, high-quality private derivative retains receipt
  readability. Existing original objects stay untouched; a future retention/backfill decision needs
  its own approved data-migration plan.

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

### Media-normalization flow

One server-only Sharp utility accepts only PNG/JPEG/WebP sources, verifies that decoded bytes match the
declared MIME type, auto-orients, removes metadata, avoids enlargement, adaptively reduces dimensions
and WebP quality, and rejects output that cannot meet a bounded profile. Profiles are: avatar (512px,
250 KB), club logo (768px, 384 KB), and payment-proof image (2048px, 1.5 MB). Generated `.webp` paths
receive immutable cache headers only for public avatar/logo media; proof images remain in the private
bucket and are available only through the existing authorized signed-URL path. PDFs are signature- and
parse-validated, retained as PDFs, and never converted to images.

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
- `[NEW] apps/web/src/lib/images/normalize-upload-image.ts`: server-only adaptive WebP normalizer and
  constrained profiles for public display media and private image proofs.
- `[NEW] apps/web/src/lib/payments/proof-file.ts`: payment-proof preparation, including image
  normalization and safe PDF validation.
- `[NEW] apps/web/src/lib/images/normalize-upload-image.test.ts` and
  `apps/web/src/lib/payments/proof-file.test.ts`: decode/type, output-size/dimensions, metadata,
  unreadable-input, and PDF coverage.
- `[MODIFY] packages/config/src/settings.ts`: fallback default becomes `false`.
- `[MODIFY] apps/web/src/lib/settings.ts`: unknown-DOB fallback becomes `false`.
- `[MODIFY] packages/core/src/leaderboards/eligibility.test.ts`: fixture coverage for optional DOB
  and supplied-minor safety.
- `[MODIFY] apps/web/src/components/app-shell.tsx`: mounts resume recovery once.
- `[MODIFY] apps/web/src/app/(app)/players/page.tsx`: parses `view`, preserves it in pagination, and
  selects detailed versus compact rendering.
- `[MODIFY] apps/web/src/components/players/player-card.tsx`: compact semantic row variant.
- `[MODIFY] apps/web/src/lib/actions/profile.ts`: normalize avatar uploads, use generated WebP paths,
  expose actionable errors, and clean failed/replaced generated objects safely.
- `[MODIFY] apps/web/src/lib/actions/club.ts`: normalize logo uploads before storage and clean failed
  or superseded generated logo objects without widening public storage access.
- `[MODIFY] apps/web/src/lib/actions/payment.ts`: normalize image proofs, retain validated PDFs, and
  clean only a newly uploaded proof when recording the payment fails.
- `[MODIFY] profile, club, and payment upload forms`: explain optimization without obscuring accepted
  formats, limits, private-proof handling, or submit feedback.
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
- [x] Commit/push `main`, wait for Vercel Ready, and verify both production domains.
- [ ] Jasper applies `scripts/apply-0018.sql`, returns verification counts, then triggers an Admin
  rebuild or waits for the scheduled snapshot before claiming the optional-DOB ranking change live.

### Phase 5: Image storage efficiency

- [x] Lock the public/private normalization profiles and the non-retroactive data-retention boundary.
- [x] Add shared normalization and payment-proof preparation with server-side tests.
- [x] Route avatar, logo, and payment-proof writes through the prepared output and transactional
  cleanup paths; update form help text.
- [x] Run all repository gates and controlled private/public storage smoke tests.
- [x] Commit/push `main`, wait for Vercel Ready, and verify both production domains.

## 5. Verification and Safety Protocol

- Automated: pure eligibility/resume fixtures; media decode/type/dimension/byte-bound/PDF fixtures;
  full repository gates; `cmp -s` equivalent hash check between migration and apply copy.
- Manual: simulated hidden/resume and BFCache-style page-show browser checks; 390px and desktop player
  directory checks; screen-reader labels and no horizontal overflow; controlled avatar/logo public URL
  and private payment-proof signed-URL checks confirming generated WebP MIME, bounds, and no EXIF.
- Rollback: Admin can set `leaderboard_exclude_unknown_dob=true` and rebuild snapshots immediately;
  the resume component, compact UI, and media pipeline are isolated, reversible source changes. Revert
  the release commit if a client lifecycle regression appears. Existing media remains intact; do not
  bulk-delete or rewrite it as part of rollback.
