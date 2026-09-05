# Data Model

Full logical schema: handover §36 (≈40 tables). Security/RLS: §37. Storage buckets: §38.

Key invariants:

- `profiles` keyed to `auth.users.id`; roles are additive rows in `user_roles`, not account types.
- `vouches`: one active per `(voucher_id, target_id)`; every change written to `vouch_revisions`.
- `player_skill_profiles`: cached CSL/STS snapshot, recomputed on write (never on read).
- `tournament_player_club_representations`: source of truth for multi-club representation.
- `audit_logs`: append-only.

Migrations land in `../supabase/migrations/` starting Phase 1; generated types in
`../packages/db/src/`.
