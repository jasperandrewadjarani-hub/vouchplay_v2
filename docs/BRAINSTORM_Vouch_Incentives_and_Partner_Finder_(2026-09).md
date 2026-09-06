# Brainstorm: Vouching incentives + Partner suggestion engine

**Project:** P006b VouchPlay v2 · **Date:** 2026-09-07 · **Status:** ideas only, nothing implemented.
Two product/mechanism explorations Jasper asked for, with best-practice references and a proposed
code design that fits VouchPlay's locked architecture. No schema or code changed by this document.

---

## Part 1 - Incentivizing the vouching system

### The core tension (read first)
VouchPlay's #1 non-negotiable is **no circular scoring**: giving vouches must never raise your own
CSL, STS, Skill-Verified status, or vouch weight. So any incentive layer has to live in a **separate
"contribution" dimension** that is cosmetic/status-only and provably cannot leak into skill or trust
weighting. Get this wrong and we recreate exactly the flaw v1 had.

The second trap is **Goodhart's law**: the moment you reward *count*, you get spammy, low-quality,
reciprocal-ring vouches. The one-active-vouch-per-pair rule already caps raw spam, but a naive
"points per vouch" would still push quantity over honesty.

### What similar systems do (references)
- **Stack Overflow** - reputation + a 3-tier badge system (bronze/silver/gold). Crucially, reputation
  for *curating* (reviewing, voting) is separate from *authoring*. Badges reward specific good
  behaviours, not raw volume. Lesson: separate the "helper" identity from the "content" score.
- **Reddit karma** - lightweight, social; "post" vs "comment" karma split. Lesson: a low-stakes,
  visible number drives participation without being load-bearing.
- **Duolingo (XP, streaks, leagues)** - streaks + weekly leagues are the strongest retention lever in
  consumer apps. Lesson: recurring, time-boxed goals beat a lifetime counter.
- **Strava kudos / LinkedIn endorsements** - reciprocity is the engine (I endorse you, you endorse
  me) but also its weakness (inflation). Lesson: reciprocity drives volume but must not feed a
  score that matters.
- **Trust systems (eBay/Airbnb)** - reviews are reciprocal and time-boxed; both sides commit before
  seeing the other. Lesson: structural anti-collusion beats after-the-fact policing.

### Proposed mechanism: "Voucher Reputation" (a separate contribution layer)
A distinct, public, **status-only** dimension - call it **Community Contribution** (working name;
avoid "score" to prevent confusion with STS). Three visible pieces:

1. **Contribution level / XP** - a number that only ever goes up from *giving* vouches, endorsing
   skill tags, and writing helpful comments. Displayed as a small badge on the profile (e.g.
   "Trusted Voucher · Lv 4"). **Never** an input to CSL/STS/weight/eligibility.
2. **Badges** (the real motivator - discrete, nameable achievements):
   - *First Vouch*, *10 / 50 / 100 players vouched* (coverage, not per-pair spam).
   - *Newcomer Champion* - vouched for players who had 0-1 vouches (rewards seeding the graph where
     it's thin, which is the real network need).
   - *Consistent Voucher* - an N-week streak of at least one vouch (Duolingo-style retention).
   - *Community Pillar* - a rare, admin/heuristic-granted top tier.
3. **Quality signal, not just volume** - the anti-Goodhart core. Reward vouches that prove
   *informative* over time, e.g. your vouch's skill level lands near the eventual community consensus
   (weighted-median CSL) for that player, or the player you vouched early goes on to accumulate
   independent vouches. This rewards *accurate* early vouching, not spraying ratings.

### Anti-gaming (must-haves)
- **Coverage-based, not pair-repeat** - XP is per *distinct player vouched*, and updates to an
  existing vouch don't grant new XP (the per-pair rule already enforces one active vouch).
- **Reciprocity dampening** - a mutual A↔B vouch pair earns less than vouches across a wider graph;
  detect tight reciprocal rings and flat-line their contribution (reuse the fraud-flag machinery).
- **Diminishing returns / decay** - each additional vouch in a short window is worth less; old XP
  can decay so status reflects *ongoing* good citizenship, not a one-time blitz.
- **Consensus gating** - quality bonuses only settle *after* a player has enough independent vouchers,
  so you can't self-certify accuracy.
- **Hard wall to skill** - a unit-test guard (like the §25.6 no-defamation guard) that fails the
  build if the contribution field is ever read by the STS/CSL/weight/eligibility code paths.

### How it maps onto the current architecture
- Pure, versioned engine in `@vouchplay/core` (e.g. `CONTRIB_V1`), unit-tested like STS_V1/ELIG_V1;
  computes level + badge eligibility from a player's *outgoing* vouch/endorsement history.
- Recompute-on-write, cached aggregate row (mirror `player_skill_profiles`) - e.g.
  `player_contribution` (public-read), never joined into skill reads.
- All thresholds (XP curve, streak length, badge cutoffs) are **admin settings** in `system_settings`
  (consistent with the "never hardcode operational values" rule) and tunable from the new Admin
  Control Center.
- Ties into the existing achievements/skill-tags UI (Phase 12) for display.

### Recommendation
Ship a **small v1**: Contribution level + 4-5 badges + a weekly streak, coverage-weighted with
reciprocity dampening; hold the consensus-accuracy bonus for v2 once there's enough vouch volume to
compute it meaningfully. Highest impact for least gaming risk, and it directly attacks the cold-start
network problem (rewarding vouching for thinly-vouched newcomers).

---

## Part 2 - Suggesting a partner (community + skill matchmaking)

### Goal
Given a player, suggest compatible partners for doubles - the "Partner Finder" that the profile's
"Request to partner" button and the LFP (`looking_for_partner`) flag are waiting on.

### What similar systems do (references)
- **Playtomic / PlayYourCourt (padel/tennis)** - level-based matchmaking: match players within a
  narrow skill band + location + availability; a reliability/level system underpins it. Closest
  analogue to VouchPlay.
- **Meetup / sports-partner apps** - proximity + activity type + schedule overlap; simple filters
  beat clever ML at small scale.
- **LinkedIn "People You May Know" / Facebook friend suggestions** - graph proximity (mutual
  connections, shared groups) is a very strong signal. VouchPlay's vouch graph + club membership is
  a direct equivalent.
- **Netflix/Amazon collaborative filtering** - "players who partnered with X also partnered with Y";
  needs history volume, so it's a *later* signal, not cold-start.
- **Dating apps (compatibility score + explainability)** - a single ranked feed with a visible
  "why you match" line drives trust and action. We should copy the explainability.

### Signals VouchPlay already has (no new data collection needed)
- **Skill compatibility** - `community_skill_level` (CSL) proximity; for doubles you can offer both
  "similar level" (balanced) and "complementary" (a stronger + developing pairing) modes.
- **Location** - `city` / PH-cities (same or nearby).
- **Graph proximity** - the vouch graph (mutual vouchers, you-vouched-them / they-vouched-you),
  shared **clubs** (`club_memberships`), shared tournament participation.
- **History** - past partners from `team_members` (who they've teamed with before, and repeat
  partners), tournament/division formats they enter.
- **Intent** - the `looking_for_partner` flag (only suggest among opted-in / LFP players, or those
  who haven't opted out).
- **Skill tags** (Phase 12) - play-style traits for finer compatibility ("baseliner" + "net player").
- **Eligibility guardrails** - sex/age/format constraints from divisions so a suggestion is actually
  registerable.

### Proposed mechanism: a ranked, explainable suggestion feed
A pure scoring function `suggestPartners(viewer, candidates, weights)` in `@vouchplay/core`
(versioned `MATCH_V1`, unit-tested), returning ranked candidates each with a **reason breakdown** for
explainability. Blend (all weights admin-tunable in `system_settings`):

```
match = w_skill   * skillCompatibility(cslGap, mode)      // similar or complementary
      + w_geo     * sameOrNearbyCity
      + w_club    * sharedClubs
      + w_graph   * mutualVouchers / graphProximity
      + w_history * pastPartnerOrCoPlay
      + w_tags    * playStyleComplement
      + w_intent  * bothLookingForPartner
```

- **Cold-start** (little history): fall back to skill proximity + city + LFP - the Playtomic recipe.
- **Explainability**: each card shows the top 2-3 reasons ("Same city · similar level · 2 shared
  clubs · vouched by 3 of the same players").
- **Diversity / freshness**: don't always surface the same top match; rotate and mildly de-rank
  already-declined or already-partnered candidates.

### Privacy & safety (non-negotiable fit)
- Respect profile **visibility** settings and the directory opt-out; only surface players who are
  discoverable. Ideally suggestions are opt-in via LFP.
- Never suggest across an active **block** (either direction).
- Respect account status (no suspended/banned candidates).
- The **anonymous voucher identity rule stays intact** - "mutual vouchers" as a *count/graph* signal
  must be computed server-side from the private vouch data and only ever exposed as an aggregate
  ("vouched by several of the same players"), never naming anonymous vouchers.

### How it maps onto the current architecture
- `@vouchplay/core/match/` pure engine + tests (mirrors ELIG_V1 pattern).
- A cache-first data layer (`lib/partners/…`) that gathers candidate features via the service client
  behind server-side authz, with a tight non-sensitive projection - no `select(*)`, no N+1.
- A `/partners` (Partner Finder) page + wiring the profile "Request to partner" button to it and to
  the existing tournament partner-invitation flow (Phase 7) so a suggestion → invite is one hop.
- Weights + skill-gap tolerances live in `system_settings` (Admin Control Center tunable).

### Recommendation
Build **rules-based `MATCH_V1` first** (skill + geo + club + graph + LFP, with explainability) - it's
deterministic, testable, privacy-safe, and works at low data volume. Add collaborative-filtering
("players who partnered with your partners") only once there's enough `team_members` history to make
it meaningful. Sequence it *after* (or together with) the incentive layer, since both increase the
vouch/graph density that makes matches better.

---

## Suggested sequencing
1. Small vouch-incentive v1 (contribution level + badges + streak) - drives the vouch volume the
   matcher needs, and is low-risk.
2. `MATCH_V1` Partner Finder (rules-based + explainable) - unblocks the "Request to partner" button.
3. Later: consensus-accuracy contribution bonus + collaborative-filtering match signals, once data
   volume supports them.

Both are self-contained phases that reuse existing patterns (pure versioned core engine, cache-first
data layer, admin-tunable settings, audit + privacy rules). Neither touches the locked skill model.
