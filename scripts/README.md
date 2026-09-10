# scripts/

One-off operational scripts. All read `apps/web/.env.local` for the Supabase URL + service-role key
(server-only, never committed) and are meant to be run from the repo root with `node`.

## seed-admin.mjs

Grants a global role (default `super_admin`) to an existing account, by email. Idempotent. The target
must have signed up first. Granting admin is a privilege escalation - run deliberately, only for JT
principals.

```bash
node scripts/seed-admin.mjs jasper.andrew.adjarani@gmail.com
```

## Phase 13C/13D database verification (applied 2026-09-08)

Jasper applied the following files in order on Supabase project `itrosesiywpbaxtmucbb` and confirmed
every embedded verification row:

1. `scripts/apply-0016.sql`
   - `coach_tables=2`
   - `coach_rpc_functions=6`
   - `coach_settings=11`
   - `coach_bucket=1`
   - `coach_rls_policies=2`
   - `existing_organizer_apps_preserved=1` (the recorded pre-migration count)
2. `scripts/apply-0017.sql`
   - `leaderboard_tables=7`
   - `leaderboard_rpcs=4`
   - `contribution_settings=17`
   - `leaderboard_settings=32`
   - `leaderboard_rls_policies=6`

`npm run verify:phase13-controlled` provisions disposable Player and AAL2 Admin sessions, runs all
direct authorization checks, and removes both accounts. The 2026-09-08 release run passed 20/20 with
zero failures or skips. `npm run verify:phase13-rls` remains the non-provisioning variant for supplied
controlled tokens; a skipped controlled-account check is not a release pass.


## check-migration-grants.mjs (wired into `npm run lint`)

Static guard for master_plan §2AA. Scans `supabase/migrations/*.sql` and fails if any
`security definer` function in `public` is left on the Postgres PUBLIC-execute default (no
`revoke ... from public, anon, authenticated`, and not an explicit `authenticated` read helper).
Read-only, no env/network. Read-only authz predicates called inside RLS (`is_staff`, `is_admin`, …)
are on an in-file allowlist. This is the tripwire that would have caught the three world-executable
partner RPCs fixed by migration 0033.

```bash
node scripts/check-migration-grants.mjs
```

## verify-rpc-grants.mjs

Read-only proof (master_plan §2AA) that registration/team-writing `SECURITY DEFINER` RPCs are NOT
callable with the public anon key. Calls each with the anon key, no session, zero-UUID args (writes
nothing); a locked function returns `42501`. Exit non-zero if any write RPC is reachable by anon.
Run after applying `apply-0033.sql` to confirm the three partner RPCs now deny.

```bash
node scripts/verify-rpc-grants.mjs
```

## apply-0033.sql (applied 2026-09-10)

Migration 0033 (master_plan §2AA): revokes public/anon/authenticated and re-grants `service_role`
on `create_team_with_pending_partner`, `decline_partner_invitation`, `replace_pending_partner`.
Privilege-only, idempotent, no deploy, no player-facing change. Paste in the Supabase SQL editor;
expect Verify-1 to return 0 rows and Verify-2 to list only read helpers.

## apply-0034.sql (PENDING — paste in the Supabase SQL editor)

Migration 0034 (master_plan §2AF, handover v1.59): adds six nullable STS_V2 columns to
`player_skill_profiles` (`community_skill_level_v2`, `sts_v2`, `n_eff_v2`, `weight_sum_v2`,
`components_v2`, `calculated_v2_at`) and seeds the 18 `skill_v2_*` / `skill_algorithm_active_version`
/ `vouch_velocity_guard_enabled` settings (`on conflict do nothing`). Additive, no RLS change, no
backfill. The app's V2 write is fail-open until this lands, so deploy order does not matter. Expect
the verify block to return `new_v2_columns=6` and `skill_v2_settings=18`. After applying, run
`node scripts/backfill-skill-v2.mjs` to persist V2 for every player, then review the shadow report
before flipping `skill_algorithm_active_version` in Admin → Settings → Vouch integrity.

## skill-v2-shadow-report.mjs

Read-only. Computes STS_V2 for every rated player IN MEMORY (needs no migration) and writes
`working/skill-v2-shadow-<date>.csv`: V1 vs V2 CSL vs self-rating, N_eff, STS_V2, and every anomaly
flag with its plain-language reason, sorted by |V1−V2|. This is the review artifact Jasper reads
before flipping the public algorithm. Never writes to the database.

```bash
node scripts/skill-v2-shadow-report.mjs
```

## backfill-skill-v2.mjs (run AFTER apply-0034.sql)

Computes STS_V2 for every rated player and writes ONLY the six `*_v2` columns on
`player_skill_profiles` (V1 columns untouched; public output unchanged while the active version is
`STS_V1`). Idempotent; safe to re-run. Prints a summary and refuses to run if the v2 columns are
missing.

```bash
node scripts/backfill-skill-v2.mjs
```
