# Runbook

## Environments (handover §56)

- **Development** — local Supabase or isolated dev project; fake email; seed users.
- **Staging** — production-like, separate DB/storage.
- **Production** — locked secrets, admin MFA, backups, monitoring. Never share a DB with staging.

## Deploy

- Vercel: preview per PR, staging from designated branch, production from approved `main`.
- No manual production DB edits (emergencies must be backfilled into migration history).

## Backups (handover §57)

- Managed daily PostgreSQL backups; PITR if plan permits; documented restore; test restore before
  public launch.

## Quota / cost response (handover §34A.19)

- Watch Supabase egress/DB/storage/Realtime, Vercel invocations/transfer, email sends/bounces.
- Thresholds: 50% info · 70% investigate · 85% alert · 95% critical action. Enable spend caps.

## Secrets needed before Phase 1

Supabase URL + anon + service_role keys; Google OAuth client id/secret; transactional email provider
key (Resend/Postmark/SendGrid — not Gmail).
