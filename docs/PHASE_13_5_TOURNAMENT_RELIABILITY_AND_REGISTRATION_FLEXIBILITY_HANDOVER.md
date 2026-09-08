# VouchPlay Phase 13.5 Handover - Tournament Reliability and Registration Flexibility

**Status:** Planning complete. Execute in a new conversation only.
**Purpose:** Resolve the reported production-path failures and deliver the already locked registration
rules before any Phase 14 Recruitment, Sponsorship, or Gamified Bidding work.

## Read first

1. `CLAUDE.md` and `AGENTS.md`, including the active Next 15/Vercel workaround. Keep Next 15.5.25,
   root `vercel.json`, root `next` dependency, and `middleware.ts`.
2. Newest `notes.md` entries.
3. `VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md`, especially §0Z, §19, §21, §22,
   §23, §26, §33.5A, §34A, §36.25A, §36.26, §37, §38, §53, and the v1.16 changelog.
4. `master_plan.md` §1C through §1E and this handover.
5. Inspect live schema and RLS before planning a migration: `tournaments`, divisions, teams,
   team_members, registrations, registration_events, payments, payment proofs, club
   representations, clubs, memberships, `system_settings`, `audit_logs`, and relevant Storage
   buckets/policies.

## Scope contract

### In scope

- Reproduce and fix the organizer Payment QR upload/save/reload failure, then prove the existing
  player manual-payment path can display an authorized short-lived QR URL.
- Diagnose and fix the generic client-side error that appears after a Chrome or mobile tab has been
  unused for a long time.
- Allow player club-representation edits after payment submission and registration confirmation until
  an organizer-configured tournament-wide deadline, using the existing `club_lock_at` model where it
  satisfies the requirement.
- Allow a player to enter multiple distinct divisions in the same tournament, such as Men's and Mixed
  Doubles, while retaining a strict same-player, same-division active-team prohibition.
- Make **My registrations (N)** appear after tournament details but collapsed by default, with each
  registration's valid actions inside the expanded state.
- Audit Home copy for concise, useful, consistently capitalized language. Remove redundant helper
  text but retain required privacy, safety, payment, and legal disclosure.

### Out of scope

- Payment gateway, automated settlement, card or wallet collection, and automated payment approval.
- Recruitment, sponsorship, Gamified Bidding, Most Bidded, or any leaderboard change.
- Broad partner-matching recommendations, ranking/eligibility changes, raw STS displays, or changes
  to CSL, STS, Skill Verified, vouch weight, contribution, or eligibility.
- New public exposure of payment, club-membership, fraud, or anonymous-voucher facts.

## Locked product and safety rules

### Payment QR

- Payment QR is a private normalized image stored separately from public tournament media. It is
  visible only through a short-lived signed URL in the authenticated and authorized payment step.
- It supports the current manual proof-and-review flow. It is never represented as payment
  confirmation, a reserved slot, or a payment gateway.
- Upload replacement is transactional in effect: prepare and upload the new private object first,
  persist `payment_qr_path` only after success, retain the old path on any failure, then best-effort
  remove superseded generated storage only after persistence succeeds. Never silently clear the UI.
- First verify migration 0020 with `payment_qr_column=1`; do not infer its presence from deployed
  code. Inspect errors and policies before changing behavior.

### Long-idle browser recovery

- A suspended mobile or Chrome tab is normal. A generic application error is not an acceptable
  recovery state.
- Capture route, error digest, visibility/BFCache state, auth-refresh result, and deployment version
  using privacy-safe telemetry. Do not send form values, payment evidence, tokens, or profile details.
- Prefer a bounded resume refresh only when necessary. Add a route-aware error boundary with a clear
  retry and, when authentication is stale, a sign-in/resume route. Do not poll, thrash focus, or erase
  unsaved user input.

### Club representation

- `tournament_player_club_representations` remains the player-and-tournament source of truth and is
  independent of division/team membership.
- One tournament-level organizer control applies to every division. It sets an optional lock date/time
  using `club_lock_at`; no per-division lock exception may be introduced.
- Before the deadline, eligible active club members may update their own representations, even after
  proof submission or confirmation. After it, only an authorized organizer/Admin can override with a
  required reason and immutable audit record.
- A representation edit cannot change the team, division, fee, payment state, capacity, eligibility
  decision, or original payment proof. Exports must show a documented current or historical view and
  never silently rewrite an already-issued record.

### Multiple entries and My registrations

- A player may have active entries in separate divisions of one tournament, subject to the configured
  tournament maximum. They may not be on two active teams in the same division.
- Every entry keeps its own eligibility, team, slot hold, waitlist, payment, cancellation, and
  registration-event history. A failure in one entry must not cancel or mutate another.
- Detect a schedule conflict only when usable schedule data exists. Present it as a warning unless the
  organizer has an explicit locked conflict policy.
- My registrations is a collapsed-by-default summary immediately after tournament details. It must
  display the count and per-entry status without relying on colour alone, retain keyboard and screen
  reader support, and meet §33.5A while actions are pending.

### Copy

- Do not use em dashes anywhere in product copy, placeholders, help text, plans, or handovers.
- Use canonical capitalization from the product glossary. Helper text should be one concise sentence
  unless safety, privacy, or legal context genuinely requires more. Prefer a label, an info control,
  or progressive disclosure over explanatory blocks.

## Execution plan

### 1. Evidence and schema audit

- Reproduce the QR issue with a disposable organizer/tournament and preserve request, server, Storage,
  database, and reload evidence. Confirm whether migration 0020, private bucket access, file
  preparation, the form field, or cache invalidation is the first failing boundary.
- Reproduce long-idle behavior in Chrome and mobile emulation with normal idle return, BFCache return,
  expired auth, and a navigated-back page. Classify each outcome before changing the resume code.
- Inspect the actual registration uniqueness constraints, active statuses, existing per-player division
  limit, club lock UI/data, exports, RLS, RPC grants, and audit patterns. Do not assume the source
  schema equals the live project.

### 2. Domain and migration design

- Keep domain logic pure and tested in `@vouchplay/core`. Use a transactional SECURITY DEFINER RPC for
  any multi-table registration or post-lock organizer override.
- Reuse `club_lock_at` if it fully expresses the single tournament-wide deadline. Add a new migration
  only for an evidenced missing invariant, using the next confirmed number and an exact
  `scripts/apply-00NN.sql` copy.
- Enforce all player self-service authorization server-side and through RLS. Audit every state change;
  preserve payment evidence and registration history.

### 3. UI and resilience work

- Repair QR upload feedback and reload behavior, then make the authorized player payment view usable.
- Provide a compact, default-collapsed My registrations summary, multiple-entry-safe division actions,
  organizer-wide club-lock control, and clear post-lock reasoned override.
- Add accessible recovery states for stale browser/app-router failures. Maintain dark/light, reduced
  motion, mobile, desktop, keyboard, and screen-reader quality.
- Complete the Home content audit after the functional changes, not by indiscriminately deleting
  required information.

### 4. Verification and release

- Direct RLS/API abuse checks must cover anonymous/unrelated users reading or overwriting QR objects,
  QR path changes, payment proofs, club changes before/after lock, same-division duplicate entry,
  multiple valid entries, Admin/organizer override, and audit append-only behavior.
- Controlled browser tests must cover QR upload/save/hard reload/replacement, player proof screen,
  idle return, BFCache, expired auth, multiple entries, each registration action, club lock deadline,
  and Home copy in loading/empty/error states.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run format:check`, and `npm run build`.
  Copy any new migration to `scripts/`, have Jasper apply it in Supabase SQL Editor, return exact
  verification counts, then commit/push `main`, wait for Vercel Ready, and verify both production
  domains over HTTP and in a browser.

## Definition of done

A QR uploaded by an authorized organizer persists across reload and is privately available to an
eligible player during manual proof submission. A long-idle browser returns safely or offers a usable
recovery path. A player can have valid entries in more than one division, but never duplicates in one
division, and can update club representation until the organizer's single deadline even after payment
or confirmation. My registrations starts collapsed. Home wording is concise, accurate, accessible,
and free of em dashes. All authorization, audit, migration, quality, and production verification gates
are evidenced.
