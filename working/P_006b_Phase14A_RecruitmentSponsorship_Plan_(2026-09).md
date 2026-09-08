# Phase 14A - Recruitment / Sponsorship foundation (plan)

**Date:** 2026-09-08 · **Scope chosen by Jasper:** 14A only (no bidding, no offer-based leaderboards).
**Source contract:** `docs/PHASE_14_RECRUITMENT_SPONSORSHIP_AND_BIDDING_HANDOVER.md` "Locked requirements
if 14A is approved".

## Concept

Active, verified clubs publish controlled **offers** (recruitment or sponsorship). Players explicitly
opt in to being open to opportunities, browse relevant open offers, and respond. Clubs review
responses. Everything is server-authorized, RLS-protected, rate-limited, and audited. Offers never
influence CSL, STS, Skill Verified, vouch weight, tournament eligibility, contribution, or any
leaderboard. No bidding, no scraped contacts, no unsolicited mass outreach, no private-data reveal.

## Locked assumptions (stated, per Auto mode)

- **Offer types:** `recruitment` (club looking for players) and `sponsorship` (club offering
  sponsorship). Same lifecycle; type is a label plus copy differences.
- **Player opt-in:** reuses the existing `profiles.open_for_sponsorship` flag (migration 0001;
  default off) as a single reversible "open to club opportunities" switch - no new column added. A
  player must be opted in to respond to an offer. Turning it off stops new responses; existing
  responses remain until withdrawn.
- **Targeting (advisory only, never a hard gate):** an offer may target an optional city and an
  optional skill band (min/max ordinal). Used only to sort/label relevance in the player browse; it
  never blocks a response and never touches eligibility.
- **Visibility:** only `open`, non-expired offers from a visible (`verified` + `active`,
  non-deleted/suspended) club are public. Drafts and closed/cancelled/expired offers are
  manager/staff-only.

## Schema - migration 0023 (`0023_club_offers.sql` + `scripts/apply-0023.sql`)

- Enums: `club_offer_type (recruitment, sponsorship)`, `club_offer_status (draft, open, closed,
  expired, cancelled)`, `club_offer_response_status (submitted, accepted, declined, withdrawn)`.
- `club_offers`: id, club_id → clubs (cascade), type, title (≤120), description (≤2000), city,
  min_skill/max_skill (ordinal 0-6, nullable), status (default draft), published_at, expires_at,
  created_by → profiles, closed_reason, created_at, updated_at (set_updated_at trigger).
- `club_offer_responses`: id, offer_id → club_offers (cascade), player_id → profiles (cascade),
  status (default submitted), message (≤500), decided_by, decided_at, created_at, updated_at. Partial
  unique index: one live response per (offer, player) where status in (submitted, accepted).
- `profiles.open_to_recruitment boolean not null default false`.
- RLS (reads only; writes via service role, mirroring clubs):
  - `club_offers`: public read when status = open and (expires_at is null or future) and the club is
    visible; managers (`is_club_manager`) read their club's offers in any status; staff read all.
  - `club_offer_responses`: read own (`auth.uid() = player_id`) OR manager of the offer's club OR
    staff (subquery to the offer's club).
  - `profiles.open_to_recruitment` rides existing profile read policy (it is not sensitive).
- Settings seeded: `recruitment_enabled` (default true), `club_offers_per_24h` (default 10),
  `offer_responses_per_24h` (default 20), `offer_default_expiry_days` (default 30).
- Verification: `select 'club_offer_objects', count(*)` over the two tables + the profile column +
  settings; expected counts in the `-- Expect` comment.

## Pure core (`packages/core/src/offers/`)

- `lifecycle.ts`: offer status tuple + `canChangeOfferStatus(current, next)` (draft→open,
  open→closed/cancelled, open→expired, no revival); response status tuple +
  `canChangeResponseStatus` (submitted→accepted/declined/withdrawn, terminal otherwise); type guards.
- `targeting.ts`: pure `offerRelevanceToPlayer({ city, minSkill, maxSkill }, { city, skill })` →
  a small score/label ('In your city', 'Matches your level', 'Open to all'); never blocks.
- Unit tests for both. Export via `packages/core/src/index.ts`.

## Validation (`packages/validation/src/offer.ts`)

- `offerCreateSchema` (type, title, description, city?, minSkill?, maxSkill?, expiresInDays?),
  `offerResponseSchema` (message?). Refinements: min ≤ max skill.

## Server actions (`apps/web/src/lib/actions/offer.ts`) - all service-role writes + audit + revalidate

- `createOffer`, `updateOffer` (draft only), `publishOffer`, `closeOffer`, `cancelOffer` - club
  manager of a verified+active club; publish sets `expires_at` from settings; rate-limited by
  `club_offers_per_24h`.
- `respondToOffer` (player, opted-in, offer open, rate-limited by `offer_responses_per_24h`, one live
  response), `withdrawResponse` (player).
- `decideResponse` (manager: accept/decline; notifies the player).
- `setRecruitmentOptIn` (player toggles `open_to_recruitment`).
- Notifications (category `clubs`, non-critical): `offer_response_received` (to club managers),
  `offer_response_accepted` / `offer_response_declined` (to the player). Added to
  `packages/core/src/notifications/catalog.ts` + params.

## UI

- **Club manage page** (`clubs/[slug]/manage`): an "Opportunities" section - list the club's offers
  with status, create/edit draft, publish, close/cancel, and per-offer responses with accept/decline.
  Gated by `canManage` and `verification_status = verified`.
- **Player browse** (`/opportunities`): open offers, relevance-sorted, with an opt-in banner/toggle
  and a respond action; empty/loading/error/permission states; accessible, mobile-first, dark/light.
- **Opt-in** also surfaced on the player's own profile/settings.
- Nav: add "Opportunities" where it fits without crowding (secondary nav / clubs area).

## Verification & release gates

- `scripts/phase14a-abuse.mjs`: anon cannot read draft/closed offers or any response; a player cannot
  read another player's responses; anon/auth cannot write offers/responses; manager can only act on
  their own club; opted-out players cannot respond. Plus append-only audit and no leaderboard/eligibility
  linkage.
- `npm run typecheck | lint | test | format:check | build`. Copy migration to `scripts/`, Jasper
  applies `apply-0023.sql` and returns counts, then commit/push, Vercel Ready, verify both domains.
- Update the locked master handover (v1.18) before/with the schema+UI change.

## Phasing

1. Schema 0023 + core lifecycle/targeting + validation + settings (local, no deploy).
2. Server actions + notifications.
3. UI (club offers + player opportunities + opt-in).
4. Verification, gates, migration application (Jasper), deploy, both-domain check.
