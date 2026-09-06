# VouchPlay v2 - Phase 9 kickoff prompt

Paste the block below into a **new** Claude Code conversation to continue the build with Phase 9
(the anti-sandbagging Eligibility Engine). It mirrors the Phase 4-8 kickoff style. Everything it
references is on `main`.

---

Continue the VouchPlay v2 build. Project folder: `D:\claude_\P006b_PlayerProfiling\vouchplay_v2`
(move the session there before touching files).

First, read for full context:

- `CLAUDE.md` and `AGENTS.md` - working rules + the Next-15/Vercel deploy gotcha (do NOT undo the
  Next 15 pin, root `vercel.json`, or the `middleware.ts` rename).
- `notes.md` - running execution log + decisions (read the latest entries first).
- `VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md` (content v1.2) - the LOCKED source
  of truth. Read §0Z "Current Build Status" first, then §25 (Eligibility Engine) and §26.7.

## Where things stand (all LIVE at https://vouchplayph.vercel.app, Supabase `itrosesiywpbaxtmucbb`)

Phases 0-8 done and live. Migrations 0001-0009 applied; **0010 apply-pending** (`scripts/apply-0010.sql`
- adds the vouch `both` enum value + sets the update cooldown to 1 day; ask Jasper to paste + run it
and return the verify numbers, exactly like prior phases).

- **Auth / players / vouches (STS_V1)** - Phase 1-3. Community Skill Level (weighted median), STS
  (0-5 confidence), Skill-Verified all computed in `@vouchplay/core` and stored in
  `player_skill_profiles` (recompute-on-write). This is the skill data Phase 9 reads.
- **Safety & moderation** - Phase 4 (`reports`, `skill_reviews`, `support_tickets`, fraud flags,
  moderation queue behind `requireStaffPage` + MFA, audit_logs).
- **Clubs** - Phase 5. **Tournaments + divisions + organizer role** - Phase 6. **Partner/Team/
  Registration** - Phase 7 (transactional slot reservation RPCs: `register_team`, `release_slot`,
  `accept_partner_invitation`; `registrations` carries `eligibility_status` +
  `eligibility_snapshot jsonb` already). **Payments** - Phase 8 (manual proof, private bucket).

**Infra to reuse:**
- STS/skill data: `player_skill_profiles` (public-safe aggregate: `community_skill_level`, `sts`,
  `unique_voucher_count`, `distribution`, `skill_verified`) + `profiles.self_rated_skill`.
- Division rules already on `divisions`: `skill_policy` (band/open/custom), `minimum_skill`,
  `maximum_skill`, `sex_classification`, `minimum_age`, `maximum_age`, `team_size`,
  `skill_verified_required`, `minimum_sts`, `organizer_approval_required`.
- `registrations.eligibility_status` enum (`eligible/review/skill_mismatch/ineligible_hard_rule`) and
  `eligibility_snapshot jsonb` columns EXIST (migration 0008) - Phase 9 fills them.
- `fraud_flags` (Phase 4) for the `UNUSUAL_VOUCH_ACTIVITY` flag; `is_tournament_organizer()` +
  `authorizeOrganizer()` for organizer gating; `audit_logs` + `writeAudit()` for override auditing;
  the organizer registrations dashboard (`components/tournaments/organizer-registrations.tsx`) is
  where the eligibility panel + actions attach.
- Age is computed at the **tournament start date** (§18.5), sex from `profiles.sex`.

## Do NOW - PHASE 9: Eligibility / Anti-Sandbagging (handover §25, §26.7; plan block "Phase 9")

This is the product's primary differentiator - a **neutral, evidence-based decision-support**
engine. It never auto-punishes and never labels a person; the organizer decides.

1. **Pure eligibility engine in `@vouchplay/core`** (unit-tested, like STS_V1). Inputs (§25.3): a
   player's Community Skill Level, STS, Skill-Verified status, self-rated skill, (historical results
   later), and the division's skill policy / min-max skill / minimum STS / Skill-Verified
   requirement / sex / age range / team size. Output per player AND per team (§25.1):
   `ELIGIBLE / REVIEW / SKILL_MISMATCH / INELIGIBLE_HARD_RULE` plus advisory flags
   (`HISTORICAL_SKILL_MISMATCH`, `UNUSUAL_VOUCH_ACTIVITY`). Version the algorithm (`ELIG_V1`).
2. **Hard rules (§25.2)** - wrong sex for a sex-restricted division, age outside range (at start
   date), registration closed/locked, account suspended, duplicate/conflicting registration, invalid
   team size. A hard-rule failure is `INELIGIBLE_HARD_RULE`. Organizers **cannot silently bypass** a
   hard rule; an override requires an explicit reason + audit_logs entry.
3. **Default skill rules (§25.4)** - within band + evidence threshold met → `ELIGIBLE`; within band
   but STS below required / not enough evidence / Skill-Verified required-but-missing → `REVIEW`;
   Community Skill above the division max → `SKILL_MISMATCH`. All thresholds are Admin settings, not
   hardcoded.
4. **Compute on registration write + store the snapshot.** Fill `registrations.eligibility_status` +
   `eligibility_snapshot jsonb` when a team registers (and recompute when relevant inputs change).
   Keep it decision-support: it does not block registration by itself (except hard rules the org
   configured to enforce).
5. **Organizer eligibility UI (§25.5)** - on the registrations dashboard, a **"Potential Skill
   Mismatch"** panel per team: entered division, community skill, STS, active vouchers, weighted
   distribution, and the flags - all neutral wording. Actions: Approve, Reclassify (move to another
   division), Request Skill Review (reuse Phase-4 `skill_reviews`), Reject. Every override writes an
   audit_logs row with reason.
6. **§25.6 - NEVER show "sandbagger" / "smurf" / "cheater"** as system-generated text. Neutral,
   evidence-based wording only. This is a hard product rule - enforce it in copy + a lint/test guard.

### Migrations
Most columns exist. If you need new settings (e.g. eligibility thresholds / evidence minimums) add a
`supabase/migrations/0011_eligibility.sql` (+ `scripts/apply-0011.sql` with a verify query) and seed
them ON CONFLICT DO NOTHING. Dashboard automation is classifier-blocked, so hand Jasper the apply-SQL
to paste + run.

### Gate (must pass)
- Eligibility engine unit-tested with hand-computed cases (in-band eligible, below-STS review,
  above-band skill_mismatch, hard-rule failures, team = worst-of-members).
- Hard rules cannot be silently bypassed; overrides are audited.
- No banned/defamatory labels anywhere (add a test/guard).
- All gates green (lint/typecheck/test/build); commit + push to
  `github.com/jasperandrewadjarani-hub/vouchplay_v2` on `main` (auto-deploys); **re-alias
  `vouchplayph.vercel.app`** after the deploy (`npx vercel alias set <deployment-url>
  vouchplayph.vercel.app`). Update `notes.md` + handover §0Z. Confirm the plan before large changes.

### Not in scope (later phases)
Organizer dashboard analytics/export (Phase 10, §26/§27 - though the eligibility panel lives in the
existing dashboard), notifications (Phase 11), achievements/skill-tags/history (Phase 12 - so
`HISTORICAL_SKILL_MISMATCH` uses whatever history exists and is otherwise a no-op for now), admin
control center (Phase 13), §16 recruitment/sponsorship, §16A bidding.
