# VouchPlay v2 - Leaderboard, Resilience, Directory, Media-Normalization, and Tournament Reliability Plan

> **Addendum v1.13 - Tournament demand signal, Club Administration, and dark-first Home.** This
> addendum is an approved extension of the active hardening plan. It deliberately does **not** turn
> interest into registration, a reserved slot, eligibility, or a marketing-consent list.

> **Addendum v1.16 - Next-phase tournament reliability, registration flexibility, and copy review.**
> This is a planning-only addendum. No application code, schema change, or production behavior is
> changed by this document update. It is the required starting scope for the next implementation
> conversation, before Phase 14 Recruitment, Sponsorship, or Gamified Bidding.

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

## 1C. Tournament navigation and registration refinement

- **Copy rule:** Do not use em dashes anywhere in product copy, placeholders, help text, plans, or
  handovers. Helper text must be a single concise sentence unless a legal or safety obligation needs
  more. Prefer a clear label, an info control, progressive disclosure, and task-specific feedback.
- Interest confirmation says only: “Your interest has been counted. This is not registration or a
  reserved slot.” Anonymous users then see a short account/profile invitation. A Looking for partner
  control reveals compatible public profiles without exposing private data.
- Each demand division displays a proportional interest bar. Each real tournament division displays a
  separate registration bar using active team registrations against configured capacity. Doubles fees
  are shown as the configured team fee divided by two, labelled “per player”; payment collection and
  review continue to use the configured team amount.
- The player-facing division card is collapsible and is the single place for public division facts,
  fee, meter, skill guidance, partner search, and registration. Existing transactional registration,
  invitation, payment, and eligibility logic remains the authority.
- Skill messaging is progressive: a compact warning identifies a possible division mismatch using
  Community Skill Verified, then unverified Community Skill, then self-rating only when community
  evidence is absent. The detailed evidence explanation is behind an accessible info control.
- Organizer discovery starts with the same public published list as a player, including events the
  organizer owns/co-organizes. A “My tournaments” control expands the private list and defaults to
  hiding draft, cancelled, and archived entries. Co-organizer search uses a debounced account picker,
  then retains the existing active-Organizer-role authorization on submit.
- Payment QR is a private, normalized organizer upload tied to the tournament. A short-lived signed
  URL is shown only in the authenticated payment-proof step. It is not a gateway, does not confirm
  payment, and does not replace the existing proof upload and organizer review.

## 1D. Player registration-first tournament management

- A signed-in player with an active registration sees **My registration** immediately after the
  tournament header, before the division browser. It shows division, team, status, payment action,
  and concise safe management controls. It never exposes another player’s payment or private facts.
- Tournament cards show separate aggregate **interested** and **joining** counts below place/date.
  A signed-in viewer’s own interested or active-registration state is labelled with an icon and text;
  neither state is inferred from colour alone.
- The public division browser is collapsed by default. Expanding a division reveals its capacity bar,
  per-player fee, eligibility guidance, partner search for doubles, and the appropriate registration
  action. Registered players do not need to scan every division to find their own entry.
- Player cancellation is available only while tournament registration is open and is auditable. A
  division move is permitted only while the feature is enabled, registration is open, the entry is
  still payment-pending with no submitted proof, the team fits the target division, and the target
  has a real immediately available slot. The atomic operation retains the original hold deadline,
  recalculates eligibility, and records old/new division facts. It never silently waitlists or
  charges a player.
- A partner cannot be unilaterally replaced after registration. Before payment proof is submitted,
  the player may cancel the registration and form a new team; after proof, confirmation, lock, or
  close, only the organizer may resolve a change. This prevents a teammate or payment record being
  displaced without their knowledge. These limits are live Admin settings, not hardcoded.
- The organizer picker accepts only active approved Organizer, Admin, or Super Admin accounts. The
  server uses an existence check rather than a single-row assumption, so an account holding more
  than one qualifying role is not falsely rejected.

## 1E. Next phase: tournament reliability and registration flexibility

- **Payment QR reliability:** reproduce the organizer save failure against a controlled tournament
  before changing code. First verify migration 0020 and the `payment_qr_path` column, then trace the
  form payload, normalization, private Storage upload, database update, cache invalidation, and
  reload. A successful replacement must upload the new private object first, update the row only
  after that succeeds, retain the prior QR if any later step fails, and remove an orphaned new object
  best-effort. The organizer receives a specific actionable error, never a false success or a
  disappearing QR. The player payment screen receives a short-lived signed QR URL only when the
  authenticated registration is entitled to view it. This remains manual proof and review, not a
  payment gateway.
- **Long-idle browser reliability:** diagnose the observed client-side application error with
  production-safe error telemetry, browser console evidence, App Router error boundaries, and
  controlled idle/BFCache/session-expiry tests. Extend the existing bounded resume recovery only if
  evidence shows it is insufficient. Recovery must preserve the current route and unsaved work where
  possible, offer a clear retry or sign-in path when auth is stale, avoid polling and refresh loops,
  and never expose private error payloads to the browser.
- **Club representation changes:** retain the existing player-and-tournament representation source of
  truth. Players may edit their own eligible club representation even after payment submission or
  confirmation until the tournament-wide `club_lock_at` deadline. The organizer manages one clear
  all-divisions control, expressed as an optional lock date/time, rather than per-division exceptions.
  A locked player request fails server-side; an authorized organizer or Admin override requires a
  reason and immutable audit. Changes never alter payment state, team membership, fee, eligibility,
  or historical organizer export facts without an explicit refresh/audit event.
- **Multiple tournament entries:** a player may hold active entries in multiple distinct divisions in
  the same tournament, for example Men's and Mixed Doubles, up to the tournament's configured
  per-player division maximum. The system must still prohibit two active teams or registrations for
  the same player in the same division, preserve per-entry capacity, hold, eligibility, payment, and
  waitlist behavior, and surface a schedule-conflict warning when usable division scheduling data
  exists. Do not use a broad one-registration-per-tournament guard.
- **Registration panel:** replace the single-entry assumption with a default-collapsed **My
  registrations (N)** summary immediately after tournament details. Each entry shows division, team,
  status, and the next valid action; expansion exposes only authorized actions. It remains accessible,
  keyboard-operable, screen-reader labelled, and concise on mobile.
- **Home copy cleanup:** conduct a route-by-route content audit before changing wording. Use canonical
  capitalization for product terms, remove redundant or non-actionable helper text, retain required
  safety/privacy/payment disclosure, and use progressive disclosure for genuinely necessary detail.
  Product copy, placeholders, help text, plan, and handover additions must remain free of em dashes.
- **Next-phase boundaries:** do not build a payment gateway, automated settlement, recruitment,
  sponsorship, bidding, Most Bidded, partner-matching recommendations, a new public identity surface,
  or any score/eligibility linkage. Preserve append-only audit logs, server authorization plus RLS,
  private payment evidence, anonymous-voucher protections, and the Next 15/Vercel deployment
  workaround.

### 1E acceptance and release requirements

- QR upload is proven by organizer upload, save, hard reload, safe replacement, and a controlled
  eligible-player payment-screen check. Direct anonymous and unrelated-player Storage/API access is
  denied. Migration 0020 is confirmed before any QR code diagnosis is closed.
- A stale Chrome and mobile-browser tab is tested after a realistic idle interval, BFCache return, and
  expired-session path. The page either resumes safely or presents a recoverable, accessible retry or
  sign-in state, with no generic client-side crash screen.
- Controlled accounts prove one player can register in two permitted divisions while duplicate
  same-division entry is rejected atomically. Capacity, waitlist promotion, payments, eligibility,
  cancellation, division movement, and exports remain correct per registration.
- Club edits are permitted after payment and confirmation before the organizer's single tournament
  deadline, denied afterward except for a reasoned organizer/Admin override, and recorded in
  immutable audit/history without changing payment or team facts.
- My registrations is collapsed by default and reveals correct per-entry actions. Home copy passes a
  keyboard, screen-reader, mobile, desktop, dark, light, loading, empty, and error-state review.
- Any schema work follows inspection of live `tournaments`, registrations, teams, payment, club
  representation, Storage, RLS, settings, and audit records. Use the next confirmed migration number,
  copy it exactly to `scripts/apply-00NN.sql`, have Jasper apply it in SQL Editor, and record exact
  verification counts before claiming new database behavior is live.

## 1F. Launch welcome pop-up (2026-09-08)

Built for the public launch night ahead of the B-Steel Hermosa 2026 Grand Pickleball Tournament -
Rise of Empires, whose registration opens the following day at 5:00 PM.

- A near-full-screen, one-tap-dismissible announcement dialog shown **once per visitor per version**,
  on whichever route the shared link lands on. It reuses the existing accessible `Modal` (Escape,
  overlay click, and a 44 px labelled close control) with a new `size="lg"` variant.
- **All copy, the image, the event link, the version, and the on/off switch are Admin settings**, so a
  campaign can be changed, re-shown, or killed without a deploy. This is deliberate: the message must
  change from "Registration opens Sep 9 at 5:00 PM" to "Registration is OPEN" during the busiest hour
  of the launch, and a deploy at that moment is an unacceptable risk. Bumping
  `welcome_modal_version` re-shows the dialog to everyone.
- Settings only, **no migration**: `system_settings` rows merge over the shipped code defaults.
- The dialog renders nothing during server rendering and decides only after mount, because the
  "already seen" flag lives in `localStorage`; reading it during render would diverge from the server
  and trip a hydration mismatch.
- Conversion logic: the primary action is **Create free account**, because an account made on launch
  night makes registration fast the next day. A signed-in visitor is instead offered **See the
  tournament**. There is always a plain "Maybe later" exit alongside the X.
- Copy safety rule: the pop-up must never promise a reserved slot. Signing up does not hold a place,
  and the interest flow already states this. The launch line is "Sign-up now to register tomorrow."
  Event timing uses an **absolute date**, never "tomorrow", because the dialog can be seen after
  midnight.
- Mobile-first sizing: the image is 3:2 on phones and 16:9 from `sm` up, so the primary button stays
  above the fold on a 375 x 812 device without scrolling.

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
variant that uses the existing safe `PlayerCardDTO`-there are no new queries, fields, or client fetches.

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
