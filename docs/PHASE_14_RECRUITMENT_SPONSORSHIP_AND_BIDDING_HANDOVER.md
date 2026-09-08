# VouchPlay Phase 14 Handover - Recruitment, Sponsorship, and Gamified Bidding

**Status:** Ready for scoped planning; do not implement until Jasper confirms the selected slice.  
**Predecessor:** Phase 13C Coach Flow, 13A Community Contribution, and 13D Home Leaderboards are
production-verified. Maintenance refinements 0018 and 0019 are committed but require Jasper to apply
their exact SQL Editor scripts and return verification counts before optional-DOB leaderboard rows or
the privacy-safe tournament demand flow can be considered live.

The pre-Phase-14 tournament refinement adds migration 0020 for private payment QR delivery and does
not change the Phase 14 decision. Payment QR supports the existing manual proof-and-review flow only;
it is not a payment gateway or an automated confirmation mechanism.

## What is already live

- Coach applications, AAL2 review, private evidence, active-role badge, Coach vouch, and audited
  revocation.
- `CONTRIB_V1`, privacy-safe `LEADER_V1` Players/Community Champions/Clubs snapshots, private
  momentum, opt-out, Admin controls, and a gated empty Most Bidded adapter.
- Mobile resume recovery and detailed/compact Player directory views.
- Staged (pending 0019): planning-only tournament demand by standard division, anonymous-browser
  HMAC identity (not fingerprinting), aggregate breakdown/public-profile avatar stack, a dedicated
  audited `/admin/clubs` view, dark-first default, and action-first Home hierarchy. Interest never
  reserves a slot or becomes recruitment consent.

## Recommended Phase 14 objective

Build **Recruitment and Sponsorship foundation first**, then decide whether to activate the separate
Gamified Bidding experience. This preserves the locked boundary: Most Bidded remains empty and hidden
until the complete §16A system-not merely a table-exists.

## Decision required from JT before implementation

Choose one:

1. **14A - Recruitment/Sponsorship only (recommended):** verified clubs publish controlled offers;
   players opt in/out, browse relevant opportunities, and contact/respond through auditable,
   rate-limited flows. No bidding, no leaderboards based on offers.
2. **14A + 14B - Full Gamified Bidding:** adds explicit non-monetary bid points, bidding lifecycle,
   anti-wash-bidding controls, player/club notifications, and then the `Most Bidded` snapshot adapter.
3. **Pilot hardening instead:** defer §16/§16A and complete the remaining live-pilot gates: real
   critical-email inbox confirmation, Supabase quota remediation, full dress rehearsal, native Excel
   export confirmation, and organizer/JT TOTP onboarding.

## Locked requirements if 14A is approved

- Only active, verified clubs may publish offers; player eligibility/visibility and blocks apply
  server-side and through RLS.
- Player interest is explicit and reversible. No scraped contact data, unsolicited mass outreach, or
  reveal of private player data.
- Offers, responses, moderation, expiry, notifications, and retention each have state machines,
  rate limits, immutable audit, loading/empty/error/permission states, and accessible mobile UI.
- Offers never influence CSL, STS, Skill Verified, vouch weight, tournament eligibility, contribution,
  or existing leaderboards.

## Additional requirements before 14B can ship

- Complete §16A data model and transactional bid lifecycle with idempotency, expiry, withdrawal,
  anti-reciprocity/wash-bidding checks, immutable audit, and moderation controls.
- Define public DTOs that expose aggregate bid-interest only; never disclose bidder identity where the
  product rule protects it, bid anti-abuse signals, private offer content, or personal contact data.
- Add a pure versioned scoring engine with fixtures, strict dependency guards, snapshot builder,
  rollback, Admin pause/exclusion/rebuild controls, milestone-only notifications, RLS/API abuse tests,
  and a controlled live lifecycle.
- Only then enable `leaderboard_most_bidded_enabled` and the existing empty adapter.

## Required delivery gates

- Update the locked master handover before schema/UI changes; add migrations plus exact
  `scripts/apply-00NN.sql` copies.
- Keep all domain logic pure and unit-tested. Enforce server authorization and direct RLS/API tests.
- Preserve anonymous-voucher boundaries and append-only `audit_logs`; never use service-role credentials
  in client code.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run format:check`, and `npm run build`.
- Jasper applies migrations in the Supabase SQL Editor and returns exact verification counts. Commit,
  push `main`, wait for Vercel Ready, and verify both production domains over HTTP and in a browser.

## Pre-Phase-14 operational prerequisite

- Apply `scripts/apply-0018.sql` and `scripts/apply-0019.sql` in order. Expected 0019 values are
  `demand_settings=3`, `demand_table=1`, `demand_rpcs=2`, and `demand_direct_policies=0`. Then run
  the direct anon/auth/service RLS abuse check for `tournament_demand_interests` before enabling a
  public launch tournament.

