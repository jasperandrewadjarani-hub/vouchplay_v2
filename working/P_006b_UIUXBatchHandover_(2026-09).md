# Handover: Directory, organizer & identity UX batch (master_plan §2AG) - EXECUTION BRIEF

**Status:** PLAN ONLY - nothing built. Hand this file to the executing session (Opus orchestrates +
reviews, Sonnet implements). Decision record: `master_plan.md` §2AG (read it first; it holds the
decisions D1-D8 Jasper must answer before Phase A ships). Repo: `D:\claude_\P006b_PlayerProfiling\vouchplay_v2`.

## Standing rules for the executing session (non-negotiable)

- Read `CLAUDE.md` (Next pinned ^15.5; root `vercel.json` + root `next` dep stay), `master_plan.md`
  §2AB-§2AG, handover changelog v1.55-v1.59. Live site, 400+ players; Hermosa registration is open.
- **No deploy during the Hermosa registration window.** One batched deploy per phase in the
  01:00-06:00 PHT window. Gates before deploy: `npm run typecheck && npm run lint && npm run test &&
  npm run format:check`, then `npm run build`. Verify both domains (`vouchplayph.vercel.app`,
  `vouchplay-v2.vercel.app`) by polling the `?dpl=` flip; `x-vercel-id` must stay `sin1::sin1`.
- Every operational value is a `system_settings` key (config default + catalog entry + seed); no
  `select('*')`; every list query bounded; `security definer` functions need the revoke/grant pair
  (lint enforces it). Anonymous voucher identity and STS internals never reach the client.
- Document first: handover changelog entry (next version = v1.60), master_plan §2AG "shipped" note,
  `notes.md` log line - then code. Commit trailer per the session's attribution guidance.
- Hot-site discipline: every change here is read-side/UI or DML; none touches `register_team`,
  registration tables, vouch write semantics, or RLS. Keep it that way.

## Phase A - Directory & organizer UX (one deploy, no DDL)

Prereq decisions: D3 (sorts), D4 (vouches given), D5 (7-day window), D6 (global default), D7 (who
sees the tournament filter). Defaults below assume the recommendations.

### A1 - Sort options, new default, pagination persistence

Files: `apps/web/src/lib/players/filters.ts` (+ `filters.test.ts`), `apps/web/src/lib/players/queries.ts`
(`listPlayers`, `fetchListRows` ~line 350-380, `fetchSkillIndex` ~197), `apps/web/src/components/players/search-filters.tsx`,
`apps/web/src/app/(app)/players/page.tsx`, `apps/web/src/app/(app)/players/[slug]/page.tsx`, the nav
config that renders the Players tab (grep `'/players'` in `apps/web/src/components/bottom-nav.tsx`,
`sidebar.tsx`, or `packages/config` nav).

- Add `sort` to `PlayerFilters` with values: `new_unvouched` (DEFAULT), `newest`, `oldest`, `name`,
  `most_vouched`; staff-only extra: `sts_desc` (D3 - never rendered for non-staff; server rejects it
  for non-staff by falling back to default). Parse/serialize in `filters.ts`; tests for parsing,
  default, and the staff gate.
- Ordering: `new_unvouched` = `unique_voucher_count == 0` (or no skill row) first, then
  `onboarded_at desc`; `most_vouched` = `unique_voucher_count desc, name`; `newest`/`oldest` =
  `onboarded_at`; `name` = display name. Because vouch counts live in `player_skill_profiles`, do the
  ordering in memory over the cached `fetchSkillIndex` (already loads every rated player, 60s TTL)
  merged with the profile page rows, THEN paginate - or, if cleaner, fetch the ordered id list once
  (cached, keyed by sort) and page ids. Keep the current 1k-player ceiling comment honest.
- UI: a "Sort by" `<select>` OUTSIDE the collapsible filter sheet, right of the result count, labels:
  "New & unvouched first", "Newest", "Oldest", "Name A-Z", "Most vouches"; (staff: "Trust score").
  Persist in the URL (`?sort=`); include `sort` in the Suspense key (§2Z pattern).
- Pagination persistence: (a) on the profile page add a "← Back to players" link at the top that
  returns to the exact list URL - store the last `/players?...` URL in `sessionStorage`
  (`vp:last-players-url`) from the list page (a tiny client effect) and read it in a small client
  `BackToListLink` component (fallback `/players`); (b) make the Players tab restore the same stored
  URL when it exists (client wrapper around the nav Link - only for `/players`), so tapping the tab
  after vouching lands on the same page and filters; (c) keep browser-back working (already does).
  Acceptance: from page 3 with a filter → open profile → vouch → tap Back or the Players tab → page 3
  with the filter intact.

### A2 - Dual-range sliders: STS, vouches received, vouches given

Files: new `apps/web/src/components/ui/dual-range.tsx`; `search-filters.tsx`; `filters.ts` (+tests);
`queries.ts` (`fetchSkillIndex` add `vouchesGiven`; `listPlayers` filter application).

- One accessible dual-thumb component: two native `<input type="range">` stacked (keyboard + screen
  reader friendly, works on every phone), large 28px thumbs, live value chips ("3 - 20"), "Any" when
  the range is the full span, min ≤ max enforced. Props: min, max, step, value [lo,hi], labels,
  formatter.
- Filters: `stsMin/stsMax` (0-5 step 0.5; replaces `minSts`, keep `minSts` parsing as a legacy alias
  mapping to `stsMin`), `vouchesMin/vouchesMax` (received; 0-50, top bucket "50+"), `givenMin/givenMax`
  (given; 0-50, "50+"). Vouches GIVEN: extend the skill index with a per-voucher count from
  `vouches` (`voucher_id` where `status='active'`, bounded 10k, counted in memory, same 60s cache).
- Filter application stays server-side in `listPlayers` (restrict ids from the index, as the skill
  filters do today). Active filters render as removable chips above the list ("STS 2.0-4.0 ×").
- §8.4 note: filtering by STS is allowed; ordering by it is not (see D3).

### A3 - "New" badge + filter; compact-row coach icon

Files: `packages/config/src/settings.ts` + `settings-catalog.ts` (`new_account_badge_days`, int,
default 7, group `directory` or existing profile group), seed via `scripts/apply-0035.sql` (DML only,
`on conflict do nothing`) - the executing session upserts it live with the service role like §2AF;
`apps/web/src/lib/players/dto.ts` (`isNew: boolean` from `onboarded_at` vs the setting),
`components/players/badges.tsx` (`NewBadge`, neutral pill "New"), `player-card.tsx` (both variants;
add a small graduation-cap/`GraduationCap` coach icon on the compact row beside the partner/sponsor
icons, `text-primary`, `aria-label="Coach"`), `search-filters.tsx` (checkbox "New this week"),
`filters.ts` (`newOnly`), `queries.ts` (restrict by `onboarded_at >= now - days`).
- Acceptance: a player onboarded 3 days ago shows "New" on cards and profile; 8 days ago does not;
  changing the setting in Admin moves the boundary without a deploy; compact rows show the coach icon
  for approved coaches.

### A4 - Tournament filter (staff + that tournament's organizers)

Files: `search-filters.tsx` (a "Registered in tournament" `<select>` rendered only when the viewer
is staff or organizes ≥1 tournament - pass `tournamentOptions` from the page), `players/page.tsx`
(load options: staff → all `registration_open|registration_closed|locked|live` tournaments; organizer
→ their managed ones via the existing `listManagedTournaments`), `filters.ts` (`tournament` id),
`queries.ts` (restrict ids = players on teams with a live registration in that tournament:
`team_members` → `registrations` status in `confirmed|payment_submitted|payment_pending|waitlisted`,
bounded; reuse the `restrictIds` path). Server-side gate: ignore the param unless the viewer is staff
or an organizer of THAT tournament (never trust the client). Acceptance: an anonymous request with
`?tournament=` is served the unfiltered list.

### A5 - Organizer registrations: combinable filters, capacity strip, column sort

Files: `apps/web/src/lib/tournaments/entry-view.ts` (+ its test), `components/tournaments/organizer-registrations.tsx`,
the organizer manage page that renders it (pass `divisions` with `capacity_teams` and the per-division
counts - `getDivisionRegistrationCounts` is already cached, expose a small server read).
- Filters become **combinable**: multi-select chips for Division, Status (payment pending / submitted
  / confirmed / waitlisted / withdrawn / rejected), Eligibility (eligible / needs review / skill
  mismatch / rule), Payment (has receipt / none), Partner (confirmed / not confirmed), plus the search
  box and the existing "show closed" toggle. `EntryFilters` fields become arrays; `filterEntries`
  applies AND across groups, OR within a group. Chips show counts. "Clear all".
- **Division capacity strip** above the list: one compact row per division - "Men's Band 2 ·
  12 / 60 registered · 9 paid · 3 pending" with a thin progress bar; tap a row to add that division
  to the filter. Source: divisions + counts (registered = live statuses; paid = confirmed +
  payment_submitted with receipt). This is the "where do we stand on projected slots" view.
- **Column sort** (Excel-like): a "Sort" `<select>` + direction toggle over: Name, Division, Status,
  Registered at, Amount, Eligibility, Payment state. `sortEntries(entries, sort)` pure + tested;
  default stays the current "needs-me first" order.
- All client-side over the already-loaded list (≤1000 rows). Large tap targets; chips wrap.

### Phase A gates & acceptance

Unit tests: `filters.test.ts` (sort/range/new/tournament parsing + staff gates), `entry-view.test.ts`
(combinable filters, sort), `dual-range` (value clamping), `dto` (isNew boundary). Full gates green.
Manual: signed-in staff eyeball of the tournament filter and the organizer strip. Deploy in window;
verify both domains; watch `[client-error]` for 15 min.

## Phase B - Cities (after D8 sign-off; DML migration 0035b or 0036)

Files: `packages/config/src/ph-cities.ts` (canonical list: the 149 PH cities + every municipality
already present in the data + a `normalizeCity(input)` that maps case/whitespace/"City" suffix
variants to canonical and returns the input unchanged when unknown; tests), `packages/validation/src/profile.ts`
(apply `normalizeCity` in the transform), `components/auth/onboarding-form.tsx` and the edit form
(`<input list="ph-cities">` + `<datalist>` from the config - native autocomplete, free text still
allowed), `search-filters.tsx` city filter (use canonical options), a read-only
`scripts/city-normalization-report.ts` (prints proposed old→new with counts to a CSV for Jasper), then
`scripts/apply-00NN.sql` with explicit `update profiles set city = 'Zamboanga City' where lower(trim(city)) in (...)`
statements for the approved mapping (+ null out the two test rows), and a verify select. Recompute
nothing - city is display/filter only today (`leaderboard_city_region_map` is empty).

## Phase C - Identity verification pipeline (own phase; counsel first)

Not to be started until D1/D2 are confirmed and counsel has set the ID-retention rule. Outline:
private Storage bucket `identity-docs` (no public read; staff-only signed URLs, 5-min TTL); migration
extending `identity_verifications` (`document_path`, `submitted_at`, `reviewed_at`, `reviewed_by`,
`reason`; status flow `submitted → approved | rejected`); Me → Settings → "Verify my identity"
(requires an avatar; upload one ID image, 5 MB, normalized like avatars); Staff → Moderation
"Identity" queue (approve/reject with reason, audited, `writeAudit`); self-nudge banner in
`app-shell.tsx` mirroring the unvouched nudge (dismissible, 7-day snooze in `localStorage`); "ID
submitted, pending review" chip on own profile; badge on approval (existing `IdentityVerifiedBadge`);
V2 picks it up automatically as an anchor. Privacy Policy sentence + retention (recommend: delete the
image on decision, keep the decision row). Never auto-approve.

## What the executing session must report back

Per phase: files changed, tests added/passing, the decisions applied (D1-D8 values), deploy id on
both domains, and anything deferred with the reason.
