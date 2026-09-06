# VouchPlay v2 - Phase 4 kickoff prompt

Paste the block below into a **new** Claude Code conversation to continue the build with Phase 4.
(It mirrors the Phase 2/3 kickoff style. Everything it references is on `main`.)

---

Continue the VouchPlay v2 build. Project folder: `D:\claude_\P006b_PlayerProfiling\vouchplay_v2`
(move the session there before touching files).

First, read for full context:
- `CLAUDE.md` and `AGENTS.md` - working rules + the Next-15/Vercel deploy gotcha (do NOT undo the
  Next 15 pin, root `vercel.json`, or the middleware rename).
- `notes.md` - running execution log + decisions (read the latest entries first).
- `VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md` (content v1.2) - the LOCKED source
  of truth. Read §0Z "Current Build Status" first, then the Phase-4 sections below.

Where things stand (all LIVE at https://vouchplayph.vercel.app, Supabase project
`itrosesiywpbaxtmucbb`):
- **Phases 0–3 done + live.** Auth (email OTP, password, Google), player directory + profile,
  and the **Vouch Engine** are all shipped. Migrations 0001–0004 are applied. STS_V1 (weighted-median
  Community Skill, STS, Skill-Verified) is in `@vouchplay/core` with unit tests; vouches recompute
  `player_skill_profiles` on write.
- **A bold-sporty UI pass** is applied app-wide (gradient/glow tokens + utilities in `globals.css`;
  root font-size 14px for density; route-level `loading.tsx` spinners).
- **Infra you'll reuse:** `is_staff()`/`is_admin()` SQL helpers + `has_global_role()`; `audit_logs`
  (append-only); `account_status` enum (`active/restricted/suspended/banned/deactivated`);
  `blocks`, `fraud_flags`, `reports`-less-so (table not yet created - see below); the Admin MFA
  framework (`lib/auth/mfa.ts` `requireStaffMfa`, `/me/settings/security`) - WIRE it into the new
  staff/moderation area; the service-client + `public_player_facts()` patterns; cache-tag
  invalidation (`revalidateTag`).

## Do NOW - PHASE 4: Safety & Moderation (handover §14, §11.3, §30.6, §47; plan block "Phase 4")

Build, server-side-authz + RLS on everything, keeping the LOCKED non-negotiables:

1. **Reports (§14.2, table §36.33 `reports`):** report a player / comment / club / tournament with a
   reason code + details + optional evidence. Reports are **never anonymous to Admin** (reporter
   identity stored). Any public UGC (profiles, vouch comments) must be reportable. Statuses
   `open → reviewing → resolved/dismissed`.
2. **Skill Review (§14.1, table §36.32 `skill_reviews`) - SEPARATE from Report.** A player (or an
   organizer with tournament context) flags that a target's displayed/community skill is materially
   inaccurate. Statuses `OPEN → UNDER_REVIEW → RESOLVED_NO_CHANGE / RESOLVED_ADMIN_NOTE /
   RESOLVED_VOUCH_ACTION / CLOSED`. Submitter identity stored, never public. (The profile already has
   a gated "Request skill review" entry point to wire up.)
3. **Block UI (§14.3):** the `blocks` table + the vouch-path block check already exist - add
   block/unblock management UI and enforce blocking across all initiation points (vouch request,
   partner invite, recruit/sponsor). Existing public vouches remain unless separately invalidated.
4. **Moderation queue + actions (§30.6, §47):** a staff-only area listing reports, skill reviews, and
   fraud flags. Actions: dismiss, warn, invalidate vouch (with reason - reuse the vouch invalidation
   path), restrict vouching, suspend, ban. **Every action requires a reason and an append-only
   `audit_logs` entry.** Gate the whole area behind `requireStaffMfa`.
5. **Fraud-flag review (§11.3):** `fraud_flags` exists (`open → reviewing → cleared/action_taken`).
   Build the review workflow; flags never auto-punish. (Detector jobs are later - a manual "raise
   flag" + review is enough for Phase 4.)
6. **Restricted/suspended enforcement:** enforce `account_status` everywhere it matters (a
   restricted user can't vouch/request; suspended/banned can't act; banned profiles already 404).
7. **Appeals / support path (table §36.38 `support_tickets`):** a basic submit + staff view.

### Migrations
Write a new migration `supabase/migrations/0005_safety_moderation.sql` (+ a one-paste
`scripts/apply-0005.sql` with a verify query) for `reports`, `skill_reviews`, `support_tickets`, and
any moderation-action columns, with RLS (reporter/submitter read own; staff read all; writes via
service role in audited actions). **Dashboard automation is classifier-blocked**, so hand Jasper the
apply-SQL to paste + run (he'll return the verify numbers), exactly like 0003/0004.

### Gate (must pass)
- Public UGC can be reported. Admin/staff can resolve reports + skill reviews.
- Every moderation action writes an immutable `audit_logs` row.
- Restricted/suspended user enforcement actually blocks the relevant actions server-side.
- Anonymous voucher identity stays hidden from everyone EXCEPT authorized moderation/admin (§37,
  §4.5 permission matrix) - when moderation needs to see a vouch's real author, expose it only
  through a staff-gated server path, never publicly.
- All gates green (lint/typecheck/test/build); commit + push to
  `github.com/jasperandrewadjarani-hub/vouchplay_v2` on `main` (auto-deploys); **re-alias
  `vouchplayph.vercel.app` to the new deployment after each deploy** (manual alias via
  `npx vercel alias set <deployment-url> vouchplayph.vercel.app`). Update `notes.md` + handover §0Z.
  Confirm the plan before large changes.

### Not in scope (later phases - do NOT build)
Clubs (Phase 5, §15), tournaments/registration/eligibility (Phase 6+), the full Admin Control Center
dashboard (§30 - build only the moderation surfaces Phase 4 needs), §16A bidding / §6.1 leaderboards.
