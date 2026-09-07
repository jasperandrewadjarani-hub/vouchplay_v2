# Phase 13C/13D operations

**Release state (2026-09-08):** Jasper applied migrations 0016/0017 and confirmed every embedded
verification count. Direct anon/Player/AAL2 Admin checks passed 20/20 with no skips. The first bounded
live build published 14 active snapshots, 24 private momentum rows, and two contribution aggregates;
public entries are honestly empty because current profiles have no DOB and the current club is
pending. Production UI flow exercises and deployment of the new application code remain pending.

## Cache and query budget

Public leaderboards are `PUBLIC_REVALIDATED`: the active run and its bounded public entries are read
through `unstable_cache` for 300 seconds under the `leaderboard-snapshots` tag. Each public board read
uses exactly two narrow queries (one active run, one ranked-entry slice); Home performs the three
categories in parallel. Private momentum is `PRIVATE_NO_SHARED_CACHE` and uses one authenticated,
RLS-filtered query for the signed-in player.

The snapshot builder performs one fixed batch of 12 narrow source queries, independent of player
count, then scores every configured category/scope/period in memory. A single service-only
`publish_leaderboard_snapshot` RPC atomically writes each run, its public rows, the relevant private
momentum rows, activation, and immutable audit. Source and payload limits are governed by
`leaderboard_builder_max_subjects`, `leaderboard_builder_max_scopes`, `leaderboard_full_limit`, and
the SQL publisher's hard payload ceiling. There is no `select(*)` and no per-subject source query.
Each source read requests an exact filtered count; a configured bound or PostgREST response cap stops
publication instead of silently producing a partial ranking, so the previous active snapshot remains.

Community contribution has two paths: a four-query bounded recompute after an individual vouch
change, and a two-read/one-bulk-write cadence backfill. Only the aggregate is public. Neither path
passes skill rating, STS, vouch weight, eligibility, or anonymous voucher identity into
`CONTRIB_V1`.

## Invalidation and cadence

- Normal publication: the daily 01:17 UTC `/api/cron/leaderboards` run is authorized by
  `CRON_SECRET` and publishes only when the Admin-configured cadence (minimum 24 hours) is due.
- Admin rebuild: AAL2-only request RPC, followed by the same bounded builder.
- Player opt-out/in: saves immediately, queues one deduplicated rebuild request, and preserves the
  last published snapshot until the next successful atomic build.
- Settings, achievement, club, registration, vouch, fraud/moderation, and account-state changes are
  reflected at the next successful scheduled or Admin build. Failed builds do not replace the active
  snapshot.
- Published snapshots become visibly stale after `leaderboard_publish_cadence_hours`; successful
  publication invalidates the shared tag.

## Cost, egress, and tournament peaks

Home serves at most `leaderboard_home_limit` rows per category from cached snapshots, so tournament
traffic never triggers live scoring or fan-out joins. Full boards are capped by
`leaderboard_full_limit`. Source reads and snapshot payloads are bounded; city/region proliferation is
capped to 20 combined derived scopes by default. The builder is expected to run off-peak and may be paused per category in
`system_settings`. Tournament peaks therefore increase cached snapshot reads, not scoring query
volume. If source caps are approached, lower the scope cap or publish global boards first; do not
raise limits without checking Vercel duration and Supabase egress.

## Privacy and safety

Public player rows exclude leaderboard opt-outs, hidden/private directory profiles, minors by the
configured age threshold, unknown dates of birth by default, restricted accounts, unresolved
high-risk fraud subjects, and Admin exclusions. Opt-out/private/minor/unknown-age players may still
receive their own private momentum; account-restricted, high-risk, and Admin-excluded players do not
receive a ranked private position. Clubs must be active, verified, not deleted, and not excluded.

Milestone notifications are preference-controlled and deduplicated by category/scope/period and
milestone. Only first top-10/podium achievements and meaningful three-or-more-place club improvements
notify. Most Bidded has an always-empty adapter and a false-by-default flag until §16A exists.

## Release procedure

1. Jasper applies `scripts/apply-0016.sql`, records all returned counts, then applies
   `scripts/apply-0017.sql` and records its counts.
2. Run `npm run verify:phase13-rls` with controlled player and AAL2 Admin access tokens. Skips are a
   failed verification gate, not a pass.
3. Exercise application, information request, resubmit, approval, Coach badge, and Admin revoke with
   controlled accounts. Confirm direct private-bucket reads fail and signed evidence opens expire.
4. Build snapshots, opt a player out, rebuild, and prove the public row disappears while private
   momentum remains.
5. Run all repository gates, deploy, wait for Vercel Ready, and verify both production domains over
   HTTP and in a browser.
