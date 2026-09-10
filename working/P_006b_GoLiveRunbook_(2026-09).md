# VouchPlay v2 - Go-live runbook for the post-audit fix batch (2026-09-10)

Everything below is built, gate-green, and committed locally on `main`. Nothing is live yet. This is
the ordered set of steps to make it live without disrupting the 350 players or Hermosa registration.

## Step 1 - NOW (safe anytime, zero player impact, no deploy): apply migration 0033

The three partner RPCs are world-executable today (verified). This is the urgent item and it does not
touch any deploy.

1. Supabase SQL editor -> paste `scripts/apply-0033.sql` -> Run.
2. Confirm the output: **Verify-1 returns 0 rows**; **Verify-2** lists only read helpers (no
   registration/team/vouch writer).
3. From the repo root, prove it from the outside:
   ```bash
   node scripts/verify-rpc-grants.mjs
   ```
   Expect every write RPC to report `PASS ... denied to anon (42501)`, including the three partner
   RPCs that fail today.

Player impact: none. The app calls these via the service-role client, which is unaffected.

## Step 2 - IN THE WINDOW (01:00-06:00 PHT): the code deploy

The code batch (auth dedupe, onboarding consent, online-chip resilience) is one commit. It is
read-side / onboarding-only / cosmetic, but `lib/auth.ts` runs on every page, so ship it when traffic
is lowest. The skew self-heal (v1.45) is already in players' clients, so open tabs will hard-reload
once, gracefully.

1. **Before pushing**, flip the Vercel dashboard setting that has no code (bundles into this deploy):
   - Project -> Settings -> Functions -> **Region = Singapore (sin1)**. (Biggest latency/cost win;
     the DB is in Singapore, functions currently run in US-East.)
   - While there, confirm **Skew Protection = On** and **Observability Plus = off**.
2. Push `main` (auto-deploys), or promote via Vercel. One deploy only.
3. **Verify both domains** once the build finishes:
   ```bash
   for d in vouchplayph.vercel.app vouchplay-v2.vercel.app; do
     curl -s "https://$d/tournaments" | grep -o 'dpl=[A-Za-z0-9_]*' | sort -u | head -1
     curl -sI "https://$d/tournaments" | grep -i x-vercel-id
   done
   ```
   Expect a NEW `?dpl=` id on both (it flips on deploy) and `x-vercel-id` now reading `sin1::sin1`
   (was `sin1::iad1`).
4. Smoke, signed in: header + online chip render; the unvouched nudge and the legal gate still behave;
   a NEW account's onboarding now shows the Terms/Privacy checkbox and refuses to finish unchecked.
5. Watch Vercel logs ~15 min for `[client-error]` spikes. Rollback = promote the previous deployment
   (no migration to undo; the code is additive/read-side).

## Step 3 - HAND OFF (no deploy): the skill-mismatch list

`working/eligibility-scan-2026-09-10.csv` (regenerate anytime with
`node scripts/audit-eligibility-scan.mjs b-steel-hermosa-2026-grand-pickleball-tournament-b5301d`)
lists the live registrations whose members drifted above their division cap after registering. Give it
to the Hermosa organizer to review per team. The organizer's list already shows the amber "Potential
skill mismatch" chip, so this is a heads-up, not a code dependency. It is NOT committed to git
(confidential live-player data) - it lives only in `working/`.

## Deferred - decisions/phases still owed to you

- **Skill-drift policy** (§2AB): do nothing / require an evidence threshold before community skill
  overrides self-rating in the fit gate / freeze skill at registration. Pick one; nothing ships until
  you do. 19 current Hermosa slots are affected.
- **Caching layer** on uncached public reads (§2AC): its own deploy after this batch is stable ~24h.
- **Post-window cleanup migration**: drop `move_player_registration`, remove the dead
  `hasPlayerRegistrationChangePolicy`, and add `player_fits_division` inside `register_team` as
  SQL-side defense in depth.
- **Legal**: counsel review + a privacy/DPO email, then bump `LEGAL.version` (re-prompts everyone) -
  after the tournament window.
- **Dashboard numbers to report back into notes.md**: Supabase egress used vs the 5 GB free quota.
