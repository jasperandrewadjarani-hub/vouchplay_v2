# VouchPlay v2 - Next session kickoff prompt

_Rewritten 2026-09-09 at the end of the registration-flow session. Paste the block below into a fresh
conversation. Rewrite this file at the end of each session so it always describes the state a new
conversation actually starts from._

---

You are continuing work on **VouchPlay v2**, a Next.js 15 / Supabase / Vercel pickleball community app
at `D:\claude_\P006b_PlayerProfiling\vouchplay_v2`. I am Jasper (JT Consulting & Analytics).

## Read these first, in this order

1. `CLAUDE.md` - especially the two deployment gotchas. **Next is pinned to 15.5.x on purpose; do not
   upgrade to 16.** Do not delete the root `vercel.json` or the root-level `next` dependency.
2. `AGENTS.md`
3. `notes.md` - **start with the `START HERE` block at the top of `## Next up`.** It is the current
   state of play. The dated entries below it are the running log, newest last.
4. `master_plan.md` - sections **1C through 2A** are the post-launch decision record. §1U (pay-first
   registration), §1V (per-player fees), §1Y (continuous flow), §1Z (organizer list) and §2A (partner
   change after paying) are the ones that describe how registration works today.
5. `VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md` (content is **v1.31**) - the locked
   product spec. Read the v1.31 changelog entry in full, then the sections relevant to whatever we
   take on.

## Where things stand

The app is **live and in production use** for the **B-Steel Hermosa 2026 Grand Pickleball Tournament -
Rise of Empires** (Oct 17-18 2026, Zamboanga City). Registration opened **Sep 9 2026, 5:00 PM Manila**
and real people are signing up. Treat production as hot: prefer small reversible slices, and read the
release-order rule in the v1.22 changelog before shipping anything that needs a migration.

**All migrations through 0027 are applied and verified. Nothing is pending in Supabase, and nothing is
blocked on me.**

### Registration works like this now

- **Pay first, confirm the partner after.** Naming a partner creates the team immediately with that
  partner *unconfirmed*, so the payer goes straight to the QR and the receipt in one sitting. The
  partner confirms afterwards. A submitted receipt reserves the slot.
- **If the partner declines**, the entry is not cancelled and the slot is not released. The payer
  keeps slot, payment and waitlist position and can name someone else.
- **Fees are per player.** `divisions.fee_amount` is what ONE player pays; a doubles team is charged
  it twice, and the payment screen states the arithmetic. There is an optional early-bird window
  (dates on the tournament, amount per division).
- **After paying**, a player can Request to cancel (with a reason, which goes to the organizer as a
  request, not an action) and can change partner, provided the replacement fits the division's own
  skill band and sex classification.
- **Organizers** see a list of rows plus a detail sheet, with queue chips for Check payment,
  Cancellations and Eligibility. Closed entries are hidden by default.

## Open items, highest value first

1. **Finish the end-to-end registration walkthrough.** I got as far as payment before the last round
   of fixes landed. The path still to prove: pay -> partner confirms -> organizer verifies -> both
   notified -> confirmed. Also worth exercising the decline path, naming a replacement, Request to
   cancel, and changing partner after paying.
2. **Wire `supabase gen types` into `packages/db`.** The DB types are hand-synced today, and that is
   exactly what let a non-existent column name (`onboarding_completed_at`) pass five green gates and
   break the entire doubles registration path. **This is the highest-value engineering hygiene item
   left**, and it prevents a whole class of bug rather than one instance.
3. **Phase 15 - run the event.** Oct 17-18 is a deadline that does not move, and the app currently has
   no `matches`, `brackets`, `draws`, `schedules` or `results` table and no check-in. I have decided
   the **draws and scoring for this event run outside VouchPlay**. What is worth building, in order:
   **15A** close the registration cycle cleanly (the Phase 13.5 authenticated walkthrough, payment
   review, a roster export I will trust to build the draw from); **15C** results in, achievements out -
   note the organizer award UI **already exists** at Manage -> Registrations, so this is smaller than
   it sounds and it is what feeds results -> achievements -> vouches -> leaderboards; **15B** day-of
   check-in, one screen, one field, usable one-handed at a venue with bad signal.
4. **Move `vouch-form` and `request-vouch-form` onto the shared `Modal`.** Both still use the old
   inline dialog pattern. Neither is currently opened from inside a stacking context so neither is
   broken, but the shared `Modal` now portals and they should use it.
5. Carry-over ops: clear the Supabase org over-quota before **21 Sep 2026**; move Gmail SMTP to a
   dedicated provider before public scale.

## Locked, non-negotiable

Do not change these without asking me explicitly:

- The canonical skill order (Newbie to Pro).
- **CSL, STS, Identity Verified and Skill Verified are four separate concepts.** STS measures
  confidence in a rating (0-5), never ability, and VouchPlay never ranks players by STS. Its
  components saturate by design; the unbounded number shown beside it is the vouch count.
- Vouch weights (1.00 / 1.25 / 2.00 / 2.50). Only the approved-Coach toggle and the **voucher's**
  identity verification move weight.
- `ELIG_V1` is version-locked and never blocks registration. New gates go **outside** it as separate
  pure functions (see `evaluateSkillFloor`, `player_fits_division`).
- `audit_logs` is append-only. Anonymous voucher identity is never exposed outside authorized
  Admin/moderation.
- All operational values live in `system_settings`, never hardcoded.
- Server-side authorization on every mutation; RLS governs reads; service-role writes only inside
  audited server actions.
- **A partner who has accepted, or who is still deciding, is never removed without being told.** §1D
  forbids displacing somebody *without their knowledge*; the notification is what makes the
  post-payment swap permissible.

## Gotchas that have already cost time

- **Five green gates do not mean it works.** Three bugs shipped through them in one session: a column
  name that did not exist, a modal trapped by a stacking context, and a spinner wired to the wrong
  link. Typecheck cannot see a Supabase `.select()` string, and a type *assertion* on a query result
  will happily describe a field that is not there. **Where a change is observable, drive it** - in a
  browser, or against the live database - before calling it done.
- **A failed query is not a missing record.** Returning "not found" when the real problem was a 400
  sends the next person hunting in the wrong place.
- **`fixed inset-0 z-50` is not absolute.** Any positioned ancestor with a z-index traps it. Dialogs
  go through the shared `Modal`, which portals to `document.body`.
- **The app sets a 14px root font**, so rem-based Tailwind sizes are 0.875x - `min-h-11` is 38.5px.
  Use `min-h-[44px]` when a real touch minimum matters.
- **A compact directory row gets one pill per line and nothing beside it.** Three separate regressions
  came from adding something to that row. `SkillPill` is now `shrink-0 whitespace-nowrap`.
- **Never parse form input with a bare `new Date(x)`, never format with a bare `toLocale*`, and never
  pin app copy to `timeZone: 'UTC'`.** Use `@vouchplay/core` `time/ph-time.ts` and
  `apps/web/src/lib/format-date.ts`.
- **The Supabase SQL editor only displays the LAST statement's result.** Write migration verification
  as one `union all` query.
- `system_settings` merges code defaults over DB rows, so a new setting needs **no** migration - but a
  DB row already present will override a changed code default.
- Run tests with `npm run test`, never `npx vitest run packages/core` from the repo root.
- When verifying a deploy, grep for something in the **SSR HTML**, or fetch the built client chunk.
  Auth-gated surfaces are code-split out of the anonymous bundle and cannot be verified from outside -
  say so rather than implying otherwise.

## How I want you to work

- Implement using best practices in UI/UX, logical flow, and design, in line with the app's theme and
  concept. **Make it as intuitive, logical and simple as possible - a lot of our users are not
  tech-savvy and span a wide range of ages.**
- Update and integrate the change into the `*.md` files first (`master_plan.md`, `notes.md`), then the
  handover file if it is affected (bump the version and add a changelog entry), **then** deploy.
- **If something I ask for already exists in the codebase, tell me** rather than building it again.
  That has happened more than once - the "vouches given leaderboard" was the existing Community
  Champions board with a stale snapshot, and Phase 14A recruitment/sponsorship turned out to be fully
  built and shipped.
- **Never write copy for a capability that does not exist yet.** If the feature needs a migration I
  have not run, hold the sentence with the feature.
- Give me a clear recommendation, not a menu.
- Report what actually happened, including your own mistakes.

## Gates before any push

`npm run typecheck`, `npm run lint`, `npm run test`, `npm run format:check`, `npm run build` - all
green. Then commit and push `main`, wait for the Vercel deploy, and verify **both** production domains
(`vouchplayph.vercel.app`, `vouchplay-v2.vercel.app`) before claiming anything is live.

**Migrations:** write the migration to `supabase/migrations/`, a paste-ready copy with a single
`union all` verification query to `scripts/`, and give it to me to run in the Supabase SQL editor.
**Verify every column and function the migration touches against the live database before handing it
over.** Wait for my verification counts before claiming the feature is live. If the migration gap
would leave a **visible control that errors when tapped**, hold the code out of production until I
confirm the migration - only deploy ahead of a migration when the gap is a silent read. **A migration
that changes what an existing number MEANS is a third case: ship code that reads both meanings first,
then migrate**, or the live site is wrong for the minutes in between.
