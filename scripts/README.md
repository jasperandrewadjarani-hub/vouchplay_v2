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

