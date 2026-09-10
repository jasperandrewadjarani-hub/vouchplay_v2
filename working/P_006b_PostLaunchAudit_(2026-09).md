# VouchPlay v2 - Post-launch audit of commits 5197f62..f7f1fc3 (2026-09-10)

Read-only audit. No code changed. Verified against the production database (service-role, read-only
queries), both live domains, and the working tree at `f7f1fc3` (gates: typecheck, lint, test,
format:check all pass).

Agent Report: main session = Fable 5.1. Subagents: 2x Sonnet (public-read caching map;
registration-eligibility trace).

---

## 0. Premises that turned out to be wrong

| Premise in the audit prompt | Reality (verified) |
|---|---|
| Migration 0032 probably NOT applied, so the legal gate is silently off | **Applied.** `profiles.terms_accepted_version` exists; 54 of 348 onboarded players (407 profiles total) have already accepted `2026-09-10`. The gate is live and ~294 players are being gated. |
| Public reads are not cache-first at all | Partially true. Settings, leaderboards, player list/profile rows, club list/row, tournaments list are all `unstable_cache`d. What is NOT cached: tournament detail, club members/counts, offers, player achievements/history/skill tags, contribution progress, card engagement. Three whole tag families are defined and revalidated but never attached to a cached read (dead invalidation). |
| `?dpl=` needs confirming | Emitted on both domains; both serve the same deployment `dpl_GnGf9ExhJHGrMqfhGCb7o8Vqv44D`. |

---

## 1. Confirmed bugs / regressions (ranked)

### 1.1 CRITICAL - three SECURITY DEFINER RPCs are executable with the public anon key, with no auth check and no eligibility check

**Where:** `supabase/migrations/0025_pay_before_partner_confirms.sql:34,177,218` (definitions) and
`0031_partner_conflict_ignores_dead_teams.sql:62,177` (re-created). Neither migration contains a
`revoke ... from public, anon, authenticated` for `create_team_with_pending_partner`,
`decline_partner_invitation`, or `replace_pending_partner`. Every sibling registration RPC
(`register_team`, `move_player_registration`, `accept_partner_invitation`, `change_partner`,
`release_slot`, `player_cancel_registration`, `player_fits_division`,
`player_on_active_team_in_division`) is locked to `service_role`; these three were missed.

**Verified in production** by calling each RPC with the `NEXT_PUBLIC_SUPABASE_ANON_KEY` and no
session (zero-UUID args so nothing was written):

| RPC | Result with anon key |
|---|---|
| `register_team` | 42501 permission denied (correct) |
| `move_player_registration` | 42501 permission denied (correct) |
| `change_partner` | 42501 permission denied (correct) |
| `create_team_with_pending_partner` | **executed**, returned business error `self_partner` |
| `decline_partner_invitation` | **executed**, returned `invitation_not_found` |
| `replace_pending_partner` | **executed**, returned `team_not_found` |

**Why it matters:** the anon key ships in the client bundle. The functions take `p_inviter`,
`p_invitee`, `p_actor` as plain parameters and never compare them to `auth.uid()`. Gender and
skill-cap fit is enforced only in TypeScript (`apps/web/src/lib/tournaments/division-fit-check.ts:62`)
before the server action calls the RPC; a direct RPC call skips it. This is the same class of
eligibility bypass §2X closed, and it is reachable by anyone, not only a registered team.

**Concrete failure scenarios:**
- Anyone can call `create_team_with_pending_partner` for any open division with two arbitrary
  player ids: creates a `forming` team, auto-confirms the "inviter", and sends a `partner_invitations`
  row to the victim. Spam invitations to 350 players, unbounded rows.
- Anyone who can guess or read an invitation id can call `decline_partner_invitation` with
  `p_actor = invitee_id` and decline someone else's pending invitation. On a paid entry that deletes
  the unconfirmed seat and flips the team back to `forming` (griefing live registrations).
- Anyone can call `replace_pending_partner` with `p_actor` set to a confirmed member of a paid team
  whose seat is vacant, inserting an arbitrary `p_new_invitee` with no sex/skill check.
- `registration_events.actor_id` receives whatever `p_actor` was passed: the audit trail can be
  forged for these events.

**Fix (migration 0033, migrate-before-deploy is not needed since the app calls these via
service_role):**
```sql
revoke all on function public.create_team_with_pending_partner(uuid, uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.decline_partner_invitation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.replace_pending_partner(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_team_with_pending_partner(uuid, uuid, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.decline_partner_invitation(uuid, uuid) to service_role;
grant execute on function public.replace_pending_partner(uuid, uuid, uuid, text, timestamptz) to service_role;
-- verify: expect 0 rows
select proname from pg_proc where pronamespace='public'::regnamespace
  and proname in ('create_team_with_pending_partner','decline_partner_invitation','replace_pending_partner')
  and (has_function_privilege('anon', oid, 'execute') or has_function_privilege('authenticated', oid, 'execute'));
```
Then add a repo rule: every `create or replace function ... security definer` in a migration must be
followed by the revoke/grant pair (a grep-able check in CI would have caught this).
Also worth a one-off look at `partner_invitations` and `teams` rows created since 2026-09-09 whose
inviter never registered, to spot abuse (none expected; nothing in `registration_events` suggests
it).

### 1.2 HIGH (data, not code) - 11 live Hermosa registrations currently break the tournament's own skill cap

Production scan of all 46 live registrations (status `payment_pending`/`payment_submitted`/
`confirmed`) against `player_fits_division()` semantics (effective skill = community skill else
self-rating; cap enforced because `enforce_skill_floor = true` and policy `band`):

- 11 registrations, 14 player-slots, all in `b-steel-hermosa-2026-...`, have a member whose
  effective skill is above the division's `maximum_skill` (e.g. self-rated 1, community 3, in a
  max-1 band).
- Every one of them: self-rating was within the band at registration, and the player received
  vouches AFTER registering (1 to 25 each) that raised their community skill level. The
  `eligibility_snapshot` recorded `SKILL_ABOVE_DIVISION_MAX` at payment-submit time, and
  `registrations.eligibility_status` is `skill_mismatch` for all 11.
- The 3 `division_changed` events (the §2X exploit path) are NOT the cause: one was a
  self-reverting test move (same actor, 40 s apart) on a registration that still fits; the other
  registration is `withdrawn`.

**Why it is a gap:** the cap is a hard gate only at the moment of registration
(`division-fit-check.ts:62`, `registration.ts:186,296,396,795,845`). Afterwards, community skill
drifts with every vouch and nothing re-checks, notifies, or blocks. Because effective skill prefers
`community_skill_level` even with a single voucher (`division-fit.ts:23`, `division-fit-check.ts:112`),
one friend's vouch flips a player's band. In a vouch drive (2,731 vouches for 348 players) this is
the normal case, not the edge.

**Failure scenario:** a max-1 women's team with two members now at 3 and 2 goes to the organizer
as "payment submitted"; the organizer approves from the paid list without opening the eligibility
sheet; the bracket has two Intermediate players in the Beginner band.

**Recommended fix (decide policy first):** (a) short term, hand the organizer the list (registration
ids in the scan output) and make `skill_mismatch` impossible to miss on the paid/confirm row; (b)
product decision: either freeze the fit check to the skill at registration (store it in the
snapshot and compare to that) or require `unique_voucher_count >= eligibility_min_unique_vouchers`
before community skill overrides self-rating in the fit gate. Note this also affects new
registrations: a player self-rated 2 with one vouch at 4 is blocked from the band they chose.

### 1.3 MEDIUM - Google sign-ups get a recorded Terms acceptance they never actively gave

`apps/web/src/app/(auth)/signup/page.tsx:25` renders the Google button above the email form; only
the email form has the required `agree` checkbox (`signup-form.tsx:33`) and only `intent=signup`
is enforced server-side (`actions/auth.ts:43`). The Google path sees only browsewrap text
("By continuing you agree", `signup/page.tsx:29-39`). `completeOnboarding` then stamps
`terms_accepted_version` unconditionally (`actions/profile.ts:145-152`). Result: for every Google
sign-up the acceptance record claims an explicit acceptance that was never collected.
**Fix:** add the same required checkbox to the onboarding form (covers Google and any future
provider) and stamp only when it is checked; or gate Google sign-ups through the in-app consent
overlay by not stamping at onboarding.

### 1.4 LOW - online chip can freeze on a stale number

`components/presence/online-counter.tsx:49-51`: the subscribe callback only handles `SUBSCRIBED`.
On `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` the last `count` stays rendered until a later sync. Reset
`count` to `null` on those statuses.

---

## 2. Correctness gaps (verified by code reasoning; auth-gated surfaces not eyeballed)

### 2.1 §2X security fix - confirmed closed for players
- `moveRegistrationDivision` is a no-arg rejecting stub with zero callers
  (`lib/actions/registration.ts:1157-1162`).
- `move_player_registration` still exists in production (service-role call returns
  `registration_not_found`; anon returns 42501). It checks format/team size/capacity/status only,
  never `player_fits_division` (`0021:84-168`). Unreachable by clients; drop later.
- Cancel + re-register: `withdrawRegistration` -> `player_cancel_registration`/`release_slot`;
  `disbandTeamIfEntryClosed` disbands the team; re-registering creates a new team and goes through
  `checkDivisionFit` + `register_team` again. No state found that blocks re-registration.
- Still-open division-change path: organizer **Reclassify** (`lib/actions/eligibility.ts:130-233`,
  UI `organizer-registrations.tsx:617-679`) moves a registration between divisions without
  `player_fits_division`; it re-runs the advisory ELIG_V1 engine afterwards. Authorised and
  audited, so by design, but it is the one remaining move path and it does not enforce sex/skill.
  Suggest a confirm step that shows the fit verdict before saving.
- Structural note: `register_team` (`0008:201-267`) itself never calls `player_fits_division`;
  the sex/skill rule for the normal register path lives only in TypeScript. Safe today because the
  RPC is service-role-only. Adding the SQL call inside `register_team` would make the rule true at
  the last line of defence, as the code comments already claim.

### 2.2 Legal gate (§2R) - mechanics sound, three edges
- `getViewerLegalStatus` (`lib/auth.ts:68-87`) fails open on error and exception and never
  redirects; the shell only renders an overlay (`app-shell.tsx:124`). It cannot bounce anyone to
  onboarding. Confirmed.
- Under `maintenance_mode` the gate is skipped (`app-shell.tsx:36`), by design.
- `acceptCurrentLegalTerms` (`actions/legal.ts:22-30`) treats "0 rows updated" as success. A viewer
  whose `profiles` row is invisible to their own select (banned or soft-deleted; the public read
  policy `0001:272-273` hides those rows) is gated forever: the select returns null, the update
  either matches 0 rows or succeeds, the refresh re-gates. Banned users should not be in the app
  anyway, but the overlay is a worse experience than the existing ban screen. Check `.select()` on
  the update or skip the gate when `account_status !== 'active'`.
- The gate is client-side only; nothing server-side refuses actions from a user who has not
  accepted. Acceptable for consent; note it is not enforcement.

### 2.3 Deployment skew (§2Q) - works, one thing to eyeball
- `deploymentId` is emitted: every asset URL on both domains carries `?dpl=dpl_GnGf9E...`.
- Reload guard is loop-safe: the `sessionStorage` key is scoped to the stale bundle's version, so
  the worst case is one reload per build version per tab, then the manual button.
- The dashboard Skew Protection toggle cannot be confirmed from outside (Vercel emits no
  `__vdpl` cookie on these responses, and `?dpl=` appears with or without the toggle because
  `VERCEL_DEPLOYMENT_ID` is always set). **Jasper: please eyeball Project -> Settings ->
  Skew Protection.** The code is correct either way.
- `X-Vercel-Id: sin1::iad1` on both domains: the edge is Singapore but the **function runs in
  iad1 (US East)** while the Supabase DB resolves to AWS ap-southeast-1 (Singapore). See 3.1.

### 2.4 Vouch UI (§2U/§2V/§2Y) - reasoning holds
- `VouchButton` renders the trigger, the confirm `Modal`, and `VouchForm` as stable siblings in a
  fragment (`vouch-button.tsx:118-176`); `hasVouched` only swaps the trigger, so the form instance
  survives `router.refresh()`. The profile renders exactly one `VouchButton`
  (`players/[slug]/page.tsx:158`), so no duplicate mobile/desktop instance.
- Cooldown copy is advisory; the server enforces on write. Fine.
- Minor: after a successful vouch the URL keeps `?intent=vouch`; a manual reload re-opens the form.
- Partner search row and "I'll pay later" (`partner-invite-form.tsx:214-218`,
  `payment-modal.tsx:187-193`) are styling only; the pay-later path still requires the explicit
  confirm step. No logic change found.
- "Request to partner" banner (`tournaments/page.tsx:95-140`): `partner` is resolved through the
  cached `getPlayerMetaBySlug`, unknown slugs render nothing, text is escaped by React. Fine.

### 2.5 Realtime presence (§2S) - matches the spec
- Connects only while visible, disconnects on hide/unmount (`online-counter.tsx:62-74`).
- Key is a random UUID in `localStorage`; payload is `{ t: <timestamp> }` only - confirmed by
  observing the live channel (4 distinct viewers at 22:00 PHT, payload keys `t`, `presence_ref`).
- Hides at count 0 and while unconnected; above the 200-connection ceiling `subscribe` never
  reaches `SUBSCRIBED`, so the chip stays hidden. supabase-js retries with backoff, which is
  acceptable churn.
- Two notes: anyone with the anon key can join and track fake keys, so the number is spoofable
  (gamification only, no harm beyond vanity); and each visible tab is one WebSocket even though
  the key dedupes the count, so connections scale with tabs, not browsers.

---

## 3. Cost / risk

### 3.1 Function region mismatch (biggest cheap win, no code)
Functions execute in `iad1` while Supabase is in Singapore. Every Supabase round trip crosses the
Pacific twice. Observed TTFB from Manila: `/tournaments` 0.95-1.4 s, `/players` 1.4-2.6 s, with
roughly 6-10 sequential Supabase calls per signed-in page. Set **Project -> Settings -> Functions ->
Function Region = Singapore (sin1)**. Expect TTFB to drop by roughly half and function GB-hours to
fall with it (Vercel bills duration). Verify afterwards that `X-Vercel-Id` reads `sin1::sin1`.

### 3.2 Redundant auth/profile fan-out on every request
Per signed-in page: middleware `getUser()` + header `getOptionalUser` + `getMyProfile` +
`getViewerReputationNudge` + `getViewerLegalStatus` (+ welcome `getOptionalUser`) = 5-6
`auth.getUser()` HTTPS calls and 3 separate reads of the same `profiles` row
(`components/header.tsx:17-19`, `app-shell.tsx:33,36,62`, `lib/auth.ts`). Wrap `createClient`,
`getOptionalUser`, and a single "viewer" loader in React `cache()` so each runs once per request.
This is latency and Auth API load, not DB egress, but it multiplies 3.1.

### 3.3 Uncached public reads and dead cache tags (the handover non-negotiable)
From the caching map (file:line in the subagent report, summarised):
- `getTournamentBySlug` (`lib/tournaments/queries.ts:381-576`) is fully uncached, runs ~10
  queries including `registrations` with `limit(1000)`, and executes **twice** per page view
  (`generateMetadata` + page). Highest egress item in the app, and it is the page every player
  lands on right now (root redirects to `/tournaments`).
- `getClubBySlug` tail + `getClubMembers` (uncached, whole member list, also twice per view).
- `listOpenOffers`, `getPlayerAchievements`, `getPlayerHistory`, `getPlayerSkillTags`,
  `getContributionProgress`, `withTournamentCardEngagement`, `activeMemberCounts`: uncached, public.
- Tags `tournamentTag`, `tournamentDivisionsTag`, `tournamentAnnouncementsTag`, `clubMembersTag`,
  `OFFERS_LIST_TAG`, `clubOffersTag` are defined and revalidated by the write actions but attached
  to no cached read. The invalidation plumbing already exists; only the read side is missing.
- `PLAYERS_LIST_TAG` is shared by 8 caches, so any single vouch/profile edit busts all of them.
- One `select('*')` at `lib/actions/tournament.ts:554` (organizer single-row clone; low).

**Proposed safe caching layer (short TTL, tags already wired):**
1. Split `getTournamentBySlug` into a cached public core (tournament row, divisions, organizer
   names, announcements, rules, demand summary, per-division live counts) in
   `unstable_cache(..., ['tournament', slug], { revalidate: 60, tags: [tournamentTag(slug),
   tournamentDivisionsTag(id), tournamentAnnouncementsTag(id)] })` using `createPublicClient`,
   plus an uncached viewer/manager layer (own registrations, signed URLs). Registration and payment
   actions already call `revalidateTag(tournamentTag(slug))`, so counts stay live within one
   request of a write. Wrap the whole loader in React `cache()` to dedupe metadata + page.
2. Same pattern, 60 s, for `getClubMembers` (tag `clubMembersTag`), `listOpenOffers`/`getClubOffers`
   (tags `OFFERS_LIST_TAG`/`clubOffersTag`), `activeMemberCounts`, and the public parts of the
   profile extras and `withTournamentCardEngagement`.
3. Give the directory option lists and skill index their own tags so a single vouch does not
   flush the whole directory.
4. Keep every viewer-specific read uncached (they already are).
Risk profile: 60 s staleness on public counts only; no auth or registration semantics touched;
all with the cookie-free client, which the codebase already uses correctly (no cookie client was
found inside any cache scope).

### 3.4 Presence message budget
Supabase free tier: 200 concurrent connections, 2M Realtime messages/month. Each join/leave sends a
diff to every subscriber, so messages scale as concurrency x churn, and visibility-based
connect/disconnect raises churn (every tab switch is a leave + join). At today's 4-10 concurrent
this is negligible; at ~50 concurrent with active tab switching it could approach the cap. Cheap
insurance: debounce disconnect on hide by ~30 s.

### 3.5 Things I could not verify from the repo (please confirm in the dashboards)
- Vercel: Skew Protection toggle; Observability Plus excluded; current plan and Function Region.
- Supabase: egress used vs the 5 GB free quota, and whether the project is paused-risk. No
  Management API token is available locally. My reading: fix 3.1 to 3.3 first; if egress is still
  above ~80% after a week, the $25 Pro tier is the right call, and it also lifts Realtime limits.

---

## 4. Loose ends (flagged, not removed)

- `move_player_registration` RPC: present in prod, unreferenced. Drop in a cleanup migration
  together with 1.1's grants fix.
- `hasPlayerRegistrationChangePolicy` (`lib/settings.ts:87-101`): no callers;
  `withdrawRegistration` (`registration.ts:1058-1065`) duplicates its two-key lookup inline.
  Settings `player_registration_self_service_enabled` / `..._change_lock_hours_before_start` remain
  in `system_settings` (true / 120) and still gate withdraw.
- `player_division_change_not_allowed` message mapping (`registration.ts:52`): dead.
- Legal text unreviewed by counsel; contact is the JT Facebook page. Add a privacy/DPO email before
  bumping `LEGAL.version`; NPC registration is a counsel question. Also see 1.3.
- Handover §0Z still says migration 0003 is "pending a manual SQL paste"; stale since the
  directory has been live for days. Update the status block.
- `docs/handover_audit_prompt_2026-09-10.md` is untracked in git.

---

## 5. Suggested order of action

1. Migration 0033: lock the three RPCs to `service_role` (1.1). Five-minute SQL paste, no deploy.
2. Hand the organizer the 11 `skill_mismatch` registrations and decide the drift policy (1.2).
3. Function Region -> sin1 (3.1), then eyeball Skew Protection and Observability Plus.
4. Onboarding consent checkbox for Google sign-ups (1.3).
5. Caching layer per 3.3 plus request-level dedupe per 3.2, documented in master_plan + handover
   first per the standing rule.
6. Cleanup migration for `move_player_registration` and the dead policy helper (4).
