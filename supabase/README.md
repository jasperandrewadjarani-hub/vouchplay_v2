# Supabase

Database, Auth, and Storage for VouchPlay v2. Target project (per handover): `itrosesiywpbaxtmucbb`.

## Setup (when secrets are available — Phase 1)

```bash
# one-time
npx supabase login
npx supabase link --project-ref itrosesiywpbaxtmucbb

# local dev DB (optional)
npx supabase start

# apply migrations
npx supabase db push

# generate TS types into the db package
npx supabase gen types typescript --linked > ../packages/db/src/generated.ts
```

## Conventions (handover §36–§38)

- UUID primary keys; `created_at` / `updated_at`; soft-delete where history matters.
- RLS enabled on every user-accessible table; anonymous voucher identity never exposed to
  players/organizers — only authorized Admin/moderation via server credentials.
- Private buckets (identity docs, payment proof, report evidence) served via short-lived signed URLs.
- `audit_logs` is append-only; no normal role may update/delete it.

Migrations land in `migrations/` starting Phase 1 (`0001_core_identity.sql`, ...).
