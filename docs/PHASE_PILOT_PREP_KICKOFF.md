# VouchPlay v2 - next-conversation handover prompt (Pilot Prep)

Paste the block below into a **new** Claude Code conversation to continue. Everything it references is
on `main` and live. Context: we are about to **open registration for the Hermosa Cup** (the biggest
tournament in Zamboanga City) as the pilot, so this phase is about making the live app pilot-ready,
not adding growth features.

---

Continue the VouchPlay v2 build. Project folder: `D:\claude_\P006b_PlayerProfiling\vouchplay_v2`
(move the session there before touching files).

First, read for full context:
- `CLAUDE.md` and `AGENTS.md` - working rules + the Next-15/Vercel deploy gotcha (do NOT undo the
  Next 15 pin, root `vercel.json`, or the `middleware.ts` rename).
- `notes.md` - running execution log + decisions (read the latest entries first).
- `VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md` (content v1.3) - the LOCKED source of
  truth. Read §0Z "Current Build Status" first, then §19.4 + §25.5 (the new registration prompt).

## Where things stand (all LIVE at https://vouchplayph.vercel.app, Supabase `itrosesiywpbaxtmucbb`)

Phases 0-13 are DONE and live (migrations 0001-0013 applied). The full pilot-critical flow works
end to end: signup/profile/vouches; tournaments + divisions + organizer role; partner/team/
registration (transactional slots); manual-proof payments; the ELIG_V1 eligibility/anti-sandbagging
engine with organizer approve/reject + audit; organizer dashboard + canonical XLSX export;
in-app notifications; and the /admin Control Center (settings, audit, users/roles, analytics).
Vouches are unlimited/day by default (one active vouch per pair still enforced). §33.5A loading cues
are a mandatory Definition-of-Done.

Deferred growth features (NOT for the pilot): Phase 13A Vouching Incentives, Phase 13B Partner Finder
(both specced; brief in `docs/BRAINSTORM_Vouch_Incentives_and_Partner_Finder_(2026-09).md`), §16/§16A
recruitment+bidding, §13 Identity Verification.

## This phase - PILOT PREP for the Hermosa Cup (confirm scope with Jasper first)

Goal: everything a real organizer + real players need to register, pay, and be approved for one real
tournament, with reliable comms. Proposed work, in priority order:

1. **§19.4 unverified/under-vouched registration prompt (CODE - do first).** In the tournament
   registration panel, when the signed-in registrant is unrated or below the division's required
   vouch count/STS (ELIG_V1 REVIEW/unrated conditions), show a clear, non-blocking prompt: their skill
   isn't vouched yet so the organizer may not approve them; get vouched by players who know their game
   (link to share profile / request a vouch, §12); neutral copy (no §25.6 banned labels). Needs the
   viewer's skill-profile status (CSL/STS/unique voucher count) wired into the panel. Reaffirm the
   organizer's audited reject path already exists (§25.5).
2. **Turn on critical email (CONFIG - Jasper, then verify).** The email channel is built but inert;
   add `SMTP_USER`/`SMTP_PASS` to the Vercel app env (Gmail SMTP already used for auth) so critical
   events (registration confirmed, payment verified/rejected, waitlist promotion, account actions)
   email the recipient. Verify a real send end to end.
3. **Clear the Supabase over-quota (OPS - Jasper).** The org is flagged over-quota (projects
   restricted from 21 Sep 2026). A real tournament spikes usage - clear/upgrade before opening
   registration. Do a quick usage/egress sanity check.
4. **Dress rehearsal (E2E).** With a throwaway tournament: organizer creates it + divisions ->
   players register (solo/team/partner, unvouched + vouched) -> pay (proof) -> organizer reviews
   eligibility + confirms/rejects -> export the canonical XLSX and **open it in desktop Excel** (the
   still-pending §26.11 integrity gate). Fix anything that surfaces.
5. **Onboard the Hermosa Cup organizer + JT admins.** Organizer account -> grant `organizer` via
   `/staff` Role apps (needs a staff member with TOTP/aal2); ensure Jasper + Tane have admin + TOTP
   enrolled to reach `/staff` + `/admin`.
6. **(If the tournament will be oversubscribed) hold-expiry + waitlist auto-promotion cron.**
   Currently promotion is lazy (on explicit withdraw/reject; expired holds free capacity lazily).
   A scheduled job to expire stale `payment_pending` holds and auto-promote the waitlist is more
   robust for a big, contested bracket. Confirm with Jasper whether the pilot needs it.

Deployment/ops reminders (do not skip):
- After pushing to `main`, Vercel auto-deploys; then re-alias: `npx vercel alias set <deployment-url>
  vouchplayph.vercel.app` (the vanity domain is a manual alias).
- Any new migration is handed to Jasper as `scripts/apply-00NN.sql` (Supabase dashboard automation is
  classifier-blocked); ask for the verify numbers.
- All gates green before commit: typecheck / lint / test / format:check / build.
- Confirm the plan (and scope) before any large change. Update `notes.md` + §0Z + re-alias after deploy.

Gate (every change): domain logic pure + unit-tested in @vouchplay/core; server-side authz + RLS;
operational values in `system_settings` (never hardcoded); audit_logs append-only; anonymous voucher
identity never exposed; no banned eligibility labels; **§33.5A loading cues on every control that waits
on the server**; never call a `'use client'` export from a Server Component.
