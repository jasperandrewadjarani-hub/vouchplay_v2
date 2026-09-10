# VouchPlay v2 - Post-audit fix priority + execution plan (for the Opus orchestrator)

Companion to `working/P_006b_PostLaunchAudit_(2026-09).md` (the audit; read it first, it has the
evidence and file:line for every item below). Site is HOT: 350+ live players, B-Steel Hermosa
registration open, 46 live registrations, 4-10 concurrent viewers at any time. Every phase below is
designed so a player mid-registration never sees a broken page, a lost form, or a changed rule
without a decision from Jasper.

Agent Report convention: the orchestrator (Opus) plans, sequences, reviews; Sonnet executors write
code. Straightforward SQL pastes are Jasper's (SQL editor), per project rule.

---

## 0. Hot-site rules (apply to every phase)

1. **Deploy window.** Ship code only in the low-traffic window, **01:00-06:00 PHT**, and batch:
   one deploy per phase, never per commit. Each deploy skews open tabs once (they now self-heal,
   §2Q), so fewer deploys = fewer "hit a snag" moments.
2. **Migrate vs deploy order.** Privilege-only migrations: anytime, no deploy. Additive columns
   with fail-open reads: deploy either order. Anything a live control reads: migrate first.
   Never change `register_team`, `registrations`, `teams`, or their RLS while the window is open.
3. **Gates before every deploy:** `npm run typecheck && npm run lint && npm run test &&
   npm run format:check`, then `npm run build`. Commit trailer:
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
4. **Verify on BOTH domains** after each deploy: `vouchplayph.vercel.app` and
   `vouchplay-v2.vercel.app`. Poll until the `?dpl=` id in the HTML flips on both; then load
   `/tournaments`, `/players`, one profile, one tournament detail, `/terms`; then watch Vercel logs
   for `[client-error]` for 15 minutes.
5. **Rollback = redeploy previous commit** (Vercel "Promote" of the prior deployment is fastest);
   every code phase is additive or a pure read-side change so rollback never needs a migration.
6. **Documentation first** (standing rule): each phase gets a `master_plan.md` decision record
   (§3A onward), a handover changelog entry (v1.55 onward), and a `notes.md` log line, BEFORE the
   executor starts.
7. **Out of bounds for this plan:** Next stays on 15.5; no vouch-weight/STS changes; no RLS policy
   changes; no schema changes to registration tables; no dashboard setting changes by automation
   (Jasper clicks them).

---

## 1. Priority order

| # | Item | Severity | User-visible change | Needs deploy? | Who |
|---|---|---|---|---|---|
| P0 | Lock the three partner RPCs to `service_role` (migration 0033) | Critical security | None | No | Jasper (SQL) + executor (repo files + verify script) |
| P0 | Organizer handoff of the 11 `skill_mismatch` Hermosa registrations | High, data | None (organizer review only) | No | Orchestrator produces the list; Jasper/organizer act |
| P1 | Vercel Function Region -> `sin1` | High perf/cost | Faster pages | Yes (takes effect on next deploy) | Jasper (dashboard), bundled with the P1 deploy |
| P1 | Request-level dedupe of `getUser()`/profile reads | High perf | None | Yes | Executor |
| P1 | Consent checkbox on onboarding (Google sign-ups) | Medium legal | New users only | Yes | Executor |
| P1 | Online chip: reset on channel error + 30 s hide debounce | Low | Tiny | Yes | Executor |
| P2 | Caching layer on public reads (tournament detail first) | High cost | None if correct | Yes, own deploy | Executor, reviewed by orchestrator |
| P2 | Skill-drift policy (decision gate) | Product | Changes who can register | Only if Jasper picks a code option | Decision first |
| P3 | Cleanup migration: drop `move_player_registration`, dead helper, stale docs | Hygiene | None | Yes (small) | After the registration window closes |
| P3 | Defense-in-depth: `player_fits_division` inside `register_team` | Hardening | None | Migration | After the window closes |

Dashboard eyeballs for Jasper, no code: Skew Protection ON; Observability Plus not enabled; plan +
Function Region; Supabase egress used vs 5 GB. Report the numbers back into `notes.md`.

---

## 2. Phase P0-A - Migration 0033: lock the three RPCs (do today)

**Why zero risk to live users:** the app already calls all three through the service-role client
(`lib/actions/registration.ts:302,402,713`), which keeps EXECUTE. Only direct anon/authenticated
calls (which nothing legitimate makes) are cut off. No deploy needed.

**Executor deliverables (no app code):**
1. `supabase/migrations/0033_lock_partner_rpcs.sql` and `scripts/apply-0033.sql` (same content,
   same header style as 0032):
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
   select proname from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('create_team_with_pending_partner','decline_partner_invitation','replace_pending_partner')
      and (has_function_privilege('anon', oid, 'execute') or has_function_privilege('authenticated', oid, 'execute'));
   -- and: expect every security-definer function in public to be service_role-only
   select p.proname
     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
    order by 1;
   ```
   The second query is the real safety net: it lists ANY SECURITY DEFINER function still callable
   by anon/authenticated. Expected survivors are only the read helpers deliberately granted to
   `authenticated` (e.g. `division_effective_fee`, the leaderboard/coach reads from 0016/0017,
   `set_tournament_status` family). Anything else in that list is a new finding; report it before
   proceeding.
2. `scripts/verify-rpc-grants.mjs`: the anon-key probe from the audit (zero-UUID args, expects
   42501 for every write RPC). Read-only, runnable against prod. Add to `scripts/README.md`.
3. Repo rule added to `CLAUDE.md` + `AGENTS.md` under Non-negotiables: "every
   `create or replace function ... security definer` must be followed in the same migration by
   `revoke all ... from public, anon, authenticated; grant execute ... to service_role;`". Plus a
   CI grep (`scripts/check-migration-grants.mjs`, run in `npm run lint`) that fails when a
   migration defines a security-definer function without a matching revoke.
4. One-off abuse check (read-only script output pasted into `notes.md`): `partner_invitations`
   and `teams` rows since 2026-09-09 whose inviter has no registration; expected none.

**Order:** executor writes files -> orchestrator reviews SQL against the function signatures in
0031 -> Jasper pastes `apply-0033.sql` -> executor runs `verify-rpc-grants.mjs` -> commit
(docs + scripts only, no deploy needed; can ride along with the P1 deploy).

**Docs:** master_plan §3A "Unlocked partner RPCs", handover v1.55, notes.md.

## 3. Phase P0-B - Skill-mismatch handoff (no code)

1. Orchestrator re-runs the eligibility scan (turn the audit's `prod-check.mjs` into
   `scripts/audit-eligibility-scan.mjs`, read-only, service role, prints registration id, division,
   members, self-rating, community skill, cap, status) and hands Jasper an xlsx/CSV in
   `deliverables/` for the Hermosa organizer: 11 registrations, 14 players, with the plain-language
   reason ("vouched up after registering").
2. Organizer decides per team (keep, ask to move up via cancel + re-register, or reclassify).
   Nothing automatic. Note: Reclassify skips the fit check by design; the organizer is the
   authority here.
3. Small UI follow-up (ships in P1 deploy): on the organizer paid/confirm row, make
   `skill_mismatch` a visible chip so it cannot be missed from the list view. Read-only, no logic.

## 4. Phase P1 - one deploy, low-traffic window (target: tonight 01:00-06:00 PHT)

All items are contained; none touches registration semantics. Sequence for the executor:

**P1-1 Request-level dedupe (`lib/auth.ts`, `lib/supabase/server.ts`).**
- Wrap `getOptionalUser` and `getMyProfile` in React `cache()`; add one `getViewerLegalStatus`
  and `getViewerReputationNudge` that reuse the cached user instead of calling `getUser()` again.
  Do NOT cache `createClient()` itself (server actions rely on fresh cookie writes).
- Expected: 5-6 `auth.getUser()` per page -> 1-2; 3 profile selects -> 1-2.
- Risk: none functional; the helpers already never throw. Test: existing unit tests + a signed-in
  smoke on both domains (header, nudge banner, legal gate still correct).

**P1-2 Onboarding consent for Google sign-ups (`components/auth/onboarding-form.tsx`,
`lib/actions/profile.ts`).**
- Add the same required "I agree to the Terms and Privacy" checkbox to the onboarding form; the
  server action stamps `terms_accepted_*` only when `agree === 'on'`, else leaves it null so the
  in-app gate catches them. Existing users unaffected (they are already onboarded).
- Risk: only brand-new sign-ups see one extra checkbox.

**P1-3 Online chip hardening (`components/presence/online-counter.tsx`).**
- Reset `count` to null on `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED`; debounce the hide-disconnect
  by 30 s (clear the timer if the tab returns) to cut Realtime join/leave churn.
- Risk: none.

**P1-4 Organizer `skill_mismatch` chip** (see P0-B step 3).

**P1-5 Function Region.** Before the deploy, Jasper sets Project -> Settings -> Functions ->
Region = Singapore (sin1). The P1 deploy makes it take effect. Verify `X-Vercel-Id` reads
`sin1::sin1` on both domains and TTFB on `/tournaments` drops (audit baseline 0.95-1.4 s).

Gates -> build -> deploy -> both-domain verification -> 15-minute error-log watch. Docs: master_plan
§3B, handover v1.56, notes.md. Include the P0-A files in this commit if not committed earlier.

## 5. Phase P2-A - Caching layer (own deploy, next low-traffic window after P1 is stable 24 h)

Principle: public data at 60 s TTL with the tags the write actions already revalidate; every
viewer-specific read stays exactly as it is. No auth or registration semantics change.

**Step 1 - tournament detail (largest egress, the landing page).** Split `getTournamentBySlug`
(`lib/tournaments/queries.ts:381-576`):
- Cached core via `createPublicClient()` inside
  `unstable_cache(fn, ['tournament-core', slug], { revalidate: 60, tags: [tournamentTag(slug),
  tournamentDivisionsTag(id), tournamentAnnouncementsTag(id)] })`: tournament row, divisions,
  organizer names, announcements, rules, demand summary, per-division live registration counts.
  Confirm each field is readable by `anon` under RLS before moving it inside (if a field needs
  service role, keep it in the uncached layer or read it with the service client inside the cache
  ONLY if it is public by contract - document which).
- Uncached viewer layer (cookie client): the viewer's own registrations/team/payment state,
  manager-only fields, signed URLs.
- Wrap the composed loader in React `cache()` so `generateMetadata` and the page share one run.
- Registration counts stay live because `registration.ts:139`, `payment.ts:49`,
  `eligibility.ts:31`, `tournament.ts:127-129,874-875` already revalidate these tags on write.

**Step 2 - the rest, same pattern, 60 s:** `getClubMembers` (+ `clubMembersTag`),
`activeMemberCounts`, `listOpenOffers`/`getClubOffers` (+ `OFFERS_LIST_TAG`/`clubOffersTag`),
public parts of `getPlayerAchievements`/`getPlayerHistory`/`getPlayerSkillTags`
(`votedByViewer` stays uncached), `getContributionProgress`, public aggregate of
`withTournamentCardEngagement` (viewer's secured ids stay uncached). Dedupe `getClubBySlug` with
React `cache()`.

**Step 3 - tag hygiene:** give city/club option lists and the skill index their own tags so a
single vouch no longer flushes all eight directory caches. Fix the one `select('*')` at
`lib/actions/tournament.ts:554`.

**Verification specific to caching (mandatory before deploy):**
- Unit tests for the split (cached core has no viewer fields; viewer layer has no public fields).
- Manual: register a test entry on the sample tournament (`sample-tournament-f7bbdc`, status
  `registration_open`, NOT Hermosa) and confirm the division count updates on the next load for
  another browser (tag revalidation), and that the viewer's own "Pay now" state is never served to
  another user (open the same page anonymous + signed-in in two browsers).
- After deploy: watch Supabase egress for 24 h and record the before/after in `notes.md`.

Docs: master_plan §3C, handover v1.57 (this also retires the "public reads cache-first" gap the
audit prompt flagged as a non-negotiable violation).

## 6. Phase P2-B - Skill-drift policy (decision gate, Jasper)

Present the three options and wait; do not implement without a pick:
- **A. Do nothing in code.** Organizers handle drift via the mismatch chip (P1-4). Zero risk.
- **B. Evidence threshold in the fit gate.** Community skill overrides self-rating only when
  `unique_voucher_count >= eligibility_min_unique_vouchers` (already an Admin setting, currently 2).
  Change `division-fit-check.ts:112` and the SQL twin `player_fits_division` (used only by
  `change_partner`) together so they keep agreeing. Effect on live registration: slightly MORE
  permissive for low-evidence players; nobody currently registered is affected. Ship after the
  window if possible; if during, it is a single deploy with no migration for the TS side, and the
  SQL twin must be updated in the same night.
- **C. Freeze skill at registration.** Store effective skill in `eligibility_snapshot` and compare
  later checks to that. Touches registration data; explicitly deferred until after the window.

## 7. Phase P3 - after the Hermosa window closes

- Migration 0034: `drop function public.move_player_registration(uuid, uuid, uuid)`; remove
  `hasPlayerRegistrationChangePolicy` (`lib/settings.ts:87`) and the
  `player_division_change_not_allowed` mapping (`registration.ts:52`); make `withdrawRegistration`
  use one helper. Refresh handover §0Z (stale "0003 pending" line). Commit the untracked
  `docs/handover_audit_prompt_2026-09-10.md`.
- Migration 0035: call `player_fits_division` inside `register_team` so the sex/skill rule holds at
  the SQL layer too. Behaviour-identical to today's TS gate; done post-window purely to avoid
  editing a live RPC mid-registration.
- Legal: counsel review, DPO/privacy email, then bump `LEGAL.version` (re-prompts everyone; do it
  post-window so it is not a speed bump on tournament day).
- Supabase plan: decide on Pro after seeing P1+P2 egress numbers.

---

## 8. Orchestrator checklist per phase

1. Write the master_plan section + handover changelog + notes line (docs first).
2. Brief the executor with: exact files, the "do not touch" list from §0.7, the tests to add,
   and the verification steps above.
3. Review the diff against the audit's file:line claims; run the four gates + build yourself.
4. Deploy in window; verify both domains; log the `?dpl=` id and timing in `notes.md`.
5. Report outcome faithfully (what shipped, what was verified, what was skipped and why).
