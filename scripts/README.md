# scripts/

One-off operational scripts. All read `apps/web/.env.local` for the Supabase URL + service-role key
(server-only, never committed) and are meant to be run from the repo root with `node`.

## seed-admin.mjs

Grants a global role (default `super_admin`) to an existing account, by email. Idempotent. The target
must have signed up first. Granting admin is a privilege escalation — run deliberately, only for JT
principals.

```bash
node scripts/seed-admin.mjs jasper.andrew.adjarani@gmail.com
```

## Pending manual step — apply migration 0003

`supabase/migrations/0003_avatars_and_public_facts.sql` is written but NOT yet applied to the live DB
(it needs DDL, i.e. the Supabase SQL editor — the same method used for 0001/0002). It:
- records the `avatars` bucket config (the bucket itself is already created at runtime),
- adds `storage.objects` owner-folder policies,
- adds `public_player_facts(ids uuid[])` — the RLS-clean way to expose public badge facts.

After applying it, switch the badge reads in `apps/web/src/lib/players/queries.ts` from the
service-client path to calling `public_player_facts()` via the anon client.
