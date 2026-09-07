# VouchPlay Phase 13C/13D Kickoff - Coach Flow + Home Leaderboards

Copy/paste the prompt below into the next coding session.

---

Continue the VouchPlay v2 build. Project folder:
`D:\claude_\P006b_PlayerProfiling\vouchplay_v2` (move the session there before touching files).

Read for full context before planning or coding:

- `CLAUDE.md` and `AGENTS.md` - working rules and the active Next 15/Vercel deploy workaround. Do not
  remove the Next 15 pin, root `vercel.json`, root `next` dependency, or `middleware.ts` rename.
- `notes.md` - read the newest entries first.
- `VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md` (content v1.7) - LOCKED source of
  truth. Read §0Z first, then §4.4, §6.1, Phase 13A, Phase 13C, Phase 13D, §33.5A, §37, §38, and §72.
- `docs/BRAINSTORM_Vouch_Incentives_and_Partner_Finder_(2026-09).md` - contribution-engine context.

## Goal

Implement the complete Coach application/approval journey and the first production Home leaderboard
release as quickly as safely possible. The leaderboard release includes Players, Community Champions
(Top Vouchers), and Clubs. Do not block it on Gamified Bidding; keep Most Bidded feature-gated until
§16A is built.

## Preconditions

1. Confirm migrations 0014 and 0015 were applied to Supabase project `itrosesiywpbaxtmucbb` using
   `scripts/apply-0014.sql` then `scripts/apply-0015.sql`, and record Jasper's returned verification
   counts. Do not assume they landed merely because their code is deployed.
2. Inspect the live `role_applications`, `user_roles`, `profiles`, vouch, achievement, club,
   tournament, registration, fraud/moderation, notification, settings, and audit schema before writing
   the new migration. Preserve existing records and enum compatibility.
3. Confirm scope/plan with Jasper before a large schema/UI change, then update the master document
   before implementation if any locked rule needs refinement.

## Phase 13C - Coach Application & Verification (do first)

Implement §4.4 and Phase 13C end to end:

- Me → Roles → Become a Coach entry, progressive application form, private evidence upload, one-open-
  application enforcement, applicant status card, withdrawal, request-information response/resubmit.
- Dedicated private evidence bucket with server-side MIME/size/decodability checks, randomized paths,
  retention setting, and short-lived signed URLs only after Staff AAL2 authorization.
- Staff → Role applications → Coaches decision workspace showing answers, references, evidence,
  relevant safety facts, and history. Actions: Request information, Approve, Reject; reason rules per
  §4.4. Revoke remains an explicit Admin user action.
- Transactional SECURITY DEFINER RPCs where multi-table consistency is required: application state +
  role grant/revoke + immutable audit. Revoke must preserve event-time historical coach-vouch facts.
- Critical in-app/email notifications and deep links for request, approval, rejection, and revocation.
- Coach badge on cards/profile comes only from an active `coach` role; pending/rejected applications
  are never public. Coach vouch remains an explicit off-by-default toggle.
- Feature flag and all operational limits/SLA/retention values in `system_settings` and the Admin
  settings catalog; narrow DTOs, server authz + RLS, analytics events, responsive dark/light UI,
  accessible errors, and §33.5A feedback on every waiting control.

## Phase 13A dependency - Community Contribution

Before Community Champions can rank, implement the required Phase 13A contribution foundation:

- Pure deterministic `CONTRIB_V1` in `@vouchplay/core` with unit fixtures.
- Cached/recomputed public aggregate from distinct outgoing vouches and qualifying newcomer support.
- Per-pair repeat suppression, reciprocity/ring dampening, diminishing returns/decay, Admin settings,
  badges/progress UI, and a build guard proving contribution data never feeds CSL, STS, Skill
  Verified, vouch weight, or eligibility.
- Do not reward favorable ratings or raw vouch volume. Never expose anonymous voucher identity.

## Phase 13D - Home Leaderboards & Engagement

Implement §6.1 and Phase 13D end to end:

- Pure deterministic `LEADER_V1` scorer/ranker/tie-breaker in `@vouchplay/core`; all weights,
  thresholds, periods, decay, and publication cadence in `system_settings`.
- Snapshot schema and bounded snapshot builder for Players, Community Champions, and Clubs, with
  version/category/scope/period/component facts, indexes, RLS, Admin rebuild/pause/exclude controls,
  rollbackable active scoring version, and append-only audit.
- Home UI: private Your momentum card; visually strong but accessible top-three podium; ranks 4–10;
  category, scope, and period controls; full leaderboard route; How rankings work; contextual
  engagement CTA; honest cold-start/empty/stale/error states. Use the existing VouchPlay theme, keep
  motion restrained/reduced-motion safe, and never communicate rank by color alone.
- Engagement CTAs should lead to real working paths: register for a tournament, vouch a genuinely
  known player, request a vouch, complete/share profile, or join a club. Never encourage spam or imply
  that a vouch must be positive.
- Privacy/eligibility exclusions exactly per §6.1: opt-out, minors by default, hidden/private profiles,
  account restrictions, unresolved high-risk fraud, and ineligible clubs. A public opt-out player may
  still see their private momentum.
- Milestone notifications only (top 10, podium, meaningful club movement), deduplicated and preference-
  controlled. No per-recalculation notification spam.
- Most Bidded remains behind a feature flag and empty adapter until §16A is actually built; do not
  fabricate bid data.

## Mandatory implementation gates

- Domain logic is pure and exhaustively unit-tested in `@vouchplay/core`; React/server actions only
  orchestrate.
- Server authorization and RLS are both enforced; service-role use is narrow and never client-visible.
- Direct anon/authenticated/staff RLS/API abuse tests cover role self-grant, private evidence,
  applications, public snapshots, private momentum, opt-out, and Admin controls.
- `audit_logs` remains append-only. Anonymous voucher identity never enters logs, snapshots, public
  DTOs, explanations, analytics, or notifications.
- No raw STS leaderboard and no leaderboard/contribution value can affect CSL, STS, Skill Verified,
  vouch weight, or eligibility. Add build-failing dependency/label guards.
- Every server-waiting control meets §33.5A; all screens have loading/empty/error/success/permission
  states and pass keyboard, screen-reader, reduced-motion, mobile, desktop, dark, and light checks.
- Cache-first bounded reads, no `select(*)`, no N+1. Document cache class, query count, invalidation,
  cadence, cost/egress expectations, and tournament peak behavior.
- Any new migration is also copied to `scripts/apply-00NN.sql`; Jasper applies it through Supabase SQL
  Editor and returns the exact verification counts. Do not claim the DB feature is live before that.
- All gates before commit: `npm run typecheck`, `npm run lint`, `npm run test`,
  `npm run format:check`, `npm run build`.
- Update `notes.md`, §0Z, and the master changelog. Commit and push `main`; wait for Vercel Ready;
  verify `vouchplayph.vercel.app` and `vouchplay-v2.vercel.app` over HTTP and in the browser. Project
  domains should attach automatically; run the documented alias command only if they do not.

## Definition of complete

A real player can apply with evidence, respond to a staff information request, be approved, receive
the Coach badge/permissions, and be revoked through an audited path. Real eligible players and clubs
appear in deterministic privacy-safe leaderboard snapshots; a player can opt out publicly while still
seeing private momentum; the Home experience is responsive, engaging, transparent, and links to
working actions. The migration is applied and verified, all gates are green, and the production flows
are exercised with controlled accounts.

