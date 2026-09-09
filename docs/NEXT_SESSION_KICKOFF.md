# VouchPlay v2 - Next session kickoff prompt

_Written 2026-09-09, updated at the end of the leaderboard-cron session. Paste the block below into a
fresh conversation. Rewrite this file at the end of each session so it always describes the state a
new conversation actually starts from._

---

You are continuing work on **VouchPlay v2**, a Next.js 15 / Supabase / Vercel pickleball community app
at `D:\claude_\P006b_PlayerProfiling\vouchplay_v2`. I am Jasper (JT Consulting & Analytics).

## Read these first, in this order

1. `CLAUDE.md` - especially the two deployment gotchas. **Next is pinned to 15.5.x on purpose; do not
   upgrade to 16.** Do not delete the root `vercel.json` or the root-level `next` dependency.
2. `AGENTS.md`
3. `notes.md` - **start with the `START HERE` block at the top of `## Next up`.** It is the current
   state of play. The dated entries below it are the running log, newest last.
4. `master_plan.md` - sections 1C through 1M are the post-launch decision record.
5. `VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md` (content is **v1.22**) - the locked
   product spec. Read the v1.22 changelog entry in full, then the sections relevant to whatever we
   take on.

## Where things stand

The app is **live and in production use** for the **B-Steel Hermosa 2026 Grand Pickleball Tournament -
Rise of Empires** (Oct 17-18 2026, Zamboanga City). Registration opened **Sep 9 2026, 5:00 PM Manila**
and real people are signing up right now. Treat production as hot: prefer small reversible slices, and
read the release-order rule in the v1.22 changelog before shipping anything that needs a migration.

**All migrations through 0024 are applied.** Nothing is pending in Supabase.

Shipped in the last session and verified live on both production domains
(`vouchplayph.vercel.app`, `vouchplay-v2.vercel.app`):

- All times display and store as Philippine time (UTC+8). Storage stays UTC; only entry and display
  are anchored. See master_plan 1K.
- A vouch can say "I have watched them play" without claiming a play relationship. This does **not**
  change vouch weight, by design.
- Another player can add an achievement **for** you; it stays invisible to everyone but you until you
  confirm it, and declining deletes it silently.
- Tournament interest merges old planning-taxonomy rows into the organizer's real divisions.
- Leaderboards state what they rank; the category picker reads "Community Champions - vouches given".
- Numbered, centred pagination on Players and Clubs.
- Tapping a compact player row now shows a loading spinner in the STS slot.
- Plain-language contribution copy.
- The nightly leaderboard rebuild records every run and explains itself on Admin → Leaderboards.
- Every displayed date in the app comes from one Philippine-time formatter (handover v1.23).
- Community leaderboards are one tap from the Players tab, with clickable board tabs, a crowned
  podium, a "You" highlight, and a next-update countdown (handover v1.24).
- The leaderboards page leads with its tabs, opens on Top Contributors, and collapses the personal
  stats into one thin row. **Top Players withholds its list until a real tournament placement
  exists**, because it was ranking profile completeness under a play-and-placements heading
  (handover v1.25).

## Open items, highest value first

1. **~~The leaderboard snapshot is stale and the nightly cron is not landing.~~ RESOLVED - the cron
   was never broken.** Every `leaderboard_snapshot_runs` row falls into three batches, all accounted
   for, and the schedule has had exactly one opportunity to fire since `crons` entered `vercel.json`
   (2026-09-08 01:17 UTC). At that instant the last publish was three hours old, so the route's
   cadence guard correctly returned `CADENCE_NOT_DUE`. The board looked empty because the Sep 7
   rebuild predated any contribution rows. See master_plan §1O. The nightly run now writes an
   `audit_logs` row per invocation and Admin → Leaderboards leads with a plain-language "Nightly
   rebuild" panel. **Check the prediction:** the 2026-09-09 01:17 UTC run should skip and the
   2026-09-10 01:17 UTC run should publish, and the panel should say so.
2. **The registration CLOSE time still holds a pre-fix UTC artefact.** It renders
   `Sep 17, 2026, 1:00 AM`, which is not a time I chose. Ask me what it should be; editing it in the
   organizer form now stores correctly.
3. **~37MB of marketing assets are untracked in git** (`deliverables/`, `fb_posting_assets/`, and
   `working/P_006b_VouchPlay_Carousel_About_FAQ_Source_(2026-09).md`). Nothing in `.gitignore`
   excludes them, so this looks accidental. Ask me whether to commit them or ignore them.
4. **Run the controlled authenticated browser walkthrough** in
   `working/P_006b_Phase13_5_Manual_Test_Script_(2026-09).md`. It is the only Phase 13.5 gate never
   evidenced, and it is worth doing against live now that real registrations exist.
5. **Two new surfaces have no live usage yet** - the `observed` vouch option and the peer-nominated
   achievement confirm/decline loop. Both are server-guarded and unit-tested, but nobody has used them.
6. Carry-over ops: clear the Supabase org over-quota before **21 Sep 2026**; move Gmail SMTP to a
   dedicated provider before public scale; wire `supabase gen types` into `packages/db` (types are
   hand-synced today).

## Locked, non-negotiable

Do not change these without asking me explicitly:

- The canonical skill order (Newbie to Pro).
- **CSL, STS, Identity Verified and Skill Verified are four separate concepts.** STS measures
  confidence in a rating (0-5), never ability. VouchPlay never ranks players by STS.
- Vouch weights (1.00 / 1.25 / 2.00 / 2.50). Only the approved-Coach toggle and the **voucher's**
  identity verification move weight. Skill Verified, Facebook and organizer role never do.
- `ELIG_V1` is version-locked and never blocks registration. New gates go **outside** it, as separate
  pure functions (see `evaluateSkillFloor`).
- `audit_logs` is append-only. Anonymous voucher identity is never exposed outside authorized
  Admin/moderation.
- All operational values live in `system_settings`, never hardcoded.
- Server-side authorization on every mutation; RLS governs reads; service-role writes only inside
  audited server actions.

## Gotchas that have already cost time

- **The app sets a 14px root font**, so rem-based Tailwind sizes are 0.875x - `min-h-11` is 38.5px,
  not 44. Use `min-h-[44px]` when a real touch minimum matters.
- **Never parse form input with a bare `new Date(x)`, never format with a bare `toLocale*`, and never
  pin app copy to `timeZone: 'UTC'`.** Use `@vouchplay/core` `time/ph-time.ts` and
  `apps/web/src/lib/format-date.ts`. That combination causes both silent day-shifts and React
  hydration error #418.
- **The Supabase SQL editor only displays the LAST statement's result.** Write migration verification
  as one `union all` query.
- `system_settings` merges code defaults over DB rows, so a new setting needs **no** migration.
- Run tests with `npm run test`, never `npx vitest run packages/core` from the repo root -
  `architecture-isolation.test.ts` resolves paths from `process.cwd()` and gives false failures.
- When verifying a deploy, grep for something that appears in the **SSR HTML** - or fetch the built
  client chunk. Copy that only exists inside a client bundle will never show up in the page source.

## How I want you to work

- Implement using best practices in UI/UX, logical flow, and design, in line with the app's theme and
  concept. **Make it as intuitive, logical and simple as possible - a lot of our users are not
  tech-savvy and span a wide range of ages.**
- Update and integrate the change into the `*.md` files first (`master_plan.md`, `notes.md`), then the
  handover file if it is affected (bump the version and add a changelog entry; leave it as is if
  genuinely unaffected), **then** deploy.
- **If something I ask for already exists in the codebase, tell me** rather than building it again.
  That has already happened once - the "vouches given leaderboard" I asked for turned out to be the
  existing Community Champions board with a stale snapshot.
- Give me a clear recommendation, not a menu of options.
- Report what actually happened, including your own mistakes.

## Gates before any push

`npm run typecheck`, `npm run lint`, `npm run test`, `npm run format:check`, `npm run build` - all
green. Then commit and push `main`, wait for the Vercel deploy, and verify **both** production domains
before claiming anything is live.

**Migrations:** write the migration to `supabase/migrations/`, a paste-ready copy with a single
`union all` verification query to `scripts/`, and give it to me to run in the Supabase SQL editor.
Wait for my verification counts before claiming the feature is live. If the migration gap would leave
a **visible control that errors when tapped**, hold the code out of production until I confirm the
migration - only deploy ahead of a migration when the gap is a silent read.
