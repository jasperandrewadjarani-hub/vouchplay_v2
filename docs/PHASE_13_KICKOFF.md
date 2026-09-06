# VouchPlay v2 - next-conversation handover prompt

Paste the block below into a **new** Claude Code conversation to continue the build. Everything it
references is on `main` and live.

---

Continue the VouchPlay v2 build. Project folder: `D:\claude_\P006b_PlayerProfiling\vouchplay_v2`
(move the session there before touching files).

First, read for full context:

- `CLAUDE.md` and `AGENTS.md` - working rules + the Next-15/Vercel deploy gotcha (do NOT undo the
  Next 15 pin, root `vercel.json`, or the `middleware.ts` rename).
- `notes.md` - running execution log + decisions (read the latest entries first).
- `VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md` (content v1.2) - the LOCKED source of
  truth. Read §0Z "Current Build Status" first.

## Where things stand (all LIVE at https://vouchplayph.vercel.app, Supabase `itrosesiywpbaxtmucbb`)

**Phases 0-12 are DONE and live. Migrations 0001-0013 all applied.** The app currently covers: auth/
players/profiles; the vouch engine (STS_V1, weighted-median CSL, Skill-Verified); safety & moderation
(reports, skill reviews, support, fraud flags, staff queue behind MFA, audit_logs); clubs; tournaments
+ divisions + organizer role; partner/team/registration (transactional slot RPCs); payments (manual
proof, private bucket); the **eligibility / anti-sandbagging engine (ELIG_V1)** - the product's
headline differentiator, neutral decision-support with organizer override + audit; the **organizer
dashboard** (overview tiles + registration filters) and **exports** (canonical Tournament-System XLSX
locked-contract adapter + normalized XLSX + CSV, with a structural compatibility test); **notifications**
(in-app complete, email-for-critical ready-but-inert, preferences); and **achievements / skill tags /
playing history** with the §50 HISTORICAL_SKILL_MISMATCH signal lit up.

**Deployment/ops reminders (do not skip):**
- After pushing to `main`, Vercel auto-deploys; then **re-alias**: `npx vercel alias set
  <deployment-url> vouchplayph.vercel.app` (the vanity domain is a manual alias).
- **Dashboard automation is classifier-blocked**, so any new migration is handed to Jasper as an
  `scripts/apply-00NN.sql` to paste + run in the Supabase SQL editor; ask for the verify numbers.
- All gates must be green before commit: `npm run typecheck && npm run lint && npm run test &&
  npm run format:check && npm run build`.
- **Confirm the plan (and scope) before any large change.**

**Open items carried over (not blockers):**
- Email channel is inert until `SMTP_USER`/`SMTP_PASS` are added to the app env (then critical-event
  email switches on with no code change).
- Desktop-Excel native-integrity confirmation on the demo export workbooks is still pending from Jasper.
- Clear the Supabase org over-quota before 21 Sep 2026; switch Gmail SMTP -> a dedicated provider
  before public scale; `supabase gen types` -> `packages/db` once the CLI/token is wired (types are
  hand-synced for now).

## Do NEXT - pick with Jasper, then confirm scope before building

The remaining planned work (choose the next target with Jasper):

1. **Admin Control Center (§30-§31, §13)** - a `/admin` area for `system_settings` management (all the
   admin-tunable values are already in the DB and read at runtime), user/role administration, identity-
   verification review, and ops dashboards. Behind `requireStaffPage` + `requireStaffMfa` (already
   built). This is the natural next phase and unblocks self-serve tuning of every threshold.
2. **§16 Recruitment & Sponsorship** (`club_offers`) + **§16A Gamified Player Bidding** (`player_bids`,
   points-based) - the club<->player market that was deferred out of Phase 5.
3. **Organizer dashboard depth (§26.6/§26.8/§26.9)** - manual waitlist reprioritize, participants
   search, richer communications; and the deferred export ZIP-of-CSVs.
4. **Notifications depth (§27.4)** - admin notifications fan-out; a real async email outbox worker;
   web/native push adapters.

### Gate (must pass, every phase)
- Domain logic in `@vouchplay/core` is pure + unit-tested; server-side authz + RLS on everything;
  operational values are Admin settings in `system_settings`, never hardcoded; `audit_logs` append-only;
  anonymous voucher identity never exposed; no banned/defamatory eligibility labels.
- **UI/UX (handover §33.5A):** every navigation/filter gives immediate feedback on the tapped control
  (`LinkSpinner`/`useLinkStatus` inside `<Link>`s; `useTransition` spinners on param-nav buttons);
  never call a `'use client'`-exported function from a Server Component (put shared helpers in a
  non-client util).
- All gates green; commit + push to `github.com/jasperandrewadjarani-hub/vouchplay_v2` on `main`
  (auto-deploys); **re-alias `vouchplayph.vercel.app`** after the deploy. Update `notes.md` + §0Z.
