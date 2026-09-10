# Decision memo: what to do when a player's skill "drifts" above a division cap

**To:** Jasper, Tane · **From:** engineering audit · **Date:** 2026-09-10 · **Decides:** §2AB skill-drift item
**Status:** DECIDED 2026-09-11 — **Option A** (organizer-managed, already live). Options B and C are
deferred, not rejected; revisit if organizer review becomes a burden or drift draws complaints. No
code ships for this item. The current flagged list is handled by the organizer via the existing
eligibility chip; handing that list over is pending Jasper's go (see the open item at the end).

## The one-line recommendation

Keep the organizer flag as the standing policy (**Option A**, already live, handles the current
Hermosa cases), and add one refinement so a **single low-confidence vouch can't override a player's
own self-rating at the registration gate** (**Option B**). Do **not** freeze skill at registration
(**Option C**) — it quietly re-enables sandbagging, which is the exact thing VouchPlay exists to stop.

## What "drift" is and why it happens

A division can have a skill ceiling (e.g. "Beginner, max band 1"). At registration we check whether
each player fits, using their **effective skill = community skill if known, otherwise their
self-rating** (`apps/web/src/lib/tournaments/division-fit-check.ts:112`). Community skill is
recalculated on **every vouch**. The catch: that fit check runs **only at registration** — nothing
re-runs it afterward.

So the common, innocent sequence is:

1. A player self-rates Band 1 and registers in a Band-1 division. They fit. They pay.
2. Over the next days, players who've seen them play vouch for them.
3. Their community skill rises to Band 3. They are now "above" the division they already paid into —
   but no rule re-checks, so nothing happens except an eligibility flag on the organizer's screen.

This is not a bug in the sense of broken code — it is the reputation system **working** (vouches are
supposed to refine skill). The question is purely product policy: what should the app *do* about it.

## Current exposure (live Hermosa data, 2026-09-10)

- **14 registrations / 19 player-slots** are currently above their division cap.
- Almost all are the innocent pattern above: self-rated within band, then vouched up. Vouch counts
  range from 1 (JBoMan, Sherkad, kendee) to **52 (Sam), 30 (Byang), 17 (Dragon), 15 (Berl)**.
- The full list is `working/eligibility-scan-2026-09-10.csv`; regenerate anytime with
  `node scripts/audit-eligibility-scan.mjs b-steel-hermosa-2026-...`.

Read that spread carefully, because it drives the decision: the **well-vouched** players (Sam,
Byang, Dragon, Berl…) genuinely test as stronger than their division. The **1-vouch** players are
flagged on the strength of a single opinion, which is much weaker evidence.

## The options

### Option A — Organizer decides (already live, zero code)

The organizer registration list already shows an amber **"Potential skill mismatch"** chip on every
flagged entry, and the eligibility panel auto-expands for them. The organizer reviews each team and
chooses: leave them, ask them to move up (cancel + re-register), or reclassify.

- **Pros:** zero code, zero risk, zero deploy. Human judgment sits where it belongs — telling honest
  drift from sandbagging is a judgment call, not a formula. Preserves the anti-sandbagging signal.
- **Cons:** manual, and grows with the tournament (14 today, rising). Relies on the organizer
  actually opening the list. Enforcement is only as consistent as the organizer.
- **Effect on the current 14:** handled by the organizer, case by case. This is unavoidable for the
  existing entries under **every** option, because they were already stamped at registration.

### Option B — Don't let a low-evidence community rating override self-rating at the gate (recommended add-on)

Change the fit gate so community skill overrides the player's self-rating **only once there are
enough vouchers to trust it** — reusing the existing Admin setting
`eligibility_min_unique_vouchers` (currently 2). Below that, judge the player on their own
self-rating. Above it, the community rating stands.

- **The rule in one sentence:** trust the player's own word until the community has really weighed in
  (2+ vouchers), then trust the community. That is the same "insufficient evidence / low confidence"
  idea ELIG_V1 already uses elsewhere.
- **Pros:** removes the genuinely unfair case — one friend's vouch bumping someone out of the band
  they honestly self-selected. Uses a setting you can already tune with no deploy. Keeps the flag for
  the well-evidenced cases (Sam, Byang, etc. still flag — as they should).
- **Cons:** a code change to a live eligibility path, so it rides the next windowed deploy, and the
  SQL twin `player_fits_division` (used by the change-partner flow) must move in the same night so
  the two never disagree. It does **not** clear the existing well-vouched Hermosa flags — those are
  correctly flagged and still go through Option A.
- **Effect on the current 14:** the 1-vouch entries would no longer be *newly* blocked on
  re-registration; the well-vouched ones stay flagged. Existing stamped registrations are unchanged
  (the gate is not retroactive), so the organizer still handles today's list via A.

### Option C — Freeze skill at registration (not recommended)

Store each player's effective skill (or the fit verdict) at registration and judge all later checks
against that frozen value, so drift never re-flags anyone.

- **Pros:** "you registered correctly, you're in" — intuitive, and no one is ever chased for
  improving.
- **Cons that outweigh it:** it **re-opens sandbagging** — a strong player who registers before
  they've been vouched (self-rating low, no community skill yet) is frozen into the low bracket even
  after the community says they're a Band 5. That is precisely the behaviour VouchPlay's reputation
  layer is meant to expose. It is also the heaviest change (touches registration data and the
  eligibility snapshot), which is why the audit deferred it to post-window regardless. And it barely
  helps the current list, whose entries already carry snapshots.

## Why A + B, and not C

VouchPlay's core promise is that the community's read on a player is more honest than a self-declared
number. A rising community skill is that promise paying off, so the right default is to **surface it
to the organizer** (A), not to suppress it (C). Option B simply makes the *entry gate* fair by not
acting on a single opinion as if it were settled — it strengthens the same promise rather than
working against it. Option C is the only one that fights it, so it is off the table unless you
specifically want tournaments where entry skill is locked regardless of what players later reveal.

## If you choose A + B, here's the rollout (for the standing hot-site rules)

1. Confirm the setting: `eligibility_min_unique_vouchers` (Admin → settings), default 2. This alone
   is the whole knob — no deploy to change it later.
2. Code (one windowed deploy, 01:00–06:00 PHT): update `evaluateDivisionFit`
   (`packages/core/src/tournaments/division-fit.ts`) and its caller
   (`division-fit-check.ts:112`) to pass `uniqueVoucherCount` and prefer self-rating below the
   threshold; add unit tests for the boundary (0, 1, 2 vouchers).
3. Migration 0034 the same night: update the SQL twin `player_fits_division`
   (`supabase/migrations/0030_...`) to the same rule, so the change-partner path agrees. Privilege
   and logic only; no registration-table change.
4. It is **not retroactive** — existing registrations keep their stamps; the organizer still clears
   today's 14 via A. Verify both domains; no player is newly blocked (the change only ever loosens
   the gate for low-evidence players).

## What I need from you

- **Pick:** A only, A + B (recommended), or C. One word back is enough.
- If A + B: confirm you're happy reusing `eligibility_min_unique_vouchers = 2` as the trust
  threshold, or name a different number.
- Separately (Option A housekeeping, no code): should I hand the current 14-registration list to the
  Hermosa organizer now, or do you want to review it first?

## Optional future enhancement (not part of this decision)

A friendly nudge to the *player* when their own community skill crosses a division cap they're
registered in ("your rating has grown — you may want to move up a division"), turning a silent
organizer flag into a self-service move. Bigger build; noting it so it isn't lost.
