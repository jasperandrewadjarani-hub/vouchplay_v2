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

## apply-0033.sql (applied 2026-09-__ — pending)

Migration 0033 (master_plan §2AA): revokes public/anon/authenticated and re-grants `service_role`
on `create_team_with_pending_partner`, `decline_partner_invitation`, `replace_pending_partner`.
Privilege-only, idempotent, no deploy, no player-facing change. Paste in the Supabase SQL editor;
expect Verify-1 to return 0 rows and Verify-2 to list only read helpers.
