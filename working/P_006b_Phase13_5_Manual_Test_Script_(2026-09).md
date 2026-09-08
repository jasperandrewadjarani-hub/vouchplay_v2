# Phase 13.5 Manual Test Script - Authenticated Browser Verification

**Date:** 2026-09-08
**Env:** production - https://vouchplayph.vercel.app (or https://vouchplay-v2.vercel.app)
**Goal:** Evidence the six Phase 13.5 flows end to end with real sessions. Record PASS/FAIL and any
note next to each step.

## Accounts you need

- **Organizer O** - an account with an approved Organizer role that owns a test tournament.
- **Player A** - an ordinary player, ideally an active member of at least one club (for the club test).
- **Player B** - a second player (for the doubles partner and same-division tests).

Use separate browsers or profiles (or one normal + one private window) so the three sessions stay
signed in independently. A phone plus a laptop is ideal for the QR and long-idle tests.

## Test tournament setup (Organizer O, once)

1. Create or open a test tournament you own. Open `/tournaments/<slug>/manage`.
2. Make sure it has at least **two doubles divisions** and, if possible, one **singles** division, all
   with capacity greater than 0. Add divisions in the Divisions section if needed.
3. Set status to **Registration open** (Lifecycle controls). Confirm `/tournaments/<slug>` now shows
   the registration panel to a signed-in player.

---

## 1. Payment QR - upload, save, hard reload, replace

**Organizer O, on `/tournaments/<slug>/manage`, Details section:**

1. In **Payment QR**, choose a QR image (PNG/JPG/WebP under 5 MB). Confirm a preview thumbnail appears
   and the helper line reads "Ready to upload: <filename>".
2. Click **Save details**. Expect the success message and the helper line to change to
   "Payment QR saved. It is private and visible only to a registrant during payment."
   - PASS if it saved without a "disappearing QR" or false error.
3. **Hard reload** the page (Ctrl/Cmd+Shift+R). Expect the Payment QR preview to still show the saved
   image and the helper line to read "Saved and private. Choose a new image only to replace it."
   - PASS if the QR persists across reload (this is the core bug that was reported).
4. **Replace it:** choose a different QR image and Save again. Expect the new preview and the saved
   confirmation. Hard reload again and confirm the new image persists.
   - PASS if replacement is clean and the old image is gone.
5. Optional negative: try a non-image file (e.g. a .txt). Expect a specific error and the current QR
   retained (never silently cleared).

**Player A, payment step (needs a fee-bearing registration - do step 5 below first, then return):**

6. As Player A with a `payment_pending` entry in a division with a fee, open `/tournaments/<slug>`,
   expand your entry, and reach the payment form. Expect the organizer's QR to render there.
   - PASS if an eligible registrant sees the QR at the authorized payment step.
7. Copy the QR image URL if visible and open it in a **signed-out** window after ~1 minute. Expect it
   to fail (the signed URL is short-lived and private).
   - PASS if the raw QR is not publicly reachable.

---

## 2. Long-idle browser recovery

The generic crash is what we are trying to avoid. Three sub-tests:

1. **Idle return:** As Player A, open `/tournaments/<slug>`. Leave the tab hidden (switch to another
   app/tab) for over 60 seconds, then return. Expect the page to quietly refresh once (a brief
   "Refreshing the latest VouchPlay information" is announced to screen readers) with no crash and no
   repeated refreshing.
   - PASS if it resumes cleanly with no generic error screen.
2. **BFCache / back-forward:** Navigate from the tournament page to `/players`, then use the browser
   **Back** button. Expect the restored page to refresh once, not crash.
3. **Expired session:** Sign in as Player A, then in another tab sign out (or clear the site's
   cookies/storage for the domain), return to the first tab and trigger a navigation or action that
   needs auth. Expect the recovery screen titled "Your session needs a refresh" with a **Sign in
   again** button that returns you to the same route after signing in.
   - PASS if you get the recoverable sign-in screen, not a blank/generic error.

Note: the app also records a privacy-safe telemetry entry on any boundary hit. You do not need to
verify server logs; just confirm the on-screen recovery behaves.

---

## 3. Multiple entries - two divisions, no same-division duplicate

**Player A (and Player B for doubles):**

1. In doubles **Division 1**, invite Player B, have B accept, then register the team. Expect a
   `payment_pending` (or waitlisted) entry.
2. In a **different** division (Division 2, or the singles division registered solo), register again.
   Expect a second independent entry to be created successfully.
   - PASS if a player can hold active entries in two distinct divisions at once.
3. Try to register **again in Division 1** with the same player. Expect a rejection ("This team is
   already registered for the division" or "One of you is already on a team in this division").
   - PASS if same-division duplication is blocked while multi-division is allowed.
4. Confirm each entry keeps its own status: cancelling or paying one must not change the other.

---

## 4. My registrations (N) summary

**Player A, on `/tournaments/<slug>` after registering in two divisions:**

1. Immediately after the tournament details, confirm a **collapsed** panel titled
   "My registrations (2)". It should be collapsed by default.
   - PASS if it starts collapsed and shows the correct count.
2. If any entry needs payment, confirm the "N needs action" hint appears.
3. Expand it (click or keyboard: Tab to it, Enter/Space). Confirm one row per entry with division,
   team, a status shown with an **icon and text** (not colour alone), and a next-action button.
4. Keyboard + screen reader: Tab through the summary and rows; confirm the disclosure and action links
   are reachable and labelled. Toggle dark/light and confirm both read well; check at mobile width
   (~390px) for no horizontal overflow.
   - PASS if accessible, collapsed by default, and per-entry actions are correct.

---

## 5. Club representation - edit after payment, lock, override

**Player A, on `/tournaments/<slug>`, "Clubs you represent":**

1. Before any lock, select a club you are an active member of and Save. Expect "Club representation
   updated."
2. Submit payment proof for one entry (so the entry is past payment_pending), then return and change
   your club selection again. Expect the edit to still succeed.
   - PASS if club edits are allowed after payment submission / confirmation.

**Organizer O sets the lock:**

3. On `/tournaments/<slug>/manage` Details, set **Club selection lock** to a time a minute or two in
   the future, Save. (This is one tournament-wide control; there is no per-division lock.)
4. Before that time, confirm Player A can still edit clubs. After that time, have Player A try to
   change clubs again. Expect a server-side refusal ("Club selections are locked. Contact the
   organizer for changes.").
   - PASS if the single tournament-wide deadline is enforced for everyone.

5. **Post-lock override (organizer/Admin):** on `/tournaments/<slug>/manage`, expand
   **Club representation override**. Choose Player A, adjust their clubs, enter a reason, and Save.
   Expect "Club representation override saved" and Player A's clubs updated. Confirm their entry's
   status, division, team, and payment are unchanged.
   - PASS if the reasoned override works after the lock and changes nothing but the clubs.

---

## 6. Home copy

1. On `/` (Home), signed out and signed in, confirm the copy is concise and free of em dashes. In
   particular the leaderboards line should read "Ranked by participation and genuine support, not raw
   STS, ratings, or volume."
2. Check loading, empty, and error states are readable; toggle dark/light; check ~390px width for no
   overflow.

---

## Result log

| Flow | Result | Notes |
|---|---|---|
| 1 Payment QR upload/reload/replace | | |
| 1 Player sees QR at payment | | |
| 2 Idle return | | |
| 2 BFCache back | | |
| 2 Expired session recovery | | |
| 3 Two-division register | | |
| 3 Same-division rejected | | |
| 4 My registrations collapsed + a11y | | |
| 5 Club edit after payment | | |
| 5 Lock enforced | | |
| 5 Reasoned override (manage page) | | |
| 6 Home copy | | |
