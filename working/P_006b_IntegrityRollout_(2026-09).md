# Morning brief: rig-resistant Community Skill (STS_V2) - what I built overnight, what you decide

**For:** Jasper · **Date:** 2026-09-11 (overnight) · **Decision record:** master_plan §2AF · **Spec:**
handover §10.11, §11.4, changelog v1.59 · **Agent Report:** orchestrator = Fable 5.1; executors =
5× Sonnet (E1 engine, E2 config/migration, E3 app integration, E4 UI, E5 scripts) + 1× Sonnet code map.

## The one-paragraph version

Your vouch system was rig-able because every vouch counted as one *independent* opinion no matter who
gave it - and on a 3-day-old platform with zero identity-verified accounts and zero coaches, that meant a
brand-new account weighed exactly the same as a real, paid-up player. I built **STS_V2**: a vouch now
counts as `credential × voucher-trust × independence`, so fresh unvouched accounts count a quarter,
mutual back-scratching counts half, a club bloc of any size collapses to ~2.5 opinions, and a player's
own self-rating anchors the median until real cross-club evidence accumulates. It runs **alongside** V1
on every vouch, the public number stays on V1 until you flip ONE admin setting, and a **live velocity
guard** now quarantines low-trust vouch bursts the moment they happen. I ran V2 against production
in shadow: **105 of 309 rated players (34%) would change band, overwhelmingly down one band** - that is
the inflation coming out - and the ten most "corrected" profiles are exactly the ones where one or two
low-trust vouches pushed a self-rated Beginner to Intermediate (one to Pro). Two of them are Hermosa
registrants flagged yesterday; under V2 they sit back in the band they registered in.

## What is live after the deploy (no action from you)

- **Velocity guard (the one automatic action).** ≥8 vouches on one player inside 6h with ≥60% from
  low-trust vouchers → those low-trust vouches are *held* (reversible `invalidated` with reason
  `velocity_hold:<flag>`), excluded from the rating until a moderator releases them. Kill switch:
  Admin → Settings → Vouch integrity → "Velocity guard enabled".
- **Automated integrity flags** (the §11.2 detectors that were specified but never built):
  LOW_TRUST_SWARM, RECIPROCAL_RING, CLUB_BLOC, SPIKE - informational, routed to Staff → Moderation →
  **Vouch integrity** with a plain-language reason, the player's Self / V1 / V2 / independent-evidence
  count, and three calm actions (release held vouches · keep on hold · mark reviewed).
- **STS_V2 computed on every vouch write** and persisted once migration 0034 exists (until then the
  V2 write silently no-ops - nothing breaks).
- **Player-facing:** a voucher whose vouch was held sees "Thanks - your vouch is saved. It will count
  after a quick review." A player with held vouches on their profile sees "Some recent vouches are
  being reviewed and aren't counted yet." Nothing names anyone; anonymity is untouched.
- **Admin → Settings → "Vouch integrity"**: 18 tunables + the public switch, already seeded live.

## What only you can do (in this order)

1. **Read the shadow report:** `working/skill-v2-shadow-2026-09-10.csv` (sorted by biggest change).
   Columns: self_rating, csl_v1, csl_v2, delta, sts_v1/v2, vouchers_v1, n_eff_v2, flags, reasons.
   Headline numbers: 309 computed · band changes 105 (down: −1 ×72, −2 ×17, −3 ×3, −5 ×1; up: +1 ×10,
   +2 ×1, +3 ×1) · Skill-Verified 221 → 148 · flags: reciprocal ring 28, spike 24, club bloc 7,
   low-trust swarm 2, active burst 1.
2. **Paste `scripts/apply-0034.sql`** in the Supabase SQL editor (additive columns + the 18 settings;
   expect `new_v2_columns=6, skill_v2_settings=18`). Safe anytime; nothing public changes.
3. **Run `npx vite-node scripts/backfill-skill-v2.ts`** (writes only the six v2 columns; refuses to run
   until step 2). Re-run the shadow report if you tune any setting first.
4. **Decide the flip and its timing.** Admin → Settings → Vouch integrity → "Active skill algorithm"
   = `STS_V2`. One setting, instant, reversible. **Do it after the Hermosa registration window**, not
   during it: a third of players move a band, mostly down, and that re-runs tournament eligibility.
   If 34% feels too aggressive, soften before flipping: raise `skill_v2_bloc_decay` (0.6 → 0.75) or
   lower `skill_v2_prior_weight` (2 → 1.5), then re-run the shadow report and look again.
5. **Skim the Vouch integrity queue** once the deploy is live - the 62 informational flags from the
   shadow run will populate as those players' vouches next change; the one active burst may already
   be there.

## How the math works (so you can explain it to the community)

- **Voucher trust.** Anchored = has a paid/confirmed tournament registration, identity verification,
  or coach role → 1.0. Unanchored → judged by *standing*: vouches they have received from others
  (anchored giver 1.0, unanchored 0.5, mutual pairs excluded), floor 0.6 once they have any; a
  brand-new account nobody has vouched → 0.25. Mild account-age ramp (0.5→1.0 over 7 days).
- **Independence.** Reciprocal vouch (they vouch you, you vouch them) ×0.5. Club bloc: vouchers from
  the same club are ranked by trust and the j-th is ×0.6ʲ - so 20 club-mates ≈ 2.5 opinions.
- **Shrinkage.** Your self-rating enters the weighted median with weight 2. A couple of vouches
  cannot flip your band; a real consensus still can.
- **Confidence.** STS_V2 uses *independent-equivalent* evidence (N_eff) instead of a raw count, and
  Skill Verified needs N_eff ≥ 2 - it can no longer be bought with a swarm.
- **Worked example (unit-tested):** 12 fresh same-club accounts say "5", two anchored cross-club
  players say "2", you self-rate 2. V1: 5. V2: 2, low confidence, bloc flagged. The attack costs 12
  accounts and moves nothing.

## Why it is legally clean

Every signal is derived from data VouchPlay already holds for its stated purpose (vouch graph, club
membership, registrations, verification status, timestamps). No new fields, no IP/device
fingerprinting. Anonymous vouchers remain anonymous (staff-only RLS unchanged). The only automatic
action is a reversible hold reviewed by a human with an audit trail; nobody is auto-suspended. Ask
counsel to add one sentence on integrity processing to the Privacy Policy at review.

## Honest limits

- Sock-puppet rings that share no club are caught by low trust + reciprocity, not by bloc decay.
  Phase 2: mutual-vouch community detection as an extra bloc key.
- A strong player who simply keeps a low self-rating and has little evidence stays low - V2 makes a
  low rating hard to *manufacture*, not impossible to *lack evidence for*. The organizer flag and
  skill reviews remain the human backstop.
- Thresholds are first-pass. Tune from the shadow CSV and the first week of flags; they are all live
  settings.

## Deferred (not tonight, tracked)

- Middleware prefetch-skip and the viewer-mixed caches (§2AC phase 2), the cleanup migration, the
  `LEGAL.version` bump - all still post-event per §2AB/§2AE.

## Deploy verification

_(filled in below after the push)_
