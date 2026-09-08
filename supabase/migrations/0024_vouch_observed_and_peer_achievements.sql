-- =============================================================================
-- VouchPlay v2 - Migration 0024: "Saw them play" vouches + peer-nominated achievements
--
-- Two additive enum values. Nothing is dropped, renamed, backfilled or re-typed, and no existing
-- row changes meaning, so this is safe to apply while the app is live.
--
--   1. vouch_interaction += 'observed'
--      A voucher who has NOT played with or against someone, but has genuinely watched them play,
--      can now say so instead of picking a play relationship that did not happen.
--      LOCKED-RULE NOTE (§10.5): interaction_type has never been an input to effective_weight -
--      only the coach toggle and the VOUCHER's identity verification move weight. This value is a
--      context label on the vouch, so vouch weighting stays exactly as locked.
--
--   2. achievement_issuer_type += 'peer'
--      Lets another player nominate an achievement FOR you (§9.4). The nomination is invisible to
--      the public until the subject confirms it; verification_status carries the state
--      ('pending_subject' -> 'community'), and that column is free-form text with no check
--      constraint, so it needs no schema change.
--
-- Apply via the Supabase SQL editor (same method as 0001-0023).
-- Postgres forbids USING a new enum value in the same transaction that adds it; these statements
-- only ADD, so they are safe to run together.
-- =============================================================================

alter type vouch_interaction add value if not exists 'observed';

alter type achievement_issuer_type add value if not exists 'peer';
