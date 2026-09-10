# VouchPlay v2 - Leaderboard, Resilience, Directory, Media-Normalization, and Tournament Reliability Plan

> **Addendum v1.13 - Tournament demand signal, Club Administration, and dark-first Home.** This
> addendum is an approved extension of the active hardening plan. It deliberately does **not** turn
> interest into registration, a reserved slot, eligibility, or a marketing-consent list.

> **Addendum v1.16 - Next-phase tournament reliability, registration flexibility, and copy review.**
> This is a planning-only addendum. No application code, schema change, or production behavior is
> changed by this document update. It is the required starting scope for the next implementation
> conversation, before Phase 14 Recruitment, Sponsorship, or Gamified Bidding.

## 1A. Tournament demand-signal contract

- A public, published or registration-open tournament may collect one expression of interest per
  signed-in player or per anonymous browser. The anonymous path uses a random, HTTP-only first-party
  cookie whose HMAC is stored; it never fingerprints a device, stores the raw token, or collects PII.
  Cookie clearing/new browsers can produce a new count, so the UI calls this an *interest estimate*,
  never a verified unique-player total.
- The visitor selects a demand taxonomy before the count is recorded: Beginner, Novice, Low
  Intermediate, High Intermediate, or Advanced × Men’s/Women’s/Mixed, plus 50+ Men’s/Women’s/Mixed.
  This taxonomy informs planning only; it does not create a tournament division or determine skill,
  age, eligibility, registration priority, or a slot.
- Public detail shows an aggregate count, a capped overlapping stack of only public signed-in profile
  avatars, and an accessible division-count dialog. Anonymous interest is intentionally never
  identifiable. The dialog shows aggregate counts, not names or per-division identities.
- After a successful anonymous response, the user may create an account, complete a profile, or
  create/join a club for when registration opens. Copy must state plainly that no slot is held.
- A new private-RLS table, SECURITY DEFINER write RPC, HMAC cookie, status validation, bounded daily
  anonymous limit, explicit Admin settings, audit-safe aggregate read, and cache invalidation protect
  the flow. Direct anon/auth table access and RPC execution remain denied.

## 1B. Administration and home UX

- `/admin/clubs` is a discoverable AAL2 Admin surface for every non-deleted club, with verification
  and activity controls reusing the existing audited Staff actions. It complements, rather than
  weakens, the focused Staff moderation queue.
- Home leads with the three concise Discover Players → Build Trust → Play More cards, then Community
  Leaderboards. Leaderboard cards use a trophy/medal visual cue while retaining text labels; supporting
  copy is shortened.
- Dark is the first-render default independent of OS preference. The existing explicit Light/Dark
  choice remains available; a prior user choice is respected.

## 1C. Tournament navigation and registration refinement

- **Copy rule:** Do not use em dashes anywhere in product copy, placeholders, help text, plans, or
  handovers. Helper text must be a single concise sentence unless a legal or safety obligation needs
  more. Prefer a clear label, an info control, progressive disclosure, and task-specific feedback.
- Interest confirmation says only: “Your interest has been counted. This is not registration or a
  reserved slot.” Anonymous users then see a short account/profile invitation. A Looking for partner
  control reveals compatible public profiles without exposing private data.
- Each demand division displays a proportional interest bar. Each real tournament division displays a
  separate registration bar using active team registrations against configured capacity. Doubles fees
  are shown as the configured team fee divided by two, labelled “per player”; payment collection and
  review continue to use the configured team amount.
- The player-facing division card is collapsible and is the single place for public division facts,
  fee, meter, skill guidance, partner search, and registration. Existing transactional registration,
  invitation, payment, and eligibility logic remains the authority.
- Skill messaging is progressive: a compact warning identifies a possible division mismatch using
  Community Skill Verified, then unverified Community Skill, then self-rating only when community
  evidence is absent. The detailed evidence explanation is behind an accessible info control.
- Organizer discovery starts with the same public published list as a player, including events the
  organizer owns/co-organizes. A “My tournaments” control expands the private list and defaults to
  hiding draft, cancelled, and archived entries. Co-organizer search uses a debounced account picker,
  then retains the existing active-Organizer-role authorization on submit.
- Payment QR is a private, normalized organizer upload tied to the tournament. A short-lived signed
  URL is shown only in the authenticated payment-proof step. It is not a gateway, does not confirm
  payment, and does not replace the existing proof upload and organizer review.

## 1D. Player registration-first tournament management

- A signed-in player with an active registration sees **My registration** immediately after the
  tournament header, before the division browser. It shows division, team, status, payment action,
  and concise safe management controls. It never exposes another player’s payment or private facts.
- Tournament cards show separate aggregate **interested** and **joining** counts below place/date.
  A signed-in viewer’s own interested or active-registration state is labelled with an icon and text;
  neither state is inferred from colour alone.
- The public division browser is collapsed by default. Expanding a division reveals its capacity bar,
  per-player fee, eligibility guidance, partner search for doubles, and the appropriate registration
  action. Registered players do not need to scan every division to find their own entry.
- Player cancellation is available only while tournament registration is open and is auditable. A
  division move is permitted only while the feature is enabled, registration is open, the entry is
  still payment-pending with no submitted proof, the team fits the target division, and the target
  has a real immediately available slot. The atomic operation retains the original hold deadline,
  recalculates eligibility, and records old/new division facts. It never silently waitlists or
  charges a player.
- A partner cannot be unilaterally replaced after registration. Before payment proof is submitted,
  the player may cancel the registration and form a new team; after proof, confirmation, lock, or
  close, only the organizer may resolve a change. This prevents a teammate or payment record being
  displaced without their knowledge. These limits are live Admin settings, not hardcoded.
- The organizer picker accepts only active approved Organizer, Admin, or Super Admin accounts. The
  server uses an existence check rather than a single-row assumption, so an account holding more
  than one qualifying role is not falsely rejected.

## 1E. Next phase: tournament reliability and registration flexibility

- **Payment QR reliability:** reproduce the organizer save failure against a controlled tournament
  before changing code. First verify migration 0020 and the `payment_qr_path` column, then trace the
  form payload, normalization, private Storage upload, database update, cache invalidation, and
  reload. A successful replacement must upload the new private object first, update the row only
  after that succeeds, retain the prior QR if any later step fails, and remove an orphaned new object
  best-effort. The organizer receives a specific actionable error, never a false success or a
  disappearing QR. The player payment screen receives a short-lived signed QR URL only when the
  authenticated registration is entitled to view it. This remains manual proof and review, not a
  payment gateway.
- **Long-idle browser reliability:** diagnose the observed client-side application error with
  production-safe error telemetry, browser console evidence, App Router error boundaries, and
  controlled idle/BFCache/session-expiry tests. Extend the existing bounded resume recovery only if
  evidence shows it is insufficient. Recovery must preserve the current route and unsaved work where
  possible, offer a clear retry or sign-in path when auth is stale, avoid polling and refresh loops,
  and never expose private error payloads to the browser.
- **Club representation changes:** retain the existing player-and-tournament representation source of
  truth. Players may edit their own eligible club representation even after payment submission or
  confirmation until the tournament-wide `club_lock_at` deadline. The organizer manages one clear
  all-divisions control, expressed as an optional lock date/time, rather than per-division exceptions.
  A locked player request fails server-side; an authorized organizer or Admin override requires a
  reason and immutable audit. Changes never alter payment state, team membership, fee, eligibility,
  or historical organizer export facts without an explicit refresh/audit event.
- **Multiple tournament entries:** a player may hold active entries in multiple distinct divisions in
  the same tournament, for example Men's and Mixed Doubles, up to the tournament's configured
  per-player division maximum. The system must still prohibit two active teams or registrations for
  the same player in the same division, preserve per-entry capacity, hold, eligibility, payment, and
  waitlist behavior, and surface a schedule-conflict warning when usable division scheduling data
  exists. Do not use a broad one-registration-per-tournament guard.
- **Registration panel:** replace the single-entry assumption with a default-collapsed **My
  registrations (N)** summary immediately after tournament details. Each entry shows division, team,
  status, and the next valid action; expansion exposes only authorized actions. It remains accessible,
  keyboard-operable, screen-reader labelled, and concise on mobile.
- **Home copy cleanup:** conduct a route-by-route content audit before changing wording. Use canonical
  capitalization for product terms, remove redundant or non-actionable helper text, retain required
  safety/privacy/payment disclosure, and use progressive disclosure for genuinely necessary detail.
  Product copy, placeholders, help text, plan, and handover additions must remain free of em dashes.
- **Next-phase boundaries:** do not build a payment gateway, automated settlement, recruitment,
  sponsorship, bidding, Most Bidded, partner-matching recommendations, a new public identity surface,
  or any score/eligibility linkage. Preserve append-only audit logs, server authorization plus RLS,
  private payment evidence, anonymous-voucher protections, and the Next 15/Vercel deployment
  workaround.

### 1E acceptance and release requirements

- QR upload is proven by organizer upload, save, hard reload, safe replacement, and a controlled
  eligible-player payment-screen check. Direct anonymous and unrelated-player Storage/API access is
  denied. Migration 0020 is confirmed before any QR code diagnosis is closed.
- A stale Chrome and mobile-browser tab is tested after a realistic idle interval, BFCache return, and
  expired-session path. The page either resumes safely or presents a recoverable, accessible retry or
  sign-in state, with no generic client-side crash screen.
- Controlled accounts prove one player can register in two permitted divisions while duplicate
  same-division entry is rejected atomically. Capacity, waitlist promotion, payments, eligibility,
  cancellation, division movement, and exports remain correct per registration.
- Club edits are permitted after payment and confirmation before the organizer's single tournament
  deadline, denied afterward except for a reasoned organizer/Admin override, and recorded in
  immutable audit/history without changing payment or team facts.
- My registrations is collapsed by default and reveals correct per-entry actions. Home copy passes a
  keyboard, screen-reader, mobile, desktop, dark, light, loading, empty, and error-state review.
- Any schema work follows inspection of live `tournaments`, registrations, teams, payment, club
  representation, Storage, RLS, settings, and audit records. Use the next confirmed migration number,
  copy it exactly to `scripts/apply-00NN.sql`, have Jasper apply it in SQL Editor, and record exact
  verification counts before claiming new database behavior is live.

## 1F. Launch welcome pop-up (2026-09-08)

Built for the public launch night ahead of the B-Steel Hermosa 2026 Grand Pickleball Tournament -
Rise of Empires, whose registration opens the following day at 5:00 PM.

- A near-full-screen, one-tap-dismissible announcement dialog shown **once per visitor per version**,
  on whichever route the shared link lands on. It reuses the existing accessible `Modal` (Escape,
  overlay click, and a 44 px labelled close control) with a new `size="lg"` variant.
- **All copy, the image, the event link, the version, and the on/off switch are Admin settings**, so a
  campaign can be changed, re-shown, or killed without a deploy. This is deliberate: the message must
  change from "Registration opens Sep 9 at 5:00 PM" to "Registration is OPEN" during the busiest hour
  of the launch, and a deploy at that moment is an unacceptable risk. Bumping
  `welcome_modal_version` re-shows the dialog to everyone.
- Settings only, **no migration**: `system_settings` rows merge over the shipped code defaults.
- The dialog renders nothing during server rendering and decides only after mount, because the
  "already seen" flag lives in `localStorage`; reading it during render would diverge from the server
  and trip a hydration mismatch.
- Conversion logic: the primary action is **Create free account**, because an account made on launch
  night makes registration fast the next day. A signed-in visitor is instead offered **See the
  tournament**. There is always a plain "Maybe later" exit alongside the X.
- Copy safety rule: the pop-up must never promise a reserved slot. Signing up does not hold a place,
  and the interest flow already states this. The launch line is "Sign-up now to register tomorrow."
  Event timing uses an **absolute date**, never "tomorrow", because the dialog can be seen after
  midnight.
- Mobile-first sizing: the image is 3:2 on phones and 16:9 from `sm` up, so the primary button stays
  above the fold on a 375 x 812 device without scrolling.

## 1G. STS explainer (2026-09-08, post-launch)

Real signups asked "what is STS?" within minutes of launch, so the score now explains itself where it
is met.

- **Root cause:** the STS chip described itself with an HTML `title` tooltip. That is invisible on
  touch devices and to keyboard users, which is exactly where most players encounter it. A number with
  no explanation reads as a mysterious rating.
- The chip is now a real button that opens an accessible explainer dialog (reusing `Modal`: centered
  on desktop, bottom sheet on mobile, dismissible by X, overlay, Escape). It carries a descriptive
  `aria-label` and a visible help icon so it reads as tappable.
- **Copy leads with what STS is not.** The confusion is that people read it as a skill or ranking
  score, so the first line states it measures confidence, not ability, followed by what raises it
  (more distinct vouchers, ID-verified/coach vouchers, agreement between them), an explicit
  reassurance that a low STS does not mean a weak player, and the separation of skill level from STS.
  This preserves the locked §3.3 rule that CSL, STS, Identity Verified and Skill Verified are four
  distinct concepts, and §6/§8.4 that VouchPlay never ranks players by STS.
- It ends with the action that actually helps: get a vouch, or read the FAQ.
- **Presentation corrected on the same night after seeing it on a real phone.** It first opened as the
  large bottom-sheet variant, which on a tall phone pushed the heading up under the browser chrome and
  read as clipped and wall-of-text. An explainer is not an announcement: it now uses the compact
  centered variant (`Modal align="center"`, default `md` width, `max-h-[85dvh]`), and the copy was cut
  by roughly a third - one lead sentence with the 0-5 scale folded in, three short bullets, one
  reassurance line, a primary "Get a vouch" and a plain-text FAQ link. **Rule: explanatory dialogs are
  centered and compact; only image-led announcements use the full-width sheet.**
- Implemented as its own client component re-exported from `badges.tsx`, so all existing call sites
  (player profile and both player-card variants) pick it up unchanged and the remaining badges stay
  server-rendered.

## 1H. Compact player list layout (2026-09-08, post-launch)

Reported from a live phone: names in the compact directory were being cut off, and the STS chips did
not line up down the list.

- **Cause:** the row put the name and the skill/STS group side by side, and the right-hand group was
  `shrink-0`. Flexbox therefore took every pixel of squeeze out of the name, so the most important
  field truncated first while the pill kept its full width. STS also sat inline right after the pill,
  so its x-position moved with pill width, and a player without STS left no column at all.
- **Priority is name, then skill level, then STS.** The row is now two lines: the name owns the full
  row width on the first line (truncating only in the extreme), the skill pill sits on its own line
  beneath where it can render in full, and STS occupies a fixed-width right column that keeps its
  width even when a player has none, so the column reads straight down the list. Row height is
  effectively unchanged because the previous row already had a 56 px minimum.
- Verified on a 375 px viewport across the live list: zero truncated names and a single shared STS
  column x-position across every row.
- **Also fixed an invalid-nesting bug introduced with the STS explainer:** the compact row is a link,
  and the explainer had made the STS chip a `<button>`, so a button was nested inside an anchor - one
  tap would have both opened the dialog and navigated. `StsChip` gained an `interactive` flag; inside
  links it renders a plain chip, and the explainer remains available on the profile and detailed card.
  **Rule: never place an interactive control inside a row that is itself a link.**

## 1I. Clubs header layout (2026-09-08, post-launch)

Reported from a live phone: the Clubs heading and its two actions (Opportunities, Create club) were
crowding each other.

- **Cause:** the header forced the title block and the action group onto one row at every width. On a
  phone that left the title and subtitle about half the screen (the subtitle wrapped to two lines)
  while the two buttons stacked raggedly at different widths.
- **Fix:** the row is shared only when there is room (`sm:` and up). On a phone the actions drop to
  their own full-width row with both buttons flexing to equal size, so the heading keeps the full
  width and the subtitle fits on one line. Desktop is unchanged: title left, auto-width actions right.
- **Tap targets raised to a true 44 px.** Note for future work: this app sets a **14 px root font
  size**, so every rem-based Tailwind size is scaled to 0.875x - `min-h-11` renders 38.5 px, not 44.
  Use an explicit pixel value (`min-h-[44px]`) when a real touch-target minimum is required.

## 1J. Slot privacy and organizer-synced interest options (2026-09-08, post-launch)

Two live corrections requested by Jasper.

### Remaining slots are no longer public

- The public division browser previously showed `X / Y teams` plus a capacity meter. That is now
  hidden: an exact remaining-slot count deflates interest while a division looks empty early, and
  removes urgency once it is known to be far from full.
- **This reverses the §1C decision to show a per-division registration bar publicly.** Recorded
  deliberately so it is not "restored" later as a regression.
- Organizers still see capacity and registration counts on Manage (overview and registrations); only
  the player-facing browser hides them.
- **A full division is still disclosed**, without numbers: registering there joins a waitlist rather
  than taking a slot, so the player must know that before acting. Withholding scarcity data must never
  extend to withholding a fact that changes what the action does.

### Interest options follow the organizer's divisions

- Interest was always collected against the fixed planning taxonomy, so once an organizer configured
  real divisions the demand they read did not map onto the event they were running.
- Options now come from the tournament's own visible divisions, falling back to the fixed taxonomy
  only when none are configured. The picker and the aggregate breakdown derive from one
  `demandOptions()` helper so they cannot drift apart.
- **No migration.** `tournament_demand_interests.division_key` is free-form text constrained only by
  `^[a-z0-9_]{3,64}$`; the taxonomy restriction lived in the app layer. A division key is `div_` plus
  the division uuid with hyphens stripped, which satisfies that pattern and is reversible.
- The server accepts a division key only when it resolves to a real, non-draft division **of that
  tournament**, so a key cannot be borrowed from another event.
- Interest already recorded under old taxonomy keys still appears in the breakdown with its correct
  label, so no historical signal is lost when an organizer adds divisions later.

## 1K. Philippine time everywhere (2026-09-09, post-launch)

- §35.5 already named `Asia/Manila` as the launch timezone, but two code paths ignored it and both
  were wrong in production. `datetime-local` form values were parsed with `new Date(value)`, which
  resolves in the **runtime's** timezone - UTC on Vercel - so an organizer typing 5:00 PM stored
  `17:00Z`; the same instant was then rendered through a formatter pinned to `UTC`, showing 1:00 AM the
  following day.
- One pure module now owns both directions: `@vouchplay/core` `time/ph-time.ts` -
  `phInputToIso`, `phDateInputToIso` (form → UTC instant) and `isoToPhInput`, `isoToPhDateInput`
  (instant → form). Display goes through `lib/format-date.ts`, pinned to `en-US` + `Asia/Manila`.
- **Storage is unchanged.** Instants stay UTC in the database per §35.5; only entry and display are
  anchored to PH time, for every viewer regardless of their device timezone.
- The Philippines has had no DST since 1978, so a fixed +8 offset is exact, not an approximation.
- **Standing rule:** never parse form input with a bare `new Date(...)`, never format with a bare
  `toLocale*`, and never pin app copy to `timeZone: 'UTC'`. That combination produces both silent
  day-shifts and React hydration error #418.

### Follow-up sweep: the last bare formatters (2026-09-09)

- The §1K fix corrected the two paths that were provably wrong in production, but thirteen display
  sites still called `new Date(iso).toLocale*()` directly. Server-rendered ones (player "Member
  since", tournament announcements, the Admin audit, users, leaderboards and staff pages) formatted
  in the **runtime's** timezone, which is UTC on Vercel, so any instant between 4:00 PM and midnight
  Manila showed the previous day. Client-rendered ones (notifications, the moderation queue, the
  vouch moderation panel, the settings "last changed" note) formatted in the **viewer's** timezone,
  so the same row could render differently on the server and in the browser - the exact shape of
  hydration error #418.
- All thirteen now go through `lib/format-date.ts`, which gained three pinned variants alongside the
  existing two: `formatMonthDay` ("Sep 8"), `formatMonthYear` ("September 2026") and
  `formatShortMonthYear` ("Sep 2026"). Every displayed date in the app is therefore produced by one
  module pinned to `en-US` + `Asia/Manila`.
- A unit test asserts each helper against an instant that falls on a different calendar day in UTC
  than in Manila, so a regression to a bare formatter fails the suite rather than shipping quietly.

## 1L. Vouch context, peer achievements, and leaderboard clarity (2026-09-09, post-launch)

**Status: shipped.** Migration 0024 applied 2026-09-09 (`vouch_interaction_observed=1`,
`achievement_issuer_peer=1`); both surfaces live and verified on both production domains.

**Release-order rule learned here.** Unlike 0022/0023, this code was **held out of production until
the migration was confirmed**, rather than deployed dormant. A dormant *table* reads back empty and
nobody notices; a dormant *enum value* returns an error to a real person who just tapped a visible
control. Deploy-before-migrate is fine when the gap is silent, not when it is a button - and never
during a live registration window.

### "I have watched them play"

- Live vouching surfaced people who had genuinely seen a player but never partnered with or played
  against them; the form forced them to claim a play relationship that never happened.
- `vouch_interaction` gains `observed` (migration 0024).
- **Vouch weighting is untouched, and this is deliberate.** Interaction type has never been an input to
  `effectiveWeight` (§10.5) - only the approved-Coach toggle and the *voucher's* identity verification
  move weight, and the 1.00/1.25/2.00/2.50 ladder is LOCKED. `observed` is a context label, and the
  form tells the voucher so, which is what makes the honest answer free to give.
- Interaction copy lives in one module (`apps/web/src/lib/vouches/interaction.ts`) so the vouch form
  and the moderation view cannot drift apart.

### Someone adds an achievement for you, you confirm it

- A community claim could previously only be self-added, which reads as bragging and excludes the
  people best placed to attest to a result - the ones who were there.
- `achievement_issuer_type` gains `peer` (migration 0024). `achievements.verification_status` carries
  the state: `pending_subject` → `community`. That column is free-form text with no check constraint,
  so **no column was added**.
- **A nomination is invisible to everyone except its subject until the subject confirms it.** Nobody
  can write on another player's profile. Pending claims are returned only when the viewer is the
  subject, and they cannot be endorsed.
- **Declining deletes the row and the nominator is not notified**, so a decline can never turn into
  friction between two players. A confirmed claim stays attributed to whoever added it.
- Guards: no self-nomination through this path, blocked pairs excluded, target must be active and
  onboarded, one undecided nomination per nominator per subject, 20 undecided per subject, and the
  subject can always remove a confirmed claim from their own profile.
- Community claims remain explicitly labelled and **never** affect CSL, STS, Skill Verified, vouch
  weight, contribution, eligibility, or any ranking.

### Old and new interest rows are merged

- The interest breakdown listed the planning taxonomy and the organizer's real divisions as separate
  rows for the same thing - "Novice Men's 6" sitting directly above "Men's Doubles Novice 0" - because
  interest collected before divisions existed is stored under taxonomy keys and interest collected
  after is stored under `div_<uuid>` keys. §1J made the *labels* correct but left the *rows* split.
- Legacy keys are now folded onto the division that means the same thing: same single skill band and
  same sex classification, or (for the age bracket) same age floor and sex. Matching is pure and
  unit-tested in `@vouchplay/core` `tournaments/demand-alias.ts`; the app layer only supplies the
  shapes, because skill-band keys live in `@vouchplay/config`.
- **An alias is produced only when exactly one division matches.** An ambiguous or absent match leaves
  the legacy key on its own row, so a recorded interest is never silently moved into a division the
  organizer did not clearly mean, and no count is ever dropped - merging is sum-preserving.
- The age bracket matches on *having* an age floor rather than the exact age: the taxonomy offers a
  fixed 50+ option while an organizer picks their own bracket (45+ for B-Steel Hermosa). The signal
  being merged is "these people want the men's age division", which is what a planner needs.
- Verified against live B-Steel Hermosa data: all 8 legacy keys resolved, 0 legacy rows left over, and
  the total held at 21 interests before and after.
- Demand remains a planning signal only. It still touches no eligibility, registration, or scoring.

### The vouches-given leaderboard already existed

- "Community Champions" (`category = 'community'`) has ranked contribution - vouches given - since
  Phase 13C. It looked missing because its active snapshot is dated 2026-09-07 and holds **0 entries**,
  published before anyone had contribution rows. There are now 24 scored players and 93 active vouches.
- No new board was built. What was missing was plain language and an honest empty state: each board
  states what it ranks, the category picker reads "Community Champions - vouches given", and an empty
  board explains that no snapshot has ranked anyone yet.
- **Open operational issue:** the nightly `17 1 * * *` (09:17 Manila) rebuild in `vercel.json` is not
  landing and the cause is unresolved. `CRON_SECRET` is configured (an unauthenticated call returns
  401, not the 503 a missing secret would give), and cadence/enablement/pause settings are all clear,
  so the Vercel cron invocation log is the next place to look. Meanwhile an Admin → Leaderboards
  rebuild publishes a current snapshot on demand.

## 1M. Numbered pagination (2026-09-09, post-launch)

The old control was two heavy bordered buttons pinned to opposite edges of the row with "Page 2 of 3"
marooned between them. It read as clunky, gave no sense of how long the list was, and offered no way
to jump. One shared `components/ui/pagination.tsx` now serves Players and Clubs:

- **Numbered pages**, so a reader sees the extent of the list and can jump straight to a page.
- **One centred group** rather than edge-pinned blocks, so there is a single target for the eye and
  the thumb, with "Page N of M" kept below as a plain caption for anyone who wants the words.
- **Unavailable Previous/Next stay in place, dimmed**, instead of disappearing. The old version
  rendered an empty `<span />` on page 1, so the whole row shifted the moment you paginated - the
  exact condition for mis-tapping under a thumb.
- **The page number swaps in place for a spinner** while that navigation is pending, inside a
  fixed-size button, so pending feedback never reflows the row.
- **44px touch targets throughout**, written as pixel values because the app's 14px root font makes
  rem-based Tailwind sizes 0.875x (see §1I).
- **Long lists collapse** to first / current-1 / current / current+1 / last with ellipses. Below `sm`
  the outer jump links and ellipses hide, but **only when the full set would not fit** - a 3-page list
  still shows 1 2 3 on a phone.
- Semantics: `<nav aria-label>` + `<ul>`, `aria-current="page"` on the current page, `rel="prev"` /
  `rel="next"`, and `sr-only` names for the icon-only controls at phone widths.

## 1N. Loading feedback on a player row (2026-09-09, post-launch)

- Tapping a compact player row gave no feedback at all until the profile finished rendering, so on a
  slow connection the tap looked ignored and people tapped again.
- The compact row's trailing STS slot now doubles as the pending indicator: the chip is replaced by a
  spinner while that row's navigation is in flight (`useLinkStatus` inside the `<Link>`).
- **The cue deliberately reuses the existing 66px STS column instead of adding one.** The first
  attempt added a trailing chevron column, which took ~28px from the name and pill column and made the
  longer pills ("High Intermediate · Community") wrap onto a second line, leaving the list ragged -
  the same failure mode as the truncated names in §1H. Reusing the fixed column costs no width, so
  nothing to its left can reflow.
- The detailed card's player name also shows a spinner now, matching the "View profile" link below it,
  since the name is the other thing people tap on that card.

## 1O. The nightly leaderboard rebuild explains itself (2026-09-09, post-launch)

### The cron was never broken

The open item read "the nightly cron is not landing". The database says otherwise. Every
`leaderboard_snapshot_runs` row ever written falls into three batches, and all three are accounted
for:

| Batch (UTC) | What it was |
| --- | --- |
| 2026-09-07 16:21 | the initial ship of the leaderboards feature |
| 2026-09-07 22:05 to 22:10 | Admin rebuild, reason "Controlled production public leaderboard verification" |
| 2026-09-08 17:42 | Admin rebuild, reason "Need leaderboards" |

The `crons` entry was added to `vercel.json` in commit `a850d27` at **2026-09-07 16:39 UTC**, so the
schedule has had exactly **one** opportunity to fire since it existed: 2026-09-08 01:17 UTC. At that
instant the most recent publish was 2026-09-07 22:10:41 UTC, **three hours and six minutes earlier**.
The route's own cadence guard therefore returned `CADENCE_NOT_DUE` and correctly did nothing.

There is no failure to explain. The board looked empty because the Sep 7 rebuild ran before the
community had contribution rows to rank, not because a job died. The 2026-09-08 17:42 rebuild
published 25 community and 24 player entries, and the live board has been current since.

**A skip leaves no trace anywhere.** That is the actual defect: the only way to tell "the job ran and
correctly did nothing" from "the job never ran" was the Vercel invocation log, outside the app, behind
a dashboard login. A whole session went into a bug that did not exist.

### What was built instead

- **Every authenticated cron invocation now writes one `audit_logs` row** (`leaderboard.cron.run`,
  actor `null`, role `system`) recording its outcome: `published`, `skipped_cadence`,
  `skipped_disabled`, `skipped_all_paused` or `failed`, plus the facts behind it. No migration:
  `audit_logs` already accepts a null actor, and it is append-only, so the trail cannot be edited.
- **Unauthenticated calls are never logged.** Writing an audit row before the secret check would let
  any anonymous caller fill the table. The audit starts after authorization, which is also where the
  interesting outcomes are.
- **Admin → Leaderboards leads with a plain-language "Nightly rebuild" panel**, above the controls:
  when it last ran and what it did, when it next runs, and whether it will publish then or skip. It
  states the reason in words a non-technical operator can act on ("the boards were published 7 hours
  ago and the cadence is 24 hours, so tonight's run will skip"), not a status code.
- **The panel predicts, it does not guess.** "Will publish" versus "will skip" is computed from the
  same two inputs the route uses: the newest active published snapshot and
  `leaderboard_publish_cadence_hours`. If the panel and the route ever disagreed, the panel would be
  worse than nothing.
- **The schedule lives in one place and is drift-tested.** `lib/leaderboards/cron-schedule.ts` holds
  the UTC hour and minute; a unit test reads the repo-root `vercel.json` and fails if the two ever
  diverge, so the panel cannot advertise a run time the platform is not using.

### The 24h cadence stays as it is

A manual rebuild resets the cadence window, so an Admin rebuild after 01:17 UTC costs that night's
automatic publish and the boards publish the following night instead. **That is correct behaviour, not
a bug to fix.** A publish appends to the immutable snapshot audit trail, fires rank-movement
notifications, and is the beat of the vouch-to-rank feedback loop. Publishing twice inside eight hours
would spam all three to save a few hours of freshness. The panel now says plainly when the next
publish lands, which was the only thing actually missing.

**Concrete prediction, recorded so it can be checked:** the last publish was 2026-09-08 17:42 UTC, so
the 2026-09-09 01:17 UTC run will skip (7h35m elapsed) and the 2026-09-10 01:17 UTC run will publish
(31h35m elapsed). After that the panel answers the question without anyone reading a log.

## 1P. Community leaderboards, one tap from Players (2026-09-09, post-launch)

### What already existed, and what was actually missing

The boards themselves were built in Phase 13D and are live. `/leaderboards` already served all three
categories (Players, Community Champions, Clubs), three scopes and three periods, with a top-three
podium, a private momentum card and a rankings explainer. **No new board, query, snapshot or
migration was needed.** Two things were genuinely missing:

- **No way in.** `/leaderboards` was reachable only from the Home page. Primary navigation is locked
  to five tabs (§5.1), so a sixth tab was never an option, and a player browsing the directory had no
  reason to believe rankings existed.
- **The category chooser was a form.** Picking a board meant three dropdowns plus an Apply button:
  four decisions and a submit before anything appeared, with the default board already on screen so
  the control looked inert. For an audience that spans a wide range of ages and comfort with apps,
  that is the difference between a feature that exists and a feature people use.

### The way in: an entry card on Players, not a link

- A single full-width card sits directly under the Players heading, above the search filters. It is
  **one tap target for the whole card**, because a small text link is the wrong affordance for a
  section-level jump and a card gives a thumb something to hit.
- **It shows the current number one rather than describing the concept.** "Community leaderboards"
  is an abstraction; a real name and face with a crown is a reason to tap. The top three avatars
  appear as an overlapping stack with the leader named.
- Following §1H, the CTA inside the card is a styled `span`, not a button: the card is already a
  link, and nesting an interactive control inside a link means one tap does two things.
- When no snapshot has ranked anyone yet the card still renders, with an invitation instead of a
  leader. It never dead-ends and never shows an empty avatar stack.

### Tabs, not dropdowns

- Category selection is now a **tab strip of three links**: Top Players, Top Contributors, Top Clubs.
  Links rather than a JavaScript tablist, deliberately: each board keeps its own URL, so it is
  shareable and bookmarkable, it works before hydration, the browser Back button behaves, and Next's
  prefetch plus `useLinkStatus` give the pending feedback the app already uses elsewhere (§1N).
- **One tap now changes the board.** Scope and period moved into a collapsed "Change scope or period"
  disclosure below the tabs. Global all-time is what almost everyone wants; nobody has to understand
  scope or period to use the page.
- Semantics: `<nav aria-label>` + `aria-current="page"` on the active tab, 44px targets written as
  pixel values because the app's 14px root font makes rem-based Tailwind sizes 0.875x (§1I).
- **Tab labels and board titles are allowed to differ, on purpose.** The tab reads "Top Contributors"
  because that is what a newcomer scanning three tabs understands; the board keeps its product name
  "Community Champions" with the locked "Ranked on vouches given" line underneath. The tab is
  wayfinding, the heading is identity. Both come from one module
  (`lib/leaderboards/board-meta.ts`) so they cannot drift.

### Making it feel worth being on

The brief was to make the boards visually engaging enough that people want to be in them. Each choice
below is a hook with a reason, not decoration:

- **A real podium.** First place is elevated and wider with a crown; second and third sit lower with
  silver and bronze treatment. Rank is carried by size, medal colour, icon **and** the numeral, never
  by colour alone. Below `sm` the podium stacks first, second, third, because three across at 375px
  crushes the names.
- **You are highlighted in the list.** A signed-in viewer who appears on the board gets a tinted row,
  a ring, and a "You" chip. Seeing yourself in a ranking is the single strongest reason to come back,
  and it costs one comparison against `subjectId`.
- **Three headline tiles above the tabs**, in the style of a scoreboard: your position, how many are
  ranked on this board, and when the next rankings land. Signed-out visitors see "Join to be ranked"
  in the first tile, which turns the boards into an acquisition surface rather than a dead end.
- **The next update is stated, not implied.** Rankings publish once a day (§1O), so the page says
  when the next set lands. Anticipating a drop is the point of a daily cadence; leaving it invisible
  wasted it. The time comes from the same pure `nextPublishingRunAfter` helper the Admin panel uses,
  so the public promise and the operator view cannot disagree.
- Movement, glow and lift reuse the existing `.vp-card`, `.vp-glow`, `.vp-gradient` utilities from
  §33, which are already disabled under `prefers-reduced-motion`. No new animation primitives.

### Boundaries kept

- **Read-only. No migration, no new table, no new query, no scoring change.** Everything renders from
  the existing published snapshots and the existing cached `getLeaderboard` / `getMyMomentum` reads.
- The locked rules are untouched: VouchPlay still never ranks players by STS, the four concepts stay
  separate (§3.3), and privacy, age, fraud and eligibility exclusions still run at publication, not
  at render.
- The private momentum card stays private. Nothing on the public boards exposes a rank, score or
  exclusion reason for anybody but the viewer themselves.

## 1Q. Leaderboards, condensed and honest (2026-09-09, post-launch)

§1P put the boards one tap from Players. Seeing them live on a phone showed the page still spent its
best real estate on the wrong things, and that one of the three boards was ranking something it did
not claim to rank.

### The page now leads with the choice, not the chrome

- **The tab strip is the first thing on the page.** Choosing a board is the only decision most people
  come here to make, so nothing outranks it.
- **Next update is one small line under the heading**, not a tile. It is worth saying (a daily drop is
  only motivating if people know when it lands, §1O) but it is not worth a third of the first screen.
- **"Your position", "Ranked here" and "Your momentum" collapsed into one thin row, closed by
  default.** Two of those were the same number shown twice: the momentum card and the position tile
  both read `#26`. They are now one box, with the ranked count beside it.
- **The collapsed summary still states both numbers**, so nobody has to open anything to learn where
  they stand. Expanding adds the points, the private-snapshot caveat and the next action. Progressive
  disclosure, not hiding: the closed state is informative on its own.
- The Players entry card was cut roughly in half. It keeps what earns the tap (the leader's name, the
  top-three faces, an explicit "View leaderboards") and drops the paragraph that repeated the tabs on
  the next screen. The Players tab exists to browse players; the card is a doorway, not a display.

### Top Players stays closed until results exist

- **Every one of the 31 ranked players had `participation: 0` and `placement: 0`.** The board was
  ordering people by profile completeness and the Skill Verified flag, then presenting it under a
  heading that promises "verified tournament play and official placements". Ten players tied on 2.0
  points and were separated by nothing a reader could see. That is not a soft edge case; it is a
  ranking that says something untrue about real people, in production, during a registration window.
- The board now renders an explanatory panel instead of a list until at least one ranked entry has a
  verified tournament or an official placement. **The test is on the published data, not on a flag**,
  so it opens by itself on the first snapshot after an organizer awards a placement. Nobody has to
  remember to switch it on, and it closes again correctly if a season is ever rebuilt from scratch.
- **Pausing the category would have been the wrong tool.** A pause is an operator saying "stop
  publishing"; it shows a warning chip and leaves the misleading list on screen. This is the product
  saying "there is nothing to rank yet", which is a different statement and needs different copy.
- The empty state names what will fill it and links to the tournaments, so it reads as a countdown
  rather than a failure.

### Top Clubs is ranked on what its members contribute

- Club scoring already includes cumulative member contribution, and on live data it is already about
  80% of the leading club's score (17.97 of 22.44). What it is **not** is reliably decisive: with
  `leaderboard_club_contribution_weight` at 1 against `leaderboard_club_active_members_weight` at 2,
  the second and third clubs sat 0.33 points apart, so a club could pass another on member count
  alone.
- **This is a settings change, not a code change.** All five club component weights are
  `system_settings` rows, exactly as §35 requires, so raising contribution is an Admin edit with no
  deploy, no migration, and a one-click reversal.
- The `sqrt` dampening on the contribution total stays. It is monotonic, so it never changes the
  order of clubs by cumulative contribution; it only stops one very large club from dwarfing the rest
  of the scale.

- **A member in more than one club counts in full for each of them** (Jasper, 2026-09-09). Three
  members are currently active in two clubs each. Splitting their points would conserve the community
  total but would mean telling a player their contribution counts for half, which is a worse thing to
  explain than a little inflation where clubs share members. "Your clubs each get what you contribute"
  is a rule a player can hear once and remember.
- Applied values: `leaderboard_club_contribution_weight` 1 -> **6** (matching placement, the previous
  top weight) and `leaderboard_club_active_members_weight` 2 -> **1**. Contribution decides the order
  now, and tournament results still matter once they exist.

### Contributors is the board people land on

Landing on Players meant landing on the emptiest board. `/leaderboards` with no category now opens
**Top Contributors**, the only board with real, earned separation today: 25 ranked people, scores from
87.7 down to single figures, every point traceable to a vouch someone actually gave.

**The tab order does not change.** Players stays first because that is the product's canonical order
and reordering tabs under people who have already learned the page is a worse cost than one tab that
currently explains itself. The active tab is unmistakable, so nobody has to guess where they landed.

### STS above, Vouch below, both live in the row

The trailing column now stacks the STS chip over a Vouch button, so the compact row offers the same
two actions as the detailed card. Vouching is the product's core loop, and it was previously two taps
and a page load away from the list where people actually browse. The column widened from 66px to 84px
and both controls right-align, so they still read straight down the list.

### "Submit and request a vouch back": recommended against, and not built

Jasper asked for a second submit button on the vouch form that would send the vouch and request one
back in the same tap, to encourage returning the favour, and asked whether that is good UX. **It is
not, and the reason is not a design preference - it is that the button would manufacture exactly the
behaviour the scoring engine is built to discount.**

- `CONTRIB_V1` already dampens reciprocity and rings, and the Community Champions board says so on
  its face: "Repeat pairs and suspicious rings do not add raw-volume credit." A one-tap
  vouch-for-a-vouch produces reciprocal pairs by design. The product would be encouraging an action
  and then docking people for taking it, which is incoherent and reads as a bait when their points
  do not move.
- **A vouch given while asking for one back is not independent evidence.** VouchPlay exists because
  self-declared and inflated ratings cannot be trusted. Quid pro quo rebuilds that problem with extra
  steps: at any scale it inflates CSL and STS across the board and makes the ratings mean less, which
  is the founding problem in reverse.
- It puts the recipient under obligation. "They vouched for me, so I owe them one" lands hardest on
  exactly the less confident users this app is meant to be gentle with.

**What was built instead.** Requesting a vouch is legitimate; *bundling* it with giving one is what
is harmful. Requesting already exists as its own action (§12, `RequestVouchForm`, reachable from a
player's profile), and it stays there, unbundled. The vouch form's confirmation now does the growth
job honestly: it confirms what the vouch did for the other player and offers **"Vouch for someone
else you have played with"**. That grows the vouch graph in the direction that makes ratings *more*
trustworthy - more distinct vouchers - rather than pairing two people together. It is also what
`CONTRIB_V1` actually rewards: distinct players supported, with newcomers weighted higher.

If Jasper still wants the paired button after reading this, it is a small change and the decision is
his; this section records why it was not the default.


## 1R. Home leads to the community, not to a brochure (2026-09-09, post-launch)

### "Developed by", not "Powered by"

JT Consulting & Analytics built VouchPlay. "Powered by" reads like an infrastructure credit, the line
you see under a widget somebody embedded; "Developed by" is the accurate claim and the stronger one.
Changed in both places it appears (the header strip and the home footer) and in the §5.2.1 spec text
that named the old wording, so the spec and the app do not disagree. Earlier changelog entries keep
the old wording because they are a record of what shipped at the time.

### Community Champions is the middle of the page

Home used to spend its first two screens on a large hero and three explainer cards before any
evidence that a community existed. That order is written for a first-time visitor who reads
top-to-bottom once, and against everyone who comes back.

The page is now hero, **highlight**, everything else:

1. **A condensed hero.** Same words, less air: smaller padding, a smaller heading, tighter button
   row. It still says what VouchPlay is in one sentence and offers two actions.
2. **Community Champions, presented as the highlight.** It sits in the visual middle, wrapped in an
   elevated container with the brand gradient edge and glow that the hero uses, under a "Community
   spotlight" label. **This is the only board with real earned separation today** (§1Q), so it is the
   only one that can carry the middle of the page honestly.
3. **The rest of the rankings below it**, clearly secondary: Top Clubs, then Top Players, which is
   still withholding its list until placements exist.
4. **The three explainer cards, condensed**, after the proof rather than before it. Somebody who has
   just seen real named people ranked by real vouches is more ready to hear "here is what you can do"
   than somebody who has seen nothing yet.

**Why the highlight goes above the explainers rather than below them.** The cards describe the
product; the board demonstrates it. A leaderboard with faces and numbers is evidence that people are
actually using this, which is the single most persuasive thing on the page for a newcomer and the
main reason a returning player opens the app at all. Explaining first and proving second wastes the
proof on people who have already scrolled past.

### Condensed, not stripped

- The explainer cards became compact rows: the icon sits beside the title instead of above it, so
  three cards cost roughly half the height on a phone without dropping a single word.
- Nothing was removed from the hero. Cutting padding and one type step is reversible and safe;
  cutting the sentence that explains the product to a first-time visitor is not.
- The personal momentum card stays directly above the highlight, so a signed-in player sees their own
  position immediately before seeing whose position they are chasing.

## 1S. The compact row becomes the directory (2026-09-09, post-launch)

Compact is now the **default** view on Players. It was already the better list for the job - a
directory is for scanning names, and the detailed card spends a whole screen on three players - but
it was hidden behind a toggle most people never pressed. Detailed remains one tap away and its URL
(`?view=detailed`) is unchanged for anyone who has bookmarked it.

Making it the default meant it had to carry more, so the row is now two lines with a clear priority
order:

- **Line one: name, nickname, sex.** The name still owns the line and truncates last. The nickname is
  how people actually recognise each other locally, and sex is a real filter in a sport with separate
  divisions, so both belong where the eye lands first. Sex renders as its symbol alone here with a
  screen-reader label behind it, because the word costs width the name needs and the symbol is
  already the convention on every draw sheet.
- **Line two: skill, then clubs.** Skill stays first because it is what a player is being scanned
  for. Club affiliation answers "do I know these people" and is the natural second question.
- **The trailing STS column is unchanged at 66px**, so it still reads straight down the list (§1H).

### The STS chip is tappable in the list, without nesting a button in a link

§1H banned interactive controls inside a row that is itself a link, because one tap would both open
the dialog and navigate. That rule stands. What changed is the row.

The row is no longer an anchor wrapping everything. It is a plain container holding **one link and
one button, as siblings**: the player's name is the link, and it carries a stretched `::after`
overlay that covers the whole row, so the entire row is still one big tap target. The STS chip is a
real button raised above that overlay. No interactive element is nested inside another, one tap does
exactly one thing, and both are reachable by keyboard in a sensible order.

**Club chips in the compact row are deliberately not links.** They could be, but every extra
interactive island inside a row makes it harder to predict what a tap will do, and the two that
matter (open the profile, explain STS) are worth protecting. The detailed card keeps its linked club
stack.

This is the same resolution the codebase already reached for `StsChip`: an `interactive` flag on the
shared component rather than a second copy of it, so the list and the profile cannot drift.

### Why STS earns an exception and clubs do not

A number nobody understands is worse than no number. STS was the single most-asked question in the
first minutes of launch (§1G), and the compact list is now the default surface, which makes it the
place most people meet the score. Leaving it unexplained there and saying "open the profile to find
out" puts the answer one navigation away from the question. A club logo does not raise a question
that urgent.

## 1T. Three corrections found on a real phone (2026-09-09, post-launch)

All three came from Jasper using the live app on an Android device, and all three are the same class
of mistake: something that looked fine in a component looked wrong in a list.

### Club icons come back out of the directory row

§1S put club affiliations on line two of the compact row, beside the skill pill. On a real phone that
line has to hold a pill like "High Intermediate · Community" plus up to two logos, and the pill wraps
onto a second line - the exact ragged-list failure §1H and §1N were both written about.

**The icons are removed from the compact row.** The trade is not close: the skill band is the thing a
player is scanned for, and a wrapped pill costs the whole list its rhythm, while a club logo at 20px
is decoration in that context. Club affiliation is still on the detailed card and on the profile,
where it has room to be read rather than glanced at.

**Rule, now stated plainly: a compact row gets one pill per line and nothing beside it.** Anything
else added to that line has to earn its place against making every row in the list taller.

### The row's tap now shows that it is loading

§1N's pending spinner stopped appearing for most taps and nobody noticed for a release. §1S split the
row into an invisible overlay link covering the row and a named link on the player's name; the
spinner lived inside the **name** link, but almost every tap lands on the **overlay**. `useLinkStatus`
only reports for the `<Link>` it sits inside, so the common case silently lost its feedback while the
rare case kept it.

The cue now sits inside both links. Whichever one a person actually hits, the avatar shows the
spinner. **The general lesson: when a component is split in two, its state hooks do not follow - check
every path, not the one that was refactored.**

### Your momentum moves below the boards, and collapses

Home's job in the middle of the page is the community, not the viewer. The momentum card sat directly
above Community Champions taking a full card's height to show one number, which pushed the highlight
down and made a page about the community open with a paragraph about you.

It now sits **below** the rankings, as a single collapsed row. The closed summary still states the
rank, so the number is never hidden - only the explanation, the points and the next action are behind
the disclosure, which is the same pattern the leaderboards page uses for its own stats (§1Q). Being
below the boards is also the more honest order: you see where the community stands, then where you
stand in it.

## 1U. Pay first, confirm the partner after (2026-09-09, post-launch)

**Status: shipped.** Migration 0025 applied and verified 2026-09-09 (`invitation_team_id_column=1`,
`new_rpcs=3`, `accept_rpc=1`, `invitation_team_index=1`, `legacy_open_invitations=0`), then the code
deployed behind it, in that order.

### What the flow costs a player today

The doubles path is four separate sessions, and the app cannot do anything useful in three of them:

1. Player A picks a division and invites Player B.
2. **A waits.** No team exists yet - `accept_partner_invitation` is what *creates* the `teams` row -
   so there is nothing to register and nothing to pay.
3. B accepts. Now a team exists.
4. A comes back, taps Register, gets a short slot hold, pays, uploads the receipt.
5. The organizer verifies, and the entry is confirmed.

The blocker is structural, not cosmetic: **the team is created by the acceptance**, so every step
after it is gated behind another person picking up their phone. A player who has already agreed with
their partner in person, over Messenger, or at the court has to wait anyway.

### The flow we want

1. Player A picks a division, picks their partner, and **goes straight to payment**.
2. A pays and uploads the receipt. **The receipt reserves the slot.**
3. B is notified that A has entered them as a partner and already paid, and confirms or declines.
4. The organizer verifies the payment; **both players are notified** and the entry is confirmed.

Two clicks and an upload, in one sitting, without waiting for anyone.

### How it is built

**The team is created at selection, not at acceptance.** A new RPC creates the `teams` row
(status `forming`) with A as a confirmed member and B as a member whose `confirmed_at` is null.
`team_members.confirmed_at` has always been nullable and has always been set eagerly; this is the
first use of what the column was for. Registration and payment then work unchanged, because
`register_team` only ever required the actor to be a team member - it never required the partner to
have accepted.

**The slot logic already does what we need.** `register_team` counts a division as occupied by
`confirmed`, `payment_submitted`, `under_review`, and un-expired `payment_pending`. So a short hold
covers the walk to the payment screen, and the uploaded receipt (`payment_submitted`) holds the slot
with no expiry until the organizer rules on it. No change to capacity or waitlist behaviour.

**Accepting attaches to the existing team.** `partner_invitations` gains a nullable `team_id`. When
it is set, accepting stamps `confirmed_at` on B's existing row and moves the team to `formed`. When
it is null, the RPC behaves exactly as it does today and creates a team.
**That branch is what makes this safe to deploy mid-tournament:** every invitation already sitting in
someone's inbox has a null `team_id` and keeps working.

### If the partner declines

This is the case that decides whether the design is honest, because A has already paid.

- **The entry is not cancelled and the slot is not released.** The money is in and the organizer has
  a receipt to review.
- **A is notified and the entry enters "needs a partner".** A can name a replacement, keeping the
  slot, the payment and the position. The replacement is put through the same eligibility and skill
  floor checks as the original.
- **A replacement is only permitted when the named partner actively declined, or their invitation
  expired.** Never while they are still deciding, and never after they have accepted.

**This is a deliberate carve-out from §1D, and the reason matters.** §1D forbids unilateral partner
replacement so that a teammate cannot be displaced without their knowledge, and that protection is
untouched here: a person who has accepted still cannot be swapped out, and a person still deciding
still cannot be overridden. The carve-out only covers someone who has **said no**, which is not a
displacement - it is a vacancy they created. The locked rule protects people from being removed; it
was never meant to trap a paid entry behind somebody else's decline.

**Partner lock.** Once B accepts, or the organizer verifies the payment, or the tournament's
`club_lock_at` passes, or registration closes - whichever comes first - only the organizer can change
the partner, with a reason and an audit row. That is §1D's existing rule, unchanged.

### What Player A is told before they pay

The warning has to do real work, because A is about to spend money on somebody else's behalf:

- It names the partner and states plainly that **they have not confirmed yet**.
- It says **agree with them first** - this is not an invitation to enter a stranger.
- It says what happens if they decline: **the slot and the payment are kept, and a replacement can be
  named**. A player who does not know that will not risk paying.
- It requires an explicit acknowledgement (a checkbox), because a warning nobody has to touch is a
  warning nobody reads.

Partners must already have a VouchPlay account - partner search only returns existing, active,
onboarded profiles - so "make sure your partner is registered" is enforced, not merely advised.

### What Player B is told

B is being asked to confirm something already paid for, so the message cannot be a bare
accept/decline:

- Who entered them, which division, and that **the fee is already paid**.
- Confirming costs them nothing and does not ask them for money.
- Declining is safe and free, and it releases nothing of theirs. It is stated without guilt, because
  a person pressured into a tournament they cannot play is worse for everyone.

### Where the receipts go (answering the question directly)

They already have a home, and it is private by design:

- Every uploaded receipt goes to the private Supabase Storage bucket **`payment-proofs`**, at
  `{registration_id}/proof-{timestamp}-{random}.{ext}`. The bucket has `public = false` and no public
  policy, so the file is not reachable by URL.
- Organizers review them at **Manage → Registrations**, where each paid entry has a **View proof**
  control that mints a **60-second signed URL** server-side after an authorization check, and a
  **Verify** control that moves the payment to `verified` and the registration to `confirmed`.
- There is no "master folder" to browse, and that is on purpose: a browsable folder of receipts is a
  folder of other people's names, reference numbers and bank screenshots. Access is per-entry,
  per-organizer, time-limited and audited.
- **Gap worth closing:** the organizer has no single "payments awaiting review" queue - proofs are
  found by scrolling the registrations list. That is a filter on an existing screen, not new
  infrastructure, and it belongs in this slice.

### Migration 0025 (required before any of this deploys)

- `partner_invitations.team_id uuid null references teams(id) on delete cascade`, plus an index.
- `create_team_with_pending_partner(...)` - team + confirmed inviter + unconfirmed invitee + the
  invitation, in one transaction, rejecting the same partner conflicts the current accept path does.
- `accept_partner_invitation` extended with the `team_id` branch described above, keeping the old
  path for invitations already in flight.
- `replace_pending_partner(...)` - permitted only when the current invitee declined or expired;
  writes `registration_events` and leaves the registration and payment rows untouched.
- RLS: the invitee can read the team and registration they are named in before they accept.

**Release order (v1.22 rule): migrate first, then deploy.** The gap here is a visible control that
would error, not a silent read, and it sits on the payment path during a live registration window.

### Decisions taken (Jasper, 2026-09-09)

- **Refunds are the organizer's call, case by case.** If the partner declines and no replacement is
  found, the entry sits as "needs a partner" and the organizer either helps resolve it or marks the
  payment refunded with a reason. `payments.status` already has `refunded`, so this is a control on
  the review screen, not new machinery. It suits a manual proof-and-review model: a human already
  looks at every receipt, so a human can look at every stuck entry.
- **No automatic deadline. Only an explicit decline frees the seat.** Jasper chose this over a 48-hour
  window. **The trade-off, recorded honestly:** a partner who simply never opens the app leaves the
  payer's entry holding a seat nobody can fill, and there is no automatic escape. Two things keep that
  from being a dead end - the payer can still cancel their own entry before a receipt is submitted,
  and after that the organizer can resolve it, which is exactly the case-by-case power chosen above.
  There is a second, subtler cost: because a named partner is a real team member from the moment they
  are named, being named blocks that person from entering the same division with anybody else until
  they decline. Declining has to be **one obvious tap** in the notification, not buried, or this
  becomes a way to squat on people. If either cost shows up in practice, a deadline setting is a small
  change and `system_settings` is where it would live.
- **The organizer gets a "payments awaiting review" filter** on Manage → Registrations in this slice:
  entries with a submitted, unverified receipt, with a count. It is a filter on a screen that already
  exists, and it is the screen an organizer will live in once receipts start arriving.

### Build order

1. **Migration 0025 first** (`scripts/apply-0025.sql`), verified by Jasper, before any code ships.
   The gap is a visible control on the payment path during a live registration window, so the
   v1.22 deploy-before-migrate exception does not apply.
2. Then the server actions (create team with a pending partner, decline, replace), the payer's
   warning-and-acknowledge step, the partner's confirm/decline surface, the notifications on both
   sides, and the organizer's review filter and refund control.

### Shipped 2026-09-09 (migration 0025 verified)

Migration 0025 was applied and verified: `invitation_team_id_column=1`, `new_rpcs=3`, `accept_rpc=1`,
`invitation_team_index=1`, `legacy_open_invitations=0`. That last value made this the safest possible
moment to ship - no invitation was mid-flight, so the backward-compatible branch had no live cases to
carry.

**Two of the three decisions needed no new code.** The organizer already had `verifyPayment`,
`rejectPayment` and **`markRefunded`** wired into Manage → Registrations, so "refunds are the
organizer's call" was already buildable on day one. The payment-status filter also already existed;
what was missing was not a filter but a *queue*, so the slice added a one-tap
**"N payments awaiting your review"** banner with a live count that jumps straight to the submitted,
unverified receipts. Receipts arrive faster than anyone can scroll for them.

What shipped:

- `enterWithPendingPartner` creates the team, names the partner unconfirmed, and registers, in one
  action, so the player lands on payment immediately.
- The partner picker became two steps. Step two names the partner, states that they **have not
  confirmed**, says the slot and payment survive a decline, and requires an explicit tick before the
  button enables. A warning nobody has to touch is a warning nobody reads.
- Declining now goes through `decline_partner_invitation`, which frees the seat without cancelling
  the entry or releasing the slot, and only ever removes an **unconfirmed** membership.
- `replacePendingPartner` names a replacement, keeping slot, payment and waitlist position.
- Three notification types, two of them **critical** (`partner_named_paid`, `partner_declined`):
  being named on a paid entry is money-adjacent and it blocks the recipient from entering that
  division with anyone else, so it must not be mutable.
- The person being asked to confirm gets a full-width card saying **the fee is already paid**, that
  confirming asks them for nothing, and that declining is free - with two equal-weight choices,
  because a player pressured into a tournament they cannot play is worse for everyone.

### Correction to an earlier claim in these notes

An earlier entry stated that `issueOfficialAchievement` "exists with zero call sites" and that there
was "no UI for it", and a Phase 15 recommendation was built partly on that. **That was wrong.** It is
wired into Manage → Registrations: every registration row carries a dropdown of the six official
awards and an Issue button (`organizer-registrations.tsx`). The organizer can already award Champion,
Runner-up, Bronze, MVP, Sportsmanship and Participant today. The Phase 15 "results in, achievements
out" slice is therefore mostly **already built**, and what remains there is much smaller than
described.


## 1V. Fixing what the pay-first flow broke, and pricing per player (2026-09-09, post-launch)

**Migration 0026 applied and verified 2026-09-09**: `early_bird_tournament_cols=2`,
`early_bird_division_col=1`, `effective_fee_fn=1`, `per_player_flag=1`, `fee_3000_divisions=0`,
`fee_1500_divisions=15`. Confirmed directly against the database afterwards: 15 divisions at 1500 x 2
= 3000 and 2 at 2000 x 2 = 4000, both unchanged from their old team totals, with **zero payment rows
in flight** at conversion time. The predicted count was 11 rather than 15 - that estimate came from a
truncated table view earlier in the session, not from a miscount of the conversion.

### Two bugs, one cause

Both bugs Jasper hit came from the same place: §1U made a team carry a registration **from the moment
it is created**, and two older rules assumed the opposite.

- **"Leaving a partner just says this action can't be done."** `leave_team_after_cancel` refuses when
  the team has an active registration. Under pay-first that is always true, so the button could only
  ever fail. The two-step "cancel, then leave, then re-invite" path it belonged to no longer exists.
- **No cancel button for the person who registered.** `player_cancel_registration` refuses once a
  `payments` row exists, and the UI only offered the button for `payment_pending` / `waitlisted`. In
  the new flow a payer reaches `payment_submitted` within a minute, so the button vanished and the
  player was left with a control that could not succeed and no control that could.

**The fix is to stop pretending a partner change means dissolving a team.** §1U already built the
right primitives; the UI had not caught up. The partner area now shows only the state a player is
actually in:

- **Seat empty because the partner declined** → "Name a new partner", inline search, keeping slot,
  payment and waitlist position (`replace_pending_partner`).
- **Partner has not answered** → say who, and say that declining is theirs to do, not yours.
- **Nothing to do** → render nothing.

And cancellation now tells the truth in both directions: the button appears only while it will
actually work (registration open, no payment started), and when it will not, the screen says
**message the organizer, who can refund you and release your slot** rather than hiding the option or
failing on tap. A control that cannot succeed is worse than no control.

### The skill ceiling already blocked. It just would not say who.

`evaluateSkillFloor` has always refused a player whose skill is **above** the division's ceiling -
that is exactly the `blocked` branch. What was wrong was the sentence: "You cannot join this division
because it is **your** skill level" is meaningless when the person over the ceiling is the partner you
just named. The message now names them: *"<Name> plays above this division..."*, so the reader knows
what to change. **Note for testing:** the gate only runs when the tournament's `enforceSkillFloor`
rule is on. With it off, nothing is blocked at any level.

### Fees are configured per player

Today `divisions.fee_amount` holds a **team** total, and the app divides it by `team_size` to display
"per player". So the organizer types 3000, the player reads 1500, and the QR collects 3000 - three
different numbers for one price, which is exactly how a fee gets entered wrong.

After migration 0026 the stored number **is** the per-player price. The organizer types 1500, the
player reads 1500, and the payment screen shows **1500 x 2 = 3000 to send**.

- **Nobody's price changes.** The live divisions hold 3000 per team and are already displayed as 1500
  per player; the conversion is `fee_amount / team_size`, exact for every row. Same money in, same
  money shown.
- The conversion is **guarded by a `system_settings` flag**, so re-running the script cannot halve the
  fees a second time. That guard is the only thing standing between a re-run and real financial
  damage, which is why it is a row and not a comment.
- **The payment screen states the arithmetic** rather than just a total: per-player price, times the
  team size, equals the amount to send. A player comparing the QR total against the fee they were
  quoted should never have to work out where the difference came from.

### Early bird

One date range for the whole tournament, one optional early amount per division. Outside the window,
or with no early amount configured, the normal per-player fee applies.

- **The window lives on the tournament and the amount lives on the division**, because "the promo runs
  until the 30th" is one decision an organizer makes once, while "how much off" genuinely differs per
  division. Putting the dates on each division would invite eleven chances to typo the same date.
- `division_effective_fee()` is the single source of the quoted price, so what the player is charged
  and what the organizer configured cannot drift apart.
- Early-bird pricing is **decided when the receipt is submitted**, not when the entry is created:
  the amount owed is the amount that was true at the moment of payment, which is the only reading
  that survives someone starting an entry before the deadline and paying after it.

## 1W. The 100-point wall, and why STS stays 0-5 (2026-09-09, post-launch)

Two questions about caps. They have different answers, and the difference is the point: one cap is
doing nothing but truncating, the other is the entire meaning of the number.

### The Community Champions 100 is a bug in effect, and it is going

There is **no 100-point limit in the contribution engine.** `computeContribution` is an unbounded sum
over distinct players helped, so a raw contribution score can be any size. The wall is in the
leaderboard scorer:

```
component = max(0, min(config.maximumComponentValue, fact.components[key] ?? 0))
```

with `leaderboard_component_cap = 100`. For Community Champions the weights are exactly one component
(`contribution`, weight 1), so the published board score is literally `min(contribution, 100)`.

That is why the top entry reads **exactly 100.0** while second and third read 86.6 and 79.6 - the
leader's real score is above 100 and is being clipped. Right now one person is affected. As vouching
grows, everyone above the cap flattens into a tie at 100.0, and **the board stops telling apart
exactly the people it exists to celebrate.** Ties would then be broken by newcomers-helped and
distinct-players, invisibly, so two very different contributors would appear identical.

**Why the cap exists at all, and why it should stay for the other boards.** It is a guard against one
runaway component dominating a multi-component score. That is real for Players (participation,
placement, profile, skillVerified) and for Clubs (participation, activeMembers, attendance, placement,
contribution), where components live on different scales and an unbounded one would swamp the rest.
Community has **one** component, so the guard protects nothing there and only truncates.

**The fix: make the cap per category, not global.** `leaderboard_component_cap_players`,
`_community` and `_clubs`, each defaulting to today's 100, with community set high enough to be
effectively unbounded. `system_settings` merges code defaults over DB rows, so **new settings keys
need no migration** and the value stays tunable from Admin without a deploy. The global
`leaderboard_component_cap` stays as the fallback so nothing silently changes for a board nobody
touched.

A rebuild is needed for the change to show, because scores live in published snapshots.

### STS should stay 0-5, and raising the number would not do what it looks like

STS is **not** capped by a single ceiling that could simply be lifted. Each of its three inputs is a
normalised fraction:

- `countComponent = min(uniqueVouchers / 5, 1)` - saturates at five distinct vouchers
- `weightComponent = min(sumWeights / 7.5, 1)` - saturates at 7.5 total effective weight
- `agreementComponent = max(0, 1 - min(dispersion / 2, 1))`

blended 0.50 / 0.25 / 0.25 and multiplied by `scale` (5). **The `scale` is already an Admin setting**,
so STS could read 0-10 tomorrow with no code change - and it would achieve nothing, because everyone
with five or more vouchers would simply max out at 10 instead of 5. The saturation is in the
components, not the ceiling.

Genuinely uncapping it means deleting those `min(x, 1)` clamps, and that changes what the number
means rather than how large it gets:

- **STS stops being confidence and becomes volume.** §3.3 defines CSL, STS, Identity Verified and
  Skill Verified as four separate concepts, and STS as confidence in a rating, never ability. An
  unbounded STS is a vouch counter wearing a confidence label.
- **§6 and §8.4 say VouchPlay never ranks players by STS.** A number that keeps climbing is a ranking
  whether or not a board exists for it; people will screenshot it and compare.
- **It re-creates the exact confusion that §1G was written to fix.** Within minutes of launch, real
  players read STS as a skill or quality score. The explainer that fixed it opens with "how confident
  we are about a player's skill level, not how good they are. Scored 0 to 5." Remove the bound and
  that sentence becomes false.
- **Skill Verified breaks.** It is derived from `sts >= 3.0` plus a unique-voucher minimum. On an
  unbounded scale, 3.0 stops meaning "reasonably confident" and starts meaning "has a handful of
  vouches", so a badge about confidence silently becomes a badge about popularity.

**Confidence is genuinely a saturating quantity.** After enough independent, verified, agreeing
vouchers you cannot become more sure. That is not a limitation being worked around; it is the
measurement being honest.

**What Jasper actually wants is legitimate, and there is a better way to give it.** The desire is that
more vouches keep visibly counting for something. They already do - just not in STS. The unbounded,
truthful number is the **unique voucher count**, which is already computed and stored
(`player_skill_profiles.unique_voucher_count`) and already in the DTO, and simply is not shown next to
the score. So the chip becomes **"STS 4.8 · 23 vouches"**: the confidence number stays bounded and
meaningful, and the number that grows forever is the one that honestly grows forever. The explainer
gains one line saying vouches keep counting even once STS is full.

**This is a recommendation, not a refusal.** Uncapping STS is Jasper's call on his own locked rule; if
he still wants it after reading the above, the change is small (drop three clamps, raise `scale`) and
the consequences are listed here so the decision is made with them in view rather than discovered
later.

## 1X. A dialog trapped inside a row (2026-09-09, post-launch)

Tapping the STS chip in the player directory opened a dialog that was see-through: the rows behind it
painted straight over the copy, and the dark backdrop covered only part of the screen.

**`fixed inset-0 z-50` is not absolute.** It positions against the viewport and stacks at 50 only when
no ancestor has created a stacking context. §1S gave the compact row's trailing column
`relative z-10` so the STS chip and Vouch button would sit above the row's tap overlay. That is a
positioned element with a z-index, which **creates a stacking context**, and the dialog was rendered
inline inside it. So the whole modal - backdrop included - was confined to that one row's box, and
every later row's `z-10` column, being later in DOM order at the same level, painted over it.

Nothing was wrong with the modal's own styles, which is why it looked like a rendering glitch rather
than a layout bug.

**The fix is a portal, and it is load-bearing rather than tidiness.** `Modal` now renders through
`createPortal(..., document.body)`, so it escapes every ancestor stacking context regardless of what
a caller nests it in. That fixes the whole class: any future dialog opened from inside a card, a row,
a sticky header or a transformed element is now safe by construction instead of by luck.

- Portaling is guarded by a `mounted` flag so it never runs during server rendering.
- **The body scroll lock the docstring had always promised was never implemented.** It is now. Without
  it the page scrolls behind an open dialog on a phone, which reads as the dialog sliding around.
- Verified by driving the real component: the dialog's parent is `document.body`, a hit test at the
  dialog's own centre lands inside the dialog rather than on a row behind it, and `body.style.overflow`
  is `hidden` while it is open.

**Two other inline dialogs share the old pattern** (`vouch-form`, `request-vouch-form`). Neither is
currently opened from inside a stacking context, so neither is broken, and they were deliberately left
alone: they sit on the live registration path that was being tested at the time. They should move onto
the shared `Modal` when that path is quiet.

### Clubs minimum score raised to 5

A club with no contribution, no participation and one member was appearing on the Clubs board with a
score of exactly 1.0, qualifying purely on the member count against a minimum of 1. A leaderboard that
lists clubs which have done nothing cheapens the ones that have. The default is now 5, which excludes
empty clubs without touching anyone real - fifth place scores 41.

## 1Y. One continuous path from partner to paid (2026-09-09, post-launch)

Findings from Jasper's first real end-to-end run. Most are small; two are not.

### The search said "No players found" before it had looked

`searching` was set **inside** the 300ms debounce timer, so between the keystroke and the timer firing
the component was in a state it should never have had: not searching, no results, query long enough.
That combination renders the empty message, so every search flashed "No players found" and then
produced players. It reads as a failure that corrected itself, which is worse than a slow answer.

`searching` is now set the moment the query is long enough, before the debounce is armed, so the
empty message can only appear after a search has actually returned nothing. **Rule: a "nothing found"
state must be reachable only from a completed lookup, never from a pending one.**

### Entering and paying is now one screen, not a hunt

"Enter and pay" created the entry and then dropped the player back on the division list to find their
own way to the payment form. The button promised two things and delivered one.

The payment step now opens **in place, immediately**, in the same panel: on success the form swaps to
the payment view for the new registration rather than refreshing the page. Nothing to scroll for and
nothing to re-open, which matters most for the people who would give up at that point.

### The QR is downloadable, because scanning a screenshot of a screen does not work

The organizer's QR was rendered into a 160px box, so a player either scanned a distorted image or
gave up. It is now shown larger with a **Save QR** control that downloads the original uploaded file
untouched, so it can be opened in a gallery and scanned by a banking app on the same phone - which is
how people actually pay.

The download goes through the existing short-lived signed URL: the file stays private, and nothing
about who may see it changes.

### After submitting, say what is true and offer the one action that exists

The old line - message the organizer for a refund - invited a conversation about money that VouchPlay
does not process, and it was the wrong first thought after a successful payment.

The state now reads plainly: **Payment submitted. This entry cannot be changed while it is reviewed.**
Under it sit the two things a player can genuinely do:

- **Request to cancel**, with a reason. This does not cancel anything: it records the request against
  the entry and tells the organizer, and the copy says so. A button that pretends to cancel and then
  does not is worse than no button.
- **Change partner**, allowed after payment when the replacement fits the same division: same skill
  band and the same sex classification. The fee, slot and waitlist position are untouched.

**Cancellation requests need no new table.** They are written to `registration_events`, which is
already the immutable per-registration history the organizer reads, with the reason in metadata.
Inventing a table for a note that belongs on a timeline would be the wrong shape.

**On replacing a partner who has already accepted.** §1D forbids a silent swap so that a teammate
cannot be displaced without their knowledge, and that concern is real here. The rule kept is: the
change is allowed, and **the removed partner is always notified**. Displacement without knowledge is
the harm; displacement they are told about is a disagreement between two people, which is theirs to
have. The eligibility constraint is enforced server-side, not merely described, so a player cannot
route around a division's skill or sex rules by swapping partners after paying.

### Cancelling an invitation now says it is working

The Cancel control on an outgoing invitation had no pending state and no confirmation, so it looked
inert and the only way to learn it had worked was to reload. It now disables with a spinner while the
request is in flight and confirms in place when it completes. Same rule as §1N: an action with no
feedback reads as an action that failed.

## 1Z. The organizer's list becomes a list (2026-09-09, post-launch)

The Manage screen expanded every registration inline. On a phone that meant withdrawn entries filling
the page by default, the people in a team buried under their own controls, no way to see the
applicants at a glance, and no way to find the entries that needed a decision. It was a page of
records where an organizer needed a queue of work.

Rebuilt as **rows plus a detail sheet**, the shape a form-response tool uses, on one principle: the
list answers *who is here and what needs me*, the sheet answers *everything about this one entry*.

### The list

- **One row per entry**, showing what an organizer actually scans for: the players by name, the
  division, the amount, and a status chip. Never an id.
- **The whole row is the control.** A small "Manage" link beside a tall row is a smaller target than
  the row itself, which matters most for the people least comfortable with a phone.
- **Closed entries are hidden by default**, behind a checkbox that carries its own count. Withdrawn
  and cancelled entries are history, not work, and they were the single biggest source of noise.
- **Entries needing a decision sort to the top**, newest first within each group, so opening the
  screen lands on work rather than on a chronological archive.
- **Search matches player names**, because "did Maria get in?" is the question an organizer is
  actually asked, and no status filter can answer it.

### Queues, not statuses

The four filter dropdowns were a list of database enums an organizer had to translate into decisions.
They are replaced by four chips that *are* the decisions, each with a live count: **All open**,
**Check payment**, **Cancellations**, **Eligibility**.

- An entry can sit in **more than one queue** - a paid entry whose player has asked to cancel needs
  two decisions - so membership is a set, not a bucket.
- **A closed entry is never in any queue**, whatever else is true of it. A queue that shows resolved
  work is a queue that stops being trusted.
- The status chip is chosen by **what the organizer must do next**, not by the raw column: a
  cancellation request outranks a payment, and a payment outranks anything routine.

### The row carries the flags that change the meaning of an entry

- **Partner not confirmed**, because under pay-first (§1U) an entry can be paid while one named
  player has still not answered, and that is not the same entry as a settled one.
- **Receipt**, so a paid entry is visible before opening it.
- **The eligibility verdict in plain words** when it is anything but eligible, which is the
  skill-match signal at a glance rather than three taps down.

### Cancellation requests are now visible

§1Y let a player ask the organizer to cancel a paid entry and wrote it to `registration_events`, but
nothing surfaced it. The organizer query now reads the newest open request per registration, the row
shows it, the sheet shows the player's reason, and it has its own queue and count. **A request nobody
can find is not a request.**

### Everything lives in one pure module

`lib/tournaments/entry-view.ts` owns queue membership, the status chip, the team label, filtering,
sorting and the counts, with 19 unit tests. The row, the sheet and the queue counts all read from it,
so they cannot disagree about what state an entry is in - which is exactly the class of bug that makes
a dashboard untrustworthy.

## 2A. Changing partner after paying (2026-09-09, post-launch)

**Migration 0027 applied and verified 2026-09-09**: `fits_division_fn=1`, `change_partner_fn=1`,
`invitation_team_id_column=1`, `teams_with_two_members=4`.

### The gap

`replace_pending_partner` (§1U, migration 0025) only ever worked on a seat **already vacated by a
decline**. A player who had paid and simply needed somebody else had no route at all: the seat was
occupied, so every path refused. That is the ordinary case, not the edge case.

### What the swap is allowed to do, and what it must not

`change_partner` removes the other member and names a replacement, in one transaction. Three
constraints define it:

- **The replacement must fit the same division.** `player_fits_division()` checks the sex
  classification and the skill band using the same precedence as everywhere else - community skill if
  known, otherwise self-rating, and an unknown skill never blocks. **This lives in SQL, not only in the
  action**, so a partner swap can never be used to route around a division's own rules.
- **The registration, the payment and the waitlist position are never touched.** Nothing about a
  partner change is a financial event.
- **The removed player is always notified**, and the RPC returns their id specifically so the caller
  cannot forget. §1D forbids displacing somebody *without their knowledge*; being told is precisely
  what makes this permissible rather than a hole in that rule. The notification is **critical**, so it
  cannot be muted.

The organizer's change-lock window still applies: when player changes close, so does this.

### Verified against live data before it shipped

Every column and dependency was checked against production first, and then the gate itself was tested
rather than assumed:

| Case | Result |
| --- | --- |
| Female player in a men's division | rejected |
| Male player in a men's division | accepted |
| Male player in a women's division | rejected |
| Skill 2 in a band of 3-3 | rejected |
| Skill 4 in a band of 3-3 | rejected |

That check exists because migration 0026 shipped `onboarding_completed_at`, a column that did not
exist, and broke the whole doubles path. A migration full of names that merely look right is how that
happens twice.

### The copy now says it, because now it is true

§1Y wrote the sentence promising post-payment partner change and then deliberately pulled it, because
the capability did not exist yet. It is restored alongside the control that implements it. **Copy and
capability ship together or not at all.**

## 2B. A directory you can actually filter, and comments that stand on their own (2026-09-09, post-launch)

Three changes, two of which need no migration and one of which does. They are released in that order.

### Every player shows an STS, including 0.0

`StsChip` returned `null` when `sts` was null, so a player nobody has vouched for yet had a visible
gap where everyone else had a chip. On a card grid and on the compact row that reads as a rendering
fault, not as information, and it made the directory look inconsistent to the one group most likely
to be new: players with no vouches.

**A missing skill profile is not missing data - it is a real, known value.** No vouches means the
community has zero confidence about that player's level, and zero confidence is `0.0`, not blank.
The chip now renders `STS 0.0` in that case, the vouch count stays hidden at zero rather than
printing "0 vouches", and the explainer the chip already opens carries the sentence that makes it
safe: **a low STS does not mean a weak player, usually just fewer vouches so far.**

The DTO is unchanged: `sts` stays `number | null`, because null and zero are genuinely different
facts about the database and only the display collapses them. The detailed card no longer gates the
chip row on `sts != null`.

### The directory filters become the filters people asked for

The panel offered City, Sex, **Minimum self-rated skill**, and four checkboxes. Self-rated skill is
the one number on a VouchPlay profile that nobody else has attested to, so filtering a search by it
inverted the product's entire premise, and the three filters that matter most - what the community
says a player's level is, how confident that is, and which club they play with - were all missing.

**Filters now available:** skill level, minimum STS, city, sex, club, identity verified, coach,
looking for partner, open to sponsorship. The self-rated filter is gone.

**Skill uses the app-wide precedence, not community rating alone.** `player_fits_division()` and
`evaluateSkillFloor` already resolve a player's level as *community skill if the community has rated
them, otherwise their self-rating*, and a filter that departed from that would answer a different
question from the rest of the app. It matters concretely: 140 of the 163 directory profiles have a
community skill level, so a strict community-only filter would make the other 23 invisible the moment
anybody touched the control. The label says "Skill level" and the hint says which rating it used.

**Controls are chosen per data type, not by fashion.**

- **Skill level: tappable band chips**, multi-select. Seven named, ordered, discrete values. A
  two-thumb range slider is the classic choice and it is the wrong one here - dual-thumb sliders are
  poor on touch, poor with a screen reader, and give no name to what you selected. Chips say
  "Novice" and "Low Intermediate" out loud, and tapping two adjacent chips expresses a range anyway.
- **STS: a single-thumb slider**, 0 to 5 in half steps, with a live readout and Any at zero. This
  *is* continuous numeric data with no useful names, which is exactly the case a slider fits, and one
  thumb keeps it keyboard- and screen-reader-safe.
- **Sex: a segmented Any / Male / Female**, not a select. Three options do not need a menu.
- **The four booleans: toggle pills** with a check mark, not checkboxes. A 44px pill is a real touch
  target for an older player on a phone; a default checkbox is roughly 13px. State is carried by the
  mark and the label as well as the fill, never by colour alone.
- **City: a list of the cities that actually have players**, with counts, not a datalist of every
  chartered city in the country. The directory holds 8 distinct city strings that are really 3
  places - `Zamboanga`, `Zamboanga City`, `Zamboanga city`, `zamboanga city`, `zamboanga` and
  `City of Zamboanga` are one city typed six ways. The options are normalised (case-folded, with a
  leading `City of ` or trailing ` City` removed) so those six collapse into one row, and the filter
  still matches with a case-insensitive contains, so every spelling is found.
- **Club: a plain select** of the 7 active clubs.

**Filtering by STS is not ranking by STS.** §8.4 forbids ordering the directory by STS and that has
not changed: the sort is still recent activity with a verified-first tiebreak. A minimum-confidence
filter answers "show me players the community has actually assessed", which is a different question
from "who is best", and the slider's label says so.

**An active filter is always visible and always removable.** The Filters button carries a count, and
each applied filter appears as a chip with its own X. A filter you cannot see is a filter you cannot
undo, and the previous panel hid every setting behind a closed disclosure.

**How the query works, and the scale it assumes.** Role, identity, club, skill and STS all live
outside `profiles`, so each contributes an id set that is intersected before the page query runs.
The skill and STS sets are computed in one pure module from two small cached reads
(`player_skill_profiles`, and `id, self_rated_skill` for the directory), because effective skill is a
per-row fallback that PostgREST cannot express across two tables. At 163 profiles that is trivial and
correct. **It is documented as valid to roughly a thousand players**, past which the id list belongs
in a SQL view or an RPC; the comment in `queries.ts` says so rather than leaving the next person to
discover the ceiling.

All of the parsing, normalising, matching and counting lives in `lib/players/filters.ts` as pure
functions with unit tests, so the URL, the chips, the count on the button and the rows returned
cannot disagree - the same discipline §1Z applied to the organizer's queues.

Old `?minSkill=` links keep working: the value maps onto the new minimum band rather than dropping
a shared search on the floor.

### Comments no longer need a rating attached, and can be edited or deleted

A comment could only be created as a field on the vouch form, which meant the only way to say
something about a player was to also assert a skill level for them - and once said, it was permanent.
There was no edit and no delete anywhere in the product.

- **A comment can stand alone.** `vouch_comments.vouch_id` becomes nullable (migration 0028). When
  the author does happen to have an active vouch for that player the comment is still linked to it,
  so nothing about existing rows or the existing vouch-with-comment path changes.
- **One active comment per author per player, editable.** This mirrors the one-active-vouch rule,
  makes "your comment" unambiguous in the UI, and matches the data exactly: **0 of the 44 active
  comments in production are a second comment from the same author about the same player**, so no
  backfill and no constraint violation is possible. It is enforced in the action rather than by a
  unique index, so a legacy duplicate could never break a deploy.
- **Edit updates the body**; `updated_at` already had a trigger, and an edited comment is labelled as
  edited rather than quietly rewritten under a reader who saw the original.
- **Delete is a soft delete** to `status = 'removed'`, a value the enum has always had. The comment
  leaves every public read immediately, which is what the author asked for, and the row survives for
  moderation - a comment that was reported and then deleted by its author must not vanish from the
  moderation trail.
- **The same gates as vouching**, because a standalone comment is a new way to write on a stranger's
  profile: signed in, target active and onboarded, no block in either direction, the account-status
  check `checkActorCanVouch` that already applies to vouches, no commenting on your own profile, and
  a rolling 24h limit that is a `system_settings` row (`player_comments_per_24h`), never a constant.
- **The target is notified.** `vouch_comment_received` was already in the notification catalog and
  had never been used by anything; its copy said "left a comment with their vouch", which is now
  false half the time, so it reads "commented on your profile".

RLS gains author update and delete policies. The writes go through audited server actions on the
service client, so the policies are defence in depth rather than the mechanism - but a table that can
now be edited should say in its own policies who may edit it.

**Release order.** The STS chip and the filters need no migration and ship first. The comment work is
**migrate-before-deploy**: without 0028 the "Add a comment" button is a visible control that would
throw a not-null violation at a real person, which is exactly the case the v1.22 rule reserves for
migrating first.

## 2C. Three registration bugs found by using it (2026-09-09, post-launch)

Found while Jasper walked the registration flow. Two of them shipped a control that could only fail,
which is worse than a missing feature: a button that does nothing teaches people the app is broken.

### The early-bird window saved, then vanished

Setting the early-bird dates reported success and the fields were empty again after a refresh.

`createTournament` wrote `early_bird_starts_at` and `early_bird_ends_at`; `updateTournament` never
put them in its patch, and the manage page never passed them back into the form's `initial`. Either
one alone produces exactly what Jasper saw. The write was discarded and the read had nothing to show.

There is no clever fix here, only the boring one: the update patch carries the two columns, and the
manage page seeds the two inputs. What is worth keeping is the shape of the bug. **A create path and
an update path that list their columns separately will drift, and the drift is silent** - the form
still submits the field, the action still returns ok, and nothing anywhere reports a problem. It is
the same failure mode as the `onboarding_completed_at` typo in v1.31: the code was confident and
wrong, and only a round trip through the database would have caught it.

### Divisions came back in an order nobody chose

A fresh tournament listed Advanced above Beginner, and the order changed between visits.

Divisions were read with `.order('created_at')`. The fifteen starter divisions are written in ONE
insert, so they share a timestamp to the microsecond - `created_at` is not an order, it is a tie.
Postgres was free to return them however it liked, and did.

**The canonical order is now computed, not stored:** lowest skill band first, and Men, Women, Mixed
inside each band - the order a player reads down a printed entry form, and the same order
`buildDefaultDivisionPreset` already generates. It lives in `packages/core` with 20 unit tests,
including that sorting an already-sorted list changes nothing, because a list that reshuffles on
refresh reads as a bug even when every row in it is correct. An Open bracket with no skill bound
sorts LAST rather than first: an unbounded event is not the easiest one, and putting it at the top
buries the beginner brackets a new player is looking for.

Organizers can also arrange divisions by hand (migration 0029). `display_order` is nullable and is
deliberately NOT backfilled: null means "use the canonical order", so a division added next month
still slots in where it belongs instead of landing at the bottom of a hand-made list. A tournament
carries explicit positions only once someone has actually arranged it.

### A cancelled entry left a team behind, and the team offered a button that could not work

After an entry was cancelled, its division still showed **Register team** - next to "waiting for your
partner to confirm" - and pressing it said "That action failed."

Both halves were true and they contradicted each other. Teams were loaded when their status was
`forming`, `formed` or `locked`; registrations were loaded excluding `withdrawn`, `cancelled` and
`rejected`. `withdrawRegistration` disbands the team it cancels, but the organizer's **reject** path
only released the slot and left the team `formed`. So the entry was gone while the team was still
live, and the division rendered the state for "you have a team but have not entered yet" - a
register button pointed at a team that was already spoken for.

Fixed on both sides, because either alone is insufficient:

- **Write side.** The disband logic moves into one helper used by both the player's cancellation and
  the organizer's rejection, and it now also cancels the team's outstanding invitations - an
  invitation into a closed entry is a decision that no longer exists. The rejection notification is
  sent BEFORE the team is taken apart, because recipients are resolved from its members.
- **Read side.** A team is live unless it HAS registrations and every one of them is closed. This is
  read from the registrations rather than inferred from the team row, so the three teams already
  stranded in production heal on the next page load with no data migration - and any future path
  that forgets to clean up cannot resurrect a dead team.

A team with no registration at all stays live: that is the ordinary doubles case, formed and not yet
entered, and it is the one state the old rule got right.

### Release order

The first two fixes and the read-side repair need no migration and ship together. Migration 0029 is
the organizer's manual ordering; the code that reads `display_order` ships only after it is applied,
since selecting a column that does not exist fails the whole tournament page.

## 2D. A division's own rules become a gate, not a warning (2026-09-09, post-launch)

> **Superseded in part by §2F.** The skill rule below is wrong in one direction: entering a division
> ABOVE your own level is allowed, and the organizer setting this section calls redundant is in fact
> the whole of the skill rule. Everything about sex classification, reach and messaging still holds.

A player could register into a division they did not belong in. The list said **"It targets a higher
skill level than yours. You can still register."** and meant it. Worse, nothing at all checked the
sex classification on the way in: a man could enter Women's Doubles, and ELIG_V1 would flag it for
the organizer to clean up afterwards.

That was a deliberate old choice - decision support, not enforcement - and it does not survive
contact with a real tournament. An organizer who has to undo entries by hand does not have a
registration system, they have a queue of apologies.

### One rule, in three places, saying the same thing

`player_fits_division()` already existed in SQL from migration 0027 and already enforced exactly
this - **but only for changing a partner after payment.** So the app would refuse to *swap* someone
into a division they did not fit, while happily letting them *register* into it. The rule was right
and its reach was wrong.

It now runs on every path that puts a player into a division: naming a partner, inviting one,
entering and paying, replacing a partner who declined, registering a formed team, and entering a
singles division. **A rule enforced on some paths is not a rule.**

- **`packages/core/division-fit.ts`** is the rule, pure and tested (22 tests). It is the TypeScript
  twin of the SQL function, and the two must agree.
- **`checkDivisionFit`** is the server gate. It returns a sentence, not a boolean, because a server
  action that knows exactly what is wrong should not answer "That action failed."
- **The SQL function stays the backstop.** It is what makes the rule true for a request the UI never
  rendered.

This replaces `skillFloorError`, which only ever caught players ABOVE a division's ceiling and only
when the organizer had ticked a box. The new check is a strict superset, so that helper is gone.
**Note for the organizer settings screen: "Only allow players at each division's level or higher" is
now redundant for banded divisions** - the band itself is enforced in both directions. It should be
relabelled or retired rather than left to imply a choice that no longer exists.

### The rules, and the two that read oddly

Sex classification first, then the skill band, and **only one reason is ever reported**. A player
told two things are wrong has two problems to solve; a player told the first thing can act now.

- **An unknown skill never blocks.** A player with no community skill and no self-rating has nothing
  to compare, and refusing them would lock new players out of the tournament they joined for.
- **An unknown gender gets its own message.** Checking the live database first was what made this
  matter: **31 of 198 profiles have no gender recorded.** To all of them, every Men's and Women's
  division would have said "this is for women" - a dead end for someone who simply never filled the
  field in. They now get "add your gender to your profile and this will open up", which is a door.
  This is a third of the user base, so it is the common case, not the edge one.

Zero current B-Steel team members fail their own division under the new rule, checked against live
rows before shipping rather than assumed.

### Saying no before the tap, not after

A refusal that arrives on submit is a worse refusal, so the same rule runs in the UI:

- **The division list** shows the reason **in place of** the register control. The old advisory is
  gone; a division you cannot enter no longer offers a button, because a control that can only fail
  teaches people the app is broken.
- **Partner search** annotates each result. A player who cannot be entered reads as "Can't enter"
  with the reason underneath, instead of being offered and then refused. The reason sits next to the
  person it is about - told only "unavailable", people retype the same name.

The server still refuses on submit. The client copy is the courtesy; it is never the gate.

## 2E. The front door is the tournament list (2026-09-09, post-launch)

Registration for B-Steel Hermosa 2026 is live, and the app link is being handed out to players whose
only reason for opening it is to enter. They were landing on the Home tab - hero, leaderboards,
momentum - and had to find the Tournaments tab themselves. Every tap between the link and the entry
form is a tap some people do not take.

`/` now redirects to `/tournaments`, and the Home surface moves to `/home`.

**Redirect rather than re-render.** Serving the tournament list *at* `/` would have left the nav
highlighting Home while showing tournaments, and given the same page two URLs. Redirecting keeps one
canonical address per surface, and the Tournaments tab lights up on arrival because the URL really is
`/tournaments`. It lives in `next.config.ts` rather than a page component, so it costs no render at
all - nothing in the layout tree runs before the browser is sent on.

**`permanent: false` is deliberate.** A 308 is cached by browsers more or less forever, which is a
poor trade for a default that has an end date. When the tournament is over, delete the rule and point
the Home nav item back at `/`; that is the whole revert.

**Nothing is lost.** Home is unchanged and still its own tab, now at `/home` - the nav item points
there directly rather than bouncing every tap through the redirect. The header logo still points at
`/`, which is what makes "the link of the app" and "the logo" mean the same thing.

Verified in a browser rather than reasoned about: opening `/` lands on `/tournaments` with the
Tournaments tab marked `aria-current="page"`, `/home` renders the hero and leaderboards with the Home
tab current, and a signed-out visitor sees the B-Steel card with its registration-open badge without
signing in.

## 2F. Playing up is allowed - correcting §2D (2026-09-09, post-launch)

**§2D got the skill rule wrong in one direction and this section overrides it.** It read "does not
meet a division rule" as the band being a fence on both sides, so a Low Intermediate player was
refused entry to a High Intermediate division. That is not the rule, and the organizer's own setting
had been saying so in plain words the whole time:

> **Only allow players at each division's level or higher.** Players cannot join a division **below**
> their skill level.

One direction, not two. Entering a harder division is a player choosing a harder game, and nothing
should stand in the way of it.

### The skill rule, complete

- **Above your level: always allowed.** There is deliberately no `minimum_skill` check anywhere. A
  player may enter any division at their level or above, however far above.
- **Below your level: refused, and only when the organizer asks.** The ceiling check is gated on
  `enforce_skill_floor`. With the setting off, skill never blocks at all.
- **Sex classification is unchanged** - a hard rule, governed by no setting.
- An unknown skill still never blocks.

**§2D also claimed the organizer's setting was now redundant. It is not** - it is the entire skill
rule, and that claim was a consequence of the same mistake. The setting stays, means exactly what its
label says, and should not be relabelled or retired.

The reason enum drops `skill_below` entirely and renames `skill_above` to **`skill_too_high`**,
because "above" and "below" were ambiguous about whether they described the player or the division -
which is the confusion that produced the bug. The name now says which.

Migration 0030 makes the SQL twin agree. It only widens what is accepted, so it cannot invalidate an
entry that already exists.

The copy carried a smaller error of the same shipped-and-visible kind: *"is for High Intermediate
players and above. your level is Low Intermediate"* - lowercase after a full stop, because the clause
was built from a possessive that reads correctly mid-sentence and wrong at the start of one.

### A filter for the divisions you can actually enter

Sixteen divisions, of which a given player can enter a handful. **Only show divisions I can join** is
a plain labelled switch under the Divisions header, with the count in its own subtitle - *"6 of 16
match your profile"* - so the control says what it will do before it is touched.

- **Off by default.** A list that silently hides most of itself invites "where did the rest go?"; the
  count advertises the filter well enough without hiding anything first.
- **Shown only when it would hide something.** If a player fits every division, the switch does not
  appear. A control that changes nothing is one more thing to read past.
- Fit is computed once per division and reused for the row's reason, the count and the filter, so the
  three can never disagree.
- When the filter empties the list, it says so and points back at the way out rather than showing an
  empty box.

The browser becomes a Client Component to hold that one piece of state. Every prop it takes was
already serialisable.

## 2G. A provisional entry must never look like a finished one (2026-09-09, post-launch)

Jasper watched real applicants read the app as "I'm in, nothing more to do" when in fact they had not
paid, or their partner had not confirmed, or the organizer had not verified the receipt. The word that
did the damage was **"Registered"**, in green, on a division the viewer had only an unpaid hold in.

The whole point of the pay-first flow (§1U) is that paying is what secures a place. If the app then
tells the applicant they are "Registered" before any of that happens, it removes the very urgency the
flow depends on. Under-communicating here does not just look untidy - it loses the organizer money and
leaves people surprised at the venue.

### What was actually misleading

Three surfaces treated "has an active entry" as "is registered", when the honest fact is that an entry
is only **secured once the organizer confirms it** (which the organizer only does after the payment is
verified and, for doubles, the partner has confirmed):

- **The division browser** printed a green **"Registered"** the moment the viewer held any entry in a
  division, `payment_pending` included, next to the neutral line "You have an entry here."
- **My registrations** showed the raw status ("payment submitted") with no statement of whether the
  slot was actually safe, and no single clear "you are not done yet" notice.
- **The tournament card** showed a green-ticked **"You're joining"** for an unpaid entry, which reads
  as a completed action.

### The rule, stated once

**Only a `confirmed` registration is "secured".** Every other active state - `payment_pending`,
`payment_submitted`, `under_review`, `waitlisted` - is **provisional**, and the applicant's own view of
it must say so plainly and say what is still outstanding. This is now a single pure function,
`lib/tournaments/registration-status.ts` (`describeRegistrationStatus`), unit-tested, so the chip in
the division browser, the notice on the My-registrations card, and the badge on the tournament card
cannot describe the same entry three different ways. It returns the honest short label, the tone
(action / waiting / done), whether the slot is secured, and the outstanding steps in plain language.

### What each surface says now

- **The division browser chip** is the real state, not "Registered": **Payment pending** (amber, when
  a fee is owed), **Under review** (the receipt is in, the organizer has not verified it),
  **Partner not confirmed**, **Waitlisted**, or **Confirmed** (green, and only then). The line beneath
  it names the slot's safety directly - "Your slot is not secured yet" for anything provisional,
  "You're in" only when confirmed.
- **My registrations** leads each provisional entry with an unmissable notice: a heading that says the
  slot is **not secured yet** and a short checklist of what remains - pay and upload the receipt, wait
  for the organizer to verify it, have the partner confirm. The one action the applicant can take
  (pay) is right there in the same card.
- **The tournament card** shows **"You're in"** (green tick) only for a confirmed entry; a provisional
  entry reads **"Not secured yet"** in amber with a clock, never a green tick and never "joining". The
  card learns which entries are confirmed from one extra indexed read on the list page (the ids the
  viewer holds a confirmed registration in), so this needs **no migration**. The public aggregate
  counts ("N interested", "N joining") are left as they are: they are a planning signal about the
  event, not a claim about the viewer, and "joining" honestly describes people in the process of
  joining.

### The capacity question is deliberately NOT changed here, and here is why

Jasper also asked that a provisional entry "not have a reserved slot". Taken as the applicant's
*perception*, that is exactly what this slice delivers: nothing in their view now implies a held or
guaranteed place. Taken as the *capacity mechanic* - stopping `payment_pending` and `payment_submitted`
entries from occupying a slot in the count that drives "Full" and the waitlist - it is a different and
riskier change, and it is **held for an explicit decision** rather than made silently on a live money
path, for three reasons:

1. **§1U deliberately reserves a slot the moment a receipt is submitted**, precisely so a player who
   has *paid* is not punished while waiting for a slow partner or a slow organizer. Un-reserving
   `payment_submitted` would take a slot away from someone who has already paid - the opposite of
   protecting them - and it would reverse a decision Jasper approved days ago.
2. **The hold-expiry / waitlist-promotion cron is still deferred** (see the pilot-prep carry-over), so
   there is no mechanism today that would re-count or promote correctly if unpaid holds stopped
   occupying slots. Changing the count without it would strand the waitlist.
3. It is a **fairness and money change on a live window with 205 registrants mid-flow**, where getting
   it wrong tells a real person their slot is gone.

The safe, useful version - stop counting *unpaid* (`payment_pending`) holds toward capacity while
still protecting *paid* (`payment_submitted`) entries, once hold-expiry exists to release them - is a
focused follow-up to run with Jasper's sign-off, not part of this communication fix. The recommendation
is on record here so the decision is his, not one made by omission.

### No migration

Every fact this needs - registration status, payment status, whether a named partner has confirmed - is
already in the viewer's registration state and, for the card, one extra confirmed-ids read. Nothing in
the schema changes.
## 2H. The rebuild now says why it failed (2026-09-09, post-launch)

The manual "Rebuild all snapshots" started failing with only "The rebuild failed safely. Existing
active snapshots were preserved." - and that was all anyone could learn. The last good publish stuck
at Sep 9, 5:34 PM while every new attempt died in about a second.

### What the investigation could and could not establish

Ruled out from production, without changing anything: it is not the Supabase quota (registrations,
payments, profiles and audit rows all kept writing through the failures), not a settings mistake
(every weight, cap and min-score is a valid number, and the last settings edit predates the last
successful run), not the size bounds (all counts are far under 5,000), not a source-read failure (all
twelve builder reads return 200), not numeric overflow (`score` is `numeric(16,4)`), not duplicate
ranks (ranks are assigned by array index, always unique), and not the code (the builder has not
changed since before the last successful run - only the data has). It fails at the first snapshot
publish, immediately, which is why nothing has published since 5:34 PM.

**What could not be established was the exact cause, and that was the real defect:** the rebuild
caught the database error and threw it away, storing only `error_code = 'BUILD_FAILED'`. This is the
same "a failure that leaves no trace" problem §1O fixed for the nightly cron - never applied to the
manual path - so the one place that knew the reason discarded it.

### What changed

Diagnostic only; no behaviour changes on a successful build, and no migration.

- **`buildAllLeaderboards` now carries the real Postgres reason** in the two places that used to
  discard it: the snapshot-publish throw (`Snapshot publish failed for players/global/month: <message>
  [code] - details (hint)`) and the source-read throw (which now names the failing source index and
  its message). Previously the publish throw kept only the category/scope/period.
- **The rebuild action records and shows the reason.** The caught error's message is written to the
  request row's `error_code` (free text) and to the append-only `audit_logs` as
  `leaderboard.rebuild.failed`, and returned to the Admin screen after the word "Reason:". One
  "Queue and build" now names the exact failing record or constraint instead of a generic message.

The "failed safely" guarantee is unchanged: a failed publish RPC rolls back its own transaction, so
the previously active snapshot stays active. Once the next attempt prints the real cause, the
root-cause fix follows.
## 2I. The rebuild's real bug: a 1,000-row response cap (2026-09-09, post-launch)

Once §2H made the rebuild report its reason, one click named it: **`contribution_source_truncated`**.

### What it actually was

PostgREST returns at most ~1,000 rows per response, and it clamps `.limit()` silently to do it -
proven against production, where a `.limit(5000)` on the active vouches returned
`content-range: 0-999/1475`. The builder read its sources with a single `.limit(bound)` and then
checked "did we get fewer rows than the exact count?", treating any shortfall as corruption and
throwing. That guard was written to catch truncation - and it worked exactly as designed. The moment
**active vouches crossed 1,000** during the day's sign-up surge, `recomputeAllContributions` fetched
1,000 of 1,475, saw 1,000 < 1,475, and threw. It runs first in the rebuild, which is why every
attempt died in about a second, and why the last good publish stayed at 5:34 PM (when active vouches
were still under 1,000). Nothing was wrong with the data or the scores - the reader simply could not
see all its rows.

### The fix

`.limit()` is replaced by **real pagination**. A small helper, `lib/supabase/fetch-all.ts`
(`fetchAllRows`), pages with `.range()` in 1,000-row windows until every row is in hand, and only
flags a genuine overload past the configured cap. It is applied to every read that can outgrow 1,000
rows:

- **`recomputeAllContributions`** - the active-vouches read (the one that failed) and the fraud-flag
  read. The `(voucher_id, target_id)` pair is unique among active vouches, so `created_at` plus that
  pair is a stable total order and pages never skip or repeat. Verified against production: all 1,475
  active vouches come back across two pages, unique pairs equal the count, zero duplicates.
- **`loadSources`** - all twelve builder source reads, each with a stable order. This one had the
  identical latent bug: profiles are already at ~270 and climbing during the event, and the rebuild
  would have failed again the moment that table (or any other) crossed 1,000. Fixing only the vouches
  read would have bought a day.

At today's scale the paginated reads return a single page, so behaviour is identical to before until
a table actually crosses 1,000 - the change is inert now and correct later. No migration.

### The standing lesson

`.limit(n)` in Supabase is not "give me up to n rows" - past ~1,000 it is "give me 1,000, quietly".
Any full-table read that could grow must page with `.range()`, never trust `.limit()`. §2H is what
made this findable in one click instead of a night of guessing; §2H and §2I ship together.
## 2J. A dead team must not block a new one, and the pay step must read as a pay step (2026-09-10, post-launch)

Jasper hit "One of you is already on a team in this division" trying to enter Mixed Doubles Low
Intermediate with a partner whose skill matched, when neither had an active entry there. Alongside it,
a cluster of payment-flow wording and default-fee fixes.

### The bug: the conflict guard counted teams that were already dead

`create_team_with_pending_partner` (and the accept / replace / change RPCs) refused if either player
sat on a team in status `forming/formed/locked` in that division - **without checking whether that
team's registration was still alive**. A team OUTLIVES its entry: withdrawing or rejecting a
registration left the `teams` row `formed`. So a cancelled test from days earlier kept both players
"on a team" forever.

Proven against production before the fix: Jasper and Christine were both still on one `formed` team in
that division whose only registration was `withdrawn`. That single dead row produced the error on
every fresh attempt - which also answers "we cancelled it, why is this happening": cancelling released
the slot but never retired the team.

**Fix (migration 0031).** A team counts as occupied only when it has an active (non-closed)
registration. A new SQL helper, `player_on_active_team_in_division(division, player, exclude_team)`,
encodes that once, and the five guard sites call it: `create_team_with_pending_partner` (both
players), `accept_partner_invitation` (both its checks), `replace_pending_partner`, and
`change_partner`. The closed-status set is the schema's usual `('withdrawn','cancelled','rejected')`.
A bonus: a player who abandoned a failed "Enter and pay" (an orphan team with no registration) is no
longer stuck on it either.

Verified against live data: in Mixed Doubles Low Intermediate both players now read `blocked = false`
(they can enter together), while a division where they hold a `payment_pending` or `payment_submitted`
team still correctly blocks a second entry. `register_team`'s own `already_registered` guard is
per-team and was already correct, so it is untouched.

### How a slot is actually held, before and after payment (answering Jasper's question)

There is one hold timer and three states:

- **Before payment (`payment_pending`).** Registering stamps `slot_hold_expires_at = now +
  `slot_hold_minutes`` (default **30 minutes**, an Admin setting). The capacity count only counts a
  `payment_pending` entry **while that hold is unexpired**. So an unpaid entry holds a real slot for
  30 minutes; after that the slot is countable by someone else. The entry row is not auto-cancelled
  (the hold-expiry cron is still deferred) - it simply stops occupying a slot. This is a soft,
  time-boxed hold.
- **After a receipt is submitted (`payment_submitted` / `under_review`).** The entry counts toward
  capacity **regardless of the timer** - submitting a receipt converts the soft 30-minute hold into a
  firm reservation that does not expire, so a player who has paid is never bumped while the organizer
  reviews (this is the §1U promise).
- **After the organizer verifies (`confirmed`).** The slot is permanent.

`waitlisted` entries never hold a slot; they wait for one to open. So "secured" means confirmed;
everything before it is a hold that is either time-boxed (unpaid) or firm-pending-review (paid).

### The pay step now reads as a step, not a finish line

- **"Enter and pay" loading label** is now **"Proceeding to payment…"**, not "Reserving your slot…":
  the slot is not reserved-for-good, and the honest promise is that we are taking them to pay.
- **The payment card leads with "Next: pay to secure your slot"** and sits in the brand tint, so
  landing on it reads as the next action rather than a receipt.
- **"I'll pay later" is a real, deliberate choice.** A quiet secondary control opens a two-step
  warning - "Your slot is not confirmed until you pay… held for about 30 minutes… come back any time
  from My registrations" - with "Pay now" or "Yes, I'll pay later". Choosing later drops the
  `?entered` focus so the panel collapses; the entry waits untouched in My registrations. Nobody is
  told they are done when they are not.
- **The long-delay-feels-done problem** is addressed by the honest label carrying through the
  transition and by the payment card being the first thing the panel opens onto (it already scrolls
  there via `?entered=…#my-registrations`). A literal payment modal was considered and deferred:
  converting the inline flow to a modal on the live payment path is a larger, riskier change than the
  wording and focus fixes that solve the actual confusion, and the §2G "not secured" notice already
  frames the state.

### New tournaments start priced

Creating a tournament stamped its 15 starter divisions at a **free** fee, so every organizer had to
price fifteen divisions by hand. They now default to a per-player fee from a new Admin setting,
`default_division_fee_amount` (**₱1,000**, per player, editable), and the add-division form defaults a
new division to the same rather than to zero. Operational value, so it lives in `system_settings`, not
in code - and an organizer can still zero or change any division.

### Release order

The partner-conflict fix is **entirely in migration 0031** - the app code for registration does not
change - so the bug persists until Jasper runs it; there is no half-state to guard against. The
payment-flow wording, the "I'll pay later" control and the default-fee setting are app-side and ship
independently (the fee default merges through `system_settings` with no migration).
## 2K. Payment is a modal, and the pay step never looks like a failure (2026-09-10, post-launch)

§2J changed the wording of the pay step but left its shape wrong, and the shape was the real problem.
Jasper described it exactly: tap "Enter and pay", it shows "Proceeding to payment…", then the form
**disappears and the page falls back to the division list as if it had failed**, and only ~5 seconds
later does My registrations scroll into view with the payment details. A player watching that has every
reason to think the attempt broke, or that they are already done.

### Why it looked like a failure

The invite form reset its own state (`setChosen(null)`, cleared the search) the instant the action
returned `ok`, **before** the navigation and server refresh finished. Resetting swapped the
"Proceeding to payment…" card back to the empty partner-search box, so for the several seconds the
refresh took, the player saw a blank form on the division list - a screen that reads as "nothing
happened." The payment lived inline in My registrations, a different place entirely, which only
appeared once the refresh landed.

### The fix: payment is its own centered modal

Payment is the **last step** of registering, so it now gets a focused surface of its own instead of
being poured into a list.

- **A centered payment modal** (`payment-modal.tsx`) holds the amount, the QR, the proof form and the
  "I'll pay later" choice. It uses the shared `Modal`, which portals to `document.body` (§1X), so it
  floats center-screen over whatever opened it and cannot be trapped by a stacking context.
- **"Enter and pay" flows straight into it.** The invite form no longer resets on success - the button
  stays "Proceeding to payment…" through the refresh, and the entry's "Pay now" cell in My
  registrations **auto-opens** the modal the moment the page settles. So the sequence a player sees is
  now: tap → "Proceeding to payment…" (held) → the payment modal appears. No vanished form, no
  fall-back-to-the-list, no five-second void.
- **My registrations shows one control, not a form.** A pending entry now renders a single
  **"Pay now to secure your slot"** button (with the §2G "not secured" checklist above it) instead of
  the whole payment form inline. Tapping it opens the same modal. A receipt already in review keeps
  its inline management (partner change, request to cancel) - only the *unpaid* state moved to the
  modal.
- Submitting a receipt closes the modal and refreshes, so the entry flips to "under review" in the
  list. "I'll pay later" closes the modal; the entry waits with its "Pay now" button, and the honest
  hold warning (§2J) is stated inside the modal before the player leaves.

### Why a modal rather than a page or an inline block

A dedicated payment page would add a navigation the player has to come back from; an inline block is
what caused the "am I done?" confusion in the first place, because it has no edges. A modal has a
clear open and close, keeps the tournament context visible behind it, and - because it is the same
portaled `Modal` the rest of the app uses - it is center-screen and accessible by construction. It
also reinforces the gamified "one last step to lock it in" feel: a focused, single-purpose surface
titled "Pay to secure your slot," entered with a glowing primary button.

No migration. `payment-form.tsx` is removed; its content now lives in the modal.
## 2L. Four UI fixes: the paid card, pagination, the cancel reason, and setting "looking for partner" (2026-09-10, post-launch)

Four unrelated rough edges Jasper found on real screens.

### The paid entry card said "payment submitted" three times and stacked mismatched buttons

A paid, partner-unconfirmed entry showed the state three ways over: the status chip
("Partner not confirmed"), the §2G "not secured" checklist ("wait for the organizer to verify your
payment"), then `PaidEntryActions` ("Payment submitted." + a paragraph repeating the same thing),
then `RegisterActions` again ("Your status: payment submitted" and "This entry can no longer be
changed here"). Two components were both narrating the status, with different fonts, and the two
real actions - Change partner, Request to cancel - were full-width blocks stacked with dead space
between them.

**Fix.** The §2G checklist is the single place that states what is outstanding, so the narration is
removed from the actions: `PaidEntryActions` drops its "Payment submitted." heading and paragraph and
becomes just the two controls. `RegisterActions` no longer renders at all for a paid (submitted)
entry - it only ever repeated the status and a dead-end sentence there - and its "Your status:" line
is gone everywhere, because the chip already says it. Change partner and Request to cancel are now one
matched pair: equal-width buttons side by side, each opening its panel full-width below. To make that
possible without half-width search boxes, `ChangePartnerForm` became a controlled panel owned by
`PaidEntryActions` rather than a self-contained button-plus-panel.

### Pagination: at least three pages, and jump to first / last

The player list is 11 pages, and on a phone the pager showed only "1 2 ›" - you could not see page 3
existed, and reaching the end meant tapping Next ten times. The pager now always shows a window of at
least three numbers around the current page, and adds dedicated **first (`«`) and last (`»`) jump
buttons** at the ends (dimmed on the page you are already on). So any page is at most: first, a short
tap along the window, or last - never a long march.

### The organizer can now read the cancellation reason

The Cancellations queue flagged "Cancellation asked" but never showed WHY - the reason the player
typed was fetched (`cancellationRequest.reason`) and then never rendered. The detail sheet now shows
the request prominently: the reason in the player's words and when it was asked, so the organizer can
act on it instead of guessing or chasing the player.

### "Looking for a partner" is finally settable, and shows on the row

`looking_for_partner` (and `open_for_sponsorship`) were read everywhere - a badge on the profile and
detailed card, and a Players filter (§2B) - but **nothing ever set them**, so the columns were stuck
`false` for everyone and the filter matched nobody. The onboarding / edit-profile form now has two
toggles ("I'm looking for a partner", "Open to sponsorship"), the profile actions write them, and
`getMyProfile` reads them back so the toggles reflect the saved state.

Because it is one column, it **syncs across by construction**: turning it on shows the
"Looking for partner" badge on the profile and the detailed card, marks the player in the Players
filter, and now also shows a compact **partner-search icon on the directory row** (beside the sex
symbol, an icon not a pill, so the one-pill-per-line rule §1H/§1T is untouched). No migration - the
columns already existed; only the write path and the row indicator were missing.
## 2M. "Looking for a partner" as a one-tap call to action (2026-09-10, post-launch)

§2L made the flag settable, but only inside Edit profile - buried under six other fields, nowhere near
the moments a player actually thinks "I need a partner". Jasper asked to surface it as a toggle where
it matters: the Players tab, and the tournament.

### The two moments

- **The Players tab** is where you go to look for people. So it is exactly where you should be able
  to say "and I'm available too". A compact card at the top now shows the signed-in viewer's own
  status with a real switch: **"Looking for a partner? [toggle]"** - on turns the badge on, marks you
  in the filter, and shows the partner-search icon on your row; the helper line says so. It is the one
  self-directed control on a page otherwise about other people, so it is a single small card, not a
  row that competes with the directory.
- **The tournament, at the moment of forming a doubles team.** When a player expands a doubles
  division they do not yet have a team in, the partner-invite step is literally "find your partner".
  The toggle sits at the top of it: **"No partner yet? [toggle] Let others know you're looking."**
  Turning it on there, then and there, is the strongest possible call to action - the player is one
  tap from being findable by everyone else in the same division who is also searching.

### How it works

One shared control, `LookingForPartnerToggle`, backed by one focused server action,
`setLookingForPartner(value)`, that writes only that column, revalidates the directory and the
player's own page, and returns immediately. It is optimistic: the switch moves on tap and settles
when the write returns, so it feels instant. The action reuses the same `looking_for_partner` column
as the Edit-profile toggle and the filter, so **every surface stays in sync by construction** - flip
it in any one place and the badge, the row icon, the filter and the Edit-profile checkbox all agree
on the next read.

The viewer's current value is read where each toggle lives: `getMyProfile` already returns it for the
Players tab, and the tournament's viewer projection (`getViewerRegistrationState`) now selects
`looking_for_partner` alongside the sex and skill it already reads, exposed as
`viewerLookingForPartner`.

### Boundaries

The toggle is the viewer's own status only - it never shows or changes anyone else's. It appears only
for a signed-in player (anonymous visitors see nothing extra). "Open to sponsorship" stays in Edit
profile for now: it is a slower, less frequent decision without a specific in-app moment, so it does
not need a scattered call to action the way partner-finding does. No migration - the column and the
read/badge/filter path already exist; this adds only the inline write.
## 2N. Availability as one compact card: partner and sponsorship together (2026-09-10, post-launch)

§2M put the "looking for a partner" toggle on the Players tab and in the tournament partner step.
Jasper asked to add "open to sponsorship" next to it - without turning the Players screen into a wall
of cards - and to surface both toggles on the tournament page too.

### One card, two thin rows - not two cards

Two full toggles side by side is cramped on a phone, and two separate cards double the vertical space
on a screen that is meant to be a directory. So the two flags share a single **"Let people find
you"** card: a slim row each -  a partner-search icon + "Looking for a partner" + switch, and a
handshake icon + "Open to sponsorship" + switch. It is the same footprint the one-toggle card had,
now carrying both, and it reads as one grouped decision ("how do you want to be found") rather than
two unrelated settings.

### The same card on the tournament page

Opening a tournament is one of the moments a player weighs partnering and being noticed by sponsors,
so the same card now sits on the tournament detail, for a signed-in, onboarded viewer, just below the
header. The per-division partner step keeps its own inline "looking for a partner" toggle (§2M) - that
is the most specific "I need a partner right now" moment - but the tournament-level card is where both
availability choices live together.

### One control, two flags, still all in sync

The toggle is now generic over the flag it writes (`AvailabilityToggle`, `kind: 'partner' | 'sponsor'`),
backed by two focused actions, `setLookingForPartner` and `setOpenForSponsorship`, that share one
private writer. Both write the same columns the badges, the directory filter, the compact-row icon and
the Edit-profile checkboxes already use, so a flip anywhere is consistent everywhere on the next read.
The viewer's current values are read where each card lives: `getMyProfile` on the Players tab, and the
tournament's viewer projection now returns `viewerOpenForSponsorship` and `viewerOnboarded` alongside
`viewerLookingForPartner`, so the card only appears for a viewer who can actually use it.

No migration - both columns and their read paths already exist; this adds the second inline write and
the shared card.

### Trimming the top of the Players screen

The same request extended to the whole top strip: it pushed the player list too far down. The
Community-leaderboards doorway dropped from three stacked text lines (a category label, a headline and
a leader line) with a gradient "hero" treatment to **two lines** with a lighter icon - it is a
doorway, not a display. The availability card lost padding and its header shrank to a single small
label. On a phone the width is the viewport, so the win is vertical: the directory now starts higher
without losing either entry point.
## 2O. Less text, tighter filters, and more organizer control (2026-09-10, post-launch)

A batch of "make the app less texty and the organizer screen more powerful" fixes. All ship together;
none needs a migration. The one big-power item Jasper asked for - organizers registering teams on a
player's behalf - is deliberately held for its own phase (see §2P).

### Copy the screen already explains, removed

- **Tournament interest dialog.** The "Interest by division. Counts are not registrations or reserved
  slots." subtitle is gone - the dialog shows per-division bars under a clear heading, and the counts
  are labelled interest, so the caveat was restating the obvious.
- **Home leaderboard subtitles.** On Home the boards are a highlight, not the full board, and each
  entry already carries its own one-line explanation ("N distinct players supported…"), so the
  category subtitle ("Ranked on vouches given…") is dropped on Home. The `/leaderboards` page keeps
  its subtitles, where they orient someone who came specifically to read the boards.
- **The Community-Champions entry line no longer truncates mid-word.** It read "…88 were newcomers.
  Repeat pair…" because a long third clause hit the line clamp. The stored explanation now ends at
  "…were newcomers.", and the display trims the old trailing clause too, so existing snapshots read
  cleanly before the next rebuild.

### An unvouched player is told, gently, once

A brand-new player with zero vouches has an empty reputation and no reason to know it matters. A slim
amber banner now sits just below the header for a signed-in, onboarded player with no vouches yet:
"Your profile has no vouches yet - ask players you've played with to vouch for you so your skill is
trusted," linking to their profile. It disappears the moment they have a single vouch. It is a quiet
strip, not a modal, because it is a nudge, not an interruption.

### Filters, tighter

The skill chips shrank and the two helper paragraphs ("What the community rates them…", "How confident
the community is…") are gone - a labelled "Skill level" chip set and a "Minimum trust score" slider
are self-explanatory, and the words were pushing the actual controls down the screen.

### The organizer screen is sections you open, and cancel means cancel

- **Every section on Manage is collapsible.** Status and Overview stay open - they are the
  at-a-glance answer to "how is my event doing?" - and Registrations, Export, Divisions, Details,
  Announcements and the rest are collapsed by default, so the page opens as a short menu instead of a
  long scroll. Each remembers nothing; it is just native disclosure.
- **"Show cancelled and withdrawn" now shows only those.** It used to ADD closed entries to the live
  list, which is the opposite of what an organizer wants when they tick it - they want to look at the
  closed ones. Checked, the list is exactly the cancelled and withdrawn entries; unchecked, exactly
  the open ones.
- **Confirming a slot already bypasses payment.** The organizer's Confirm button confirms an entry
  from any pre-terminal state - awaiting payment included - so an organizer can lock in a slot without
  a receipt. The control is now labelled so that is obvious ("Confirm slot"), and its effect is stated
  where it sits.
- **"Cancel registration" shows "Cancelling…"** while it works, like every other action.

### Receipt links in the export, for bank review

The registrations CSV (and the normalized workbook) gain a **Receipt link** column: a signed URL to
each submitted proof, so an organizer can hand the file to whoever does the bank reconciliation
without logging in to review each one. The link is empty when there is no proof. It is a time-boxed
signed URL, never a public path, so a leaked file does not expose the private bucket forever. The
export schema is append-only here: the column is added at the end, existing columns keep their order.

**The validity window is counted from the moment of export, not from receipt upload** - so a
month-long registration is not a problem: each export mints fresh links, and re-downloading refreshes
them. The window defaults to **30 days** (covering a monthly cycle plus a review lag) and is an Admin
setting, `export_receipt_link_days`, capped at 90. It is a genuine trade-off, stated in the setting:
a longer window is more convenient for a slow reviewer, but a leaked export exposes private receipts
for that whole time, so it is bounded rather than unlimited.
## 2P. Phase 16 (planned, not yet built): organizers register teams on a player's behalf

Jasper asked for two organizer powers. One - manually confirming a slot regardless of payment - already
exists and is polished in §2O. The other - an organizer creating a team entry FOR players, who then
just confirm - is real new power that writes registrations and team memberships for other people, so
it gets its own phase rather than a corner of a batch. This section is the design; nothing here is
built yet.

### Why it is a phase, not a quick add

It touches the most sensitive invariant in the product: §1D - nobody is put on a team, or into a paid
entry, without their knowledge. An organizer acting on a player's behalf must not become a way to
enrol someone silently. So the flow needs a real consent step, new server authority, and RLS that lets
an organizer write rows they do not own - none of which should be rushed onto a live registration
window.

### The shape (for review before building)

- **Who/what.** An approved organizer of the tournament picks a division, searches VouchPlay accounts
  for the one or two players, optionally sets each player's club representation, and submits. Players
  must already have an account - the organizer never creates accounts or enters personal data.
- **What it creates.** A team plus a registration in a new status, `organizer_pending_confirmation`
  (or reuse the pending-partner machinery): the entry exists and holds a slot per the normal capacity
  rules, but every named player must confirm they agree to play before it is live. Until all confirm,
  it shows on the organizer's board as "awaiting player confirmation" and on each player's own
  My-registrations as "an organizer entered you - confirm or decline".
- **Consent is the gate (§1D).** Each player gets a critical notification and an explicit
  confirm/decline. Declining never charges them and frees them from the team; it does not silently
  cancel the other player's slot (mirrors the §1U decline carve-out).
- **Payment.** The organizer decides per entry whether it is already settled (they can mark it paid /
  confirm the slot with the §2O power) or whether the players still owe - in which case the normal
  pay-first flow applies once confirmed.
- **Migration + RLS.** A `register_on_behalf` SECURITY DEFINER RPC (organizer-authorized), the new
  status value if used, and audit rows for every on-behalf action. The organizer write is service-role
  inside the audited action, never a direct client write.
- **UI.** A dedicated "Add an entry" flow on Manage - a short wizard (division -> players -> clubs ->
  review) rather than a dense form, because the organizers doing this at a venue are not all
  tech-savvy.

### Recommendation

Build it as Phase 16 after Jasper confirms the consent model above, so the §1D promise is designed in
rather than bolted on. Everything else in this round (§2O) ships now and does not depend on it.

## 2Q. "Hit a snag" / "Something went wrong": deployment skew, and making it self-heal (2026-09-10, post-launch)

Players reported two error screens as *common*: a bare "VouchPlay hit a snag" (no header/nav) and an
in-app "Something went wrong on this page - this can happen after a tab has been idle for a long time."
These are our own Phase 13.5 error boundaries (`global-error.tsx` and `(app)/error.tsx`) firing - two
symptoms of one root cause, not two bugs.

### Root cause: deployment skew, amplified by deploy frequency

Every Vercel deploy ships new **immutable** JS/RSC chunks with new content hashes and a new build id.
A tab a player already has open - and VouchPlay is installed PWA-style, so tabs stay open for days -
is now pointing at chunk URLs that 404. The next tap, or the wake-of-an-idle-tab refresh, fails to
fetch its orphaned chunk and trips the nearest error boundary. The screenshot of the in-app screen is
the **generic** branch, not the auth-stale branch (which reads "Your session needs a refresh"), so it
is a stale-asset failure, not an expired session.

Three things made it frequent and sticky:

1. **No version-skew protection anywhere** - no `deploymentId`, no `ChunkLoadError` handling, no Vercel
   Skew Protection. Confirmed by grep: nothing in source referenced it.
2. **We deploy very often** - the post-launch iteration cadence was dozens of deploys in two days
   (visible as ~7h of Build CPU on the Vercel usage screen). Each deploy orphaned every open tab.
3. **"Try again" could not fix it** - the boundary button called React's `reset()`, which re-renders
   the *same* stale tree; the chunk is still gone, so it failed again. Users got stuck, so it read as
   "common".

Two secondary contributors:

- **The middleware Supabase call was unguarded.** `await supabase.auth.getUser()` in
  `supabase/middleware.ts` had no try/catch, so a transient Supabase failure (free-tier over-quota,
  egress throttle under live load, a network blip) threw *out of middleware* and 500'd the whole
  request into `global-error` - the bare no-chrome screen.
- **Deploy frequency itself**, which the caching work (a separate track) and simple batching reduce.

### The fix (no DB, no RLS, no auth semantics, no vouch/registration logic)

- **`deploymentId: process.env.VERCEL_DEPLOYMENT_ID`** in `next.config.ts`. Next then tags asset/RSC
  requests with the deploy id; on a mismatch it hard-navigates to the *current* build instead of
  silently 404-ing an orphaned chunk. Undefined locally, so a dev no-op. This is the Next-native half
  and does not depend on any dashboard setting (which have historically not persisted here - see
  CLAUDE.md gotchas). The Vercel-side half - **Project -> Settings -> (Advanced) Skew Protection ->
  On** - keeps prior deployments' assets served for a window so most wake-ups resolve with no reload
  at all. Jasper toggles that; the code works with or without it.
- **Self-healing error boundaries.** A new pure classifier `isChunkLoadError()` (unit-tested beside
  `isAuthStaleError`) recognises stale-asset signatures (`ChunkLoadError`, "Loading chunk … failed",
  "Failed to fetch dynamically imported module", etc.). When a boundary catches one it hard-reloads
  **once** - guarded by a `sessionStorage` key scoped to the deploy version, so it can never loop and
  a genuinely-down server still lands on a manual retry. Telemetry is sent first (`keepalive`) so the
  reload does not lose the report. Applied to `global-error.tsx`, `(app)/error.tsx`, and the
  `leaderboards` segment boundary; the "Try again" button also hard-reloads for chunk errors.
- **Crash-guard the middleware.** `getUser()` is wrapped in try/catch: a transient Supabase failure
  now skips the refresh for that request (route guards in pages still enforce auth) instead of 500-ing
  the page. Strictly more robust; no behaviour change on the happy path.

### Honest limits

- This deploy still skews tabs already open on the *previous* build one last time, because the fix is
  not yet in their running client - unavoidable for any first rollout of skew handling. From the next
  deploy on, open tabs self-heal.
- It does not reduce how often we deploy; batching changes and the caching track do that.
- It does not fix genuine Supabase outages - it stops them from taking the whole page down and lets
  the user retry. Free-tier capacity (egress) remains the thing to upgrade.

## 2R. Terms of Service and Privacy Policy, with a blocking acceptance gate (2026-09-10, post-launch)

The app went live and grew to 350+ real players with only **placeholder** /terms and /privacy pages
and **no consent capture anywhere** - no signup checkbox, no acceptance record. Given what VouchPlay
holds (payment proofs with names and bank reference numbers, DOB, city, sex, and vouches people write
about each other), a published Privacy Policy is effectively required under the Philippine Data
Privacy Act (RA 10173), and Terms are what limit JT Consulting & Analytics Inc.'s liability. So this
is overdue rather than early.

### Decisions (confirmed with Jasper)

- **Existing 350+ accept via a blocking gate**, not a soft banner: most defensible, and the acceptance
  is recorded (version + timestamp).
- **We draft the text, Jasper has it reviewed by counsel.** The drafts are solid, plain-language, and
  PH-context, but they are unreviewed - flagged for legal review, and written so a lawyer can edit the
  content components without touching the mechanism.

### The mechanism (additive; no change to vouch/registration/auth semantics)

- **Versioning:** `LEGAL.version` (date-based) in `@vouchplay/config`. `profiles.terms_accepted_version`
  is compared to it; bumping the constant re-prompts everyone on their next visit. `isCurrentLegalVersion()`
  is the pure, unit-tested comparison.
- **Record:** migration 0032 adds `terms_accepted_version` + `terms_accepted_at` to `profiles`
  (nullable, additive, no backfill, no RLS change - the existing self-update policy covers them).
- **Read is fail-open and separate:** `getViewerLegalStatus()` does its OWN small select, deliberately
  NOT folded into `getMyProfile`. If the column is missing (migration not yet applied) it returns
  needsAcceptance=false, so deploying the code before the migration cannot break the profile read or
  bounce all 350 users to onboarding. Once the migration lands, existing players (null version) are
  gated automatically.
- **The gate** (`LegalConsentGate`) overlays everything above the header and bottom nav for a signed-in
  player who has not accepted the current version. The Terms and Privacy text are **embedded and
  scrollable inside the gate** (tabbed), not linked out - which also sidesteps the trap that /terms and
  /privacy live inside the same shell the gate covers. One "I agree" checkbox + "Agree and continue"
  calls `acceptCurrentLegalTerms()`, which stamps the profile and refreshes.
- **New users** get consent at collection: a required checkbox on the signup form (enforced server-side
  only when intent=signup, so login is unaffected), and their acceptance is stamped at onboarding
  completion (tolerant write, so pre-migration it simply no-ops and the gate catches them later).
- **Pages:** /terms and /privacy now render the real documents (shared content components reused by the
  gate), replacing the placeholders.
- **Persistent footer:** a shared `SiteFooter` (About · FAQ · Terms · Privacy + developer credit) is
  rendered once by the app shell on every in-app page, so the legal pages are always reachable, not
  only from the gate and signup. The old per-page footer on Home was removed to avoid duplication;
  Settings already links to both documents.

### Rollout order and honest limits

- Migration 0032 is safe to apply anytime (purely additive); the gate activates once it is applied.
  Follow the project rule and apply it before/around the deploy - the fail-open read means a slip in
  ordering cannot lock anyone out.
- The **text is unreviewed by a lawyer.** It is a strong standard draft, not legal advice; get it
  reviewed and bump `LEGAL.version` when counsel edits it, which re-prompts everyone cleanly.
- Contact currently routes to the real JT Consulting & Analytics Inc. Facebook page. A **dedicated
  privacy/DPO email** should be added (and, depending on volume of sensitive data, consider NPC
  registration and naming a Data Protection Officer) - a legal-review item, not a code blocker.
- A blocking gate is a one-time ~10-second speed bump for the 350 mid-tournament; that is the
  deliberate, defensible trade for a real acceptance record.

## 2S. Live "players online" counter (2026-09-10, post-launch)

Jasper wants a small, readable live counter at the top showing how many players are online and looking
at the app, with the explicit constraint that it must not blow up Supabase/Vercel usage (the project
is on a $20 Vercel budget and a free Supabase near its egress limit).

### Approach chosen: Supabase Realtime Presence, visible-only, opaque key

The browser opens a WebSocket straight to Supabase's Realtime service and joins a presence channel;
the counter is the number of distinct presence keys. Rejected alternatives: a heartbeat/poll through
Next API routes (would add tens of thousands of Vercel function invocations - the meter we are
watching); a heartbeat table read directly (needs a writable table, RLS exposure, and a cleanup cron
for little gain).

### Why this is cheap (the cost answer)

- **Vercel ≈ zero.** The WebSocket is browser↔Supabase; no functions, so no added invocations or
  bandwidth. Nothing about the counter touches a Vercel function.
- **Supabase uses the Realtime service, metered separately from the database egress** that is pushing
  the project toward an upgrade - so it does not worsen that number. Free tier: 200 concurrent
  Realtime connections and 2M messages/month; at this scale (peak tens of concurrent viewers) it sits
  well inside. There are no DB reads/writes, no table, and no egress from the count itself.
- **Connect only while the tab is visible** (connect on visible, drop on hidden/unmount). This keeps
  concurrent connections and message churn minimal, and makes the number honestly mean "people
  looking at the app right now," not "tabs left open for days."

### Honest limits

- If concurrent *visible* tabs ever exceed ~200 (Realtime free-tier connection cap), extra viewers are
  simply not counted - graceful under-count, never an error. Revisit if the app grows a lot.
- If Realtime is disabled/unavailable, the component renders nothing (never "0 online" or an error).
- An Admin flag `online_counter_enabled` (default on) can switch it off instantly with no deploy.

### Privacy

Presence is keyed by an **opaque random per-browser id** stored in localStorage, never the user id,
and the presence payload carries no personal data. Anyone on the channel can read presence state, so
this matters: they can see *how many* are online, never *who*. Multiple tabs in one browser share the
key and count once.

### UX / gamification

A compact pill showing a pulsing green dot + "N online". It appears only once connected with a
count ≥ 1 (so it never reads a lonely/broken "0"), respects reduced-motion (no pulse), and uses
tabular figures so the width does not jump as the number changes. Small but readable, and alive - it
reinforces the "people are here right now" gamified feel.

**Placement (revised).** Rather than sitting inline in the crowded header row, the chip **floats as a
hovering card just below the header, at the right edge of the max-width row - under the notification
bell and profile icon**. It is positioned `absolute` at `top-full` of the header's inner row, so on
wide screens it aligns under those icons (not the far viewport corner) and, because the header is
sticky, it stays glued just beneath it while scrolling. A soft shadow + slight backdrop-blur make it
read as floating above content. Because it now has its own space, the full "online" label shows on
every screen size (it was hidden on mobile when inline).

## 2T. Two polish fixes: translucent online chip, and sponsorship icon on compact cards (2026-09-10)

Two small follow-ups reported by Jasper.

1. **The hovering online chip could sit over page text.** It floats below the header (§2S), so on some
   layouts it can overlap the top-right of the content. Fix: make it **semi-transparent with a frosted
   backdrop-blur** (`bg-surface/70` + `backdrop-blur-md`, lighter shadow) so anything behind it stays
   legible through the glass while the chip's own number stays crisp - it reads as a floating glass
   pill rather than a solid block.

2. **"Open to sponsorship" was missing on the compact player card.** The *detailed* card already shows
   both availability badges (LookingForPartner + OpenForSponsorship), and the DTO/query populate both.
   But the *compact* row only drew the looking-for-partner icon (UserSearch, lime); it had no
   sponsorship marker at all. Fix: add a small **Handshake** icon (primary colour, matching the
   detailed OpenForSponsorship badge) beside it on line one, using the same `open_for_sponsorship`
   flag as the filter, profile badge, and detailed card. Both availability signals now appear in both
   views, consistently coloured (lime = partner, primary = sponsorship).

## 2U. "Already vouched" state: button colour + a clear profile note (2026-09-10)

Nothing told a viewer they had already vouched for someone - the Vouch button looked identical whether
or not they had, and there was no cue about the one-active-vouch rule or the update cooldown. Two
changes, both read-only signals over the existing vouch model (no schema, no change to vouch logic).

### The signal

A player already has at most one ACTIVE vouch per pair (existing rule), and updates are gated by the
`vouch_update_cooldown_days` setting (default 1 day) measured from the vouch's `updated_at`. Two new
read-only helpers surface that to the UI:

- `getViewerVouchedTargetIds(viewerId)` - one indexed query returning the set of target ids the viewer
  has an active vouch for. `listPlayers` calls it once per render and sets `viewerHasVouched` on each
  card DTO, so the directory can colour buttons without an N+1. Service client, filtered to
  `voucher_id = viewerId`, so it only ever returns the viewer's own rows (no voucher-identity leak).
- `getViewerVouchState(targetId, viewerId)` - for the profile: whether the viewer has vouched, and how
  long until they can change it (`canUpdateInMs`, 0 = now), from the same cooldown setting.

### The button (everywhere it appears)

When the viewer has already vouched, the Vouch button switches from the loud primary fill to a calm
**success-tinted outline with a check icon and the label "Vouched"** - it reads as done, not as a
fresh call to action, while staying tappable (tapping still opens the form to change or withdraw, or
routes to the profile from a card). Consistent across compact cards, detailed cards, and the profile.

### The profile note (improved copy)

Below the actions, when the viewer has vouched: a small line with a success check -
"You've vouched for {name}." followed by either "You can change or withdraw it in {N hours/days}."
(during cooldown) or "You can change or withdraw it anytime - just tap Vouched." The remaining time is
a friendly rounded-up phrase from a pure, unit-tested `formatVouchCooldown(ms)` (minutes → hours →
days). This states the one-vouch rule and the cooldown in plain language exactly where the viewer acts.

## 2V. Tapping an already-cast vouch confirms first, instead of reopening the form (2026-09-10)

§2U coloured the button "Vouched" but tapping it still spun a loader and dropped the viewer straight
into the vouch form - confusing for someone who has already vouched. Now a tap on "Vouched" opens a
small confirm dialog (the shared **portaled** Modal, so it escapes a card row's `relative z-10`
stacking context, §1X):

- **Within the update cooldown:** "You've already vouched for {name}. You can change or withdraw your
  vouch in {N hours/days}." with a single "Got it". No form, no navigation.
- **Changeable (cooldown lapsed):** "You've already vouched for {name}. Would you like to change or
  withdraw your vouch?" with "Change my vouch" (opens the form on the profile, or routes to the
  profile with `?intent=vouch` from a card) and "Not now".

The remaining time comes from the same `canUpdateInMs` now threaded to the button on both surfaces
(profile via `getViewerVouchState`, cards via `viewerVouchCanUpdateInMs` from the cooldown map). The
server still authoritatively enforces the cooldown on write, so the dialog is advisory and a slightly
stale value is harmless.

## 2W. "Request to partner" starts the tournament flow, instead of a dead-end tooltip (2026-09-10)

The profile's "Request to partner" opened a small, often-truncated tooltip explaining that partnering
happens inside a tournament - information, not an action. Partnering is genuinely tournament-scoped
(a standalone Partner Finder is still a later phase), so the button now **takes the viewer into that
flow** rather than describing it:

- Clicking it navigates to the **tournaments list** carrying the intended partner (`/tournaments?partner={slug}`;
  anonymous gates to signup and resumes there).
- The tournaments page shows a **contextual banner** - "Partner up with {name}. Pick a tournament
  below, then invite {name} as your partner during registration." - dismissible, and preserved across
  search so it survives filtering. From there the existing per-division registration + partner-invite
  step does the actual pairing.
- Scope note: this is the guided path (land in the flow with context). Auto-preselecting the partner
  inside a specific tournament's registration step is a deeper cross-flow change left for the Partner
  Finder phase; it is not wired here to avoid touching the live registration internals.

## 1. Prompt Contract

### In scope

- Make date of birth optional for public `LEADER_V1` ranking: an unknown DOB no longer excludes a
  public, otherwise eligible player; a supplied DOB below the configured minimum age still excludes
  that player.
- Ship a bounded client-side resume recovery for mobile/browser tabs suspended while unused, without
  background polling or shared-cache bypasses.
- Add a URL-preserved compact Players-directory view that prioritizes quick player recognition,
  labelled skill colour/source, and STS confidence. Detailed cards remain available.
- Normalize every newly uploaded player avatar, club logo, and image payment proof server-side before
  storage. Images must be decoded, auto-oriented, metadata-stripped, dimension-bounded, and emitted
  as adaptive WebP; payment-proof PDFs remain private, validated documents and are not rasterized.
- Clean up a just-uploaded public avatar or club-logo object if its database write fails, and remove a
  superseded generated public image only after its replacement is committed.
- Update the locked handover, execution notes, migration/apply script, and a Phase 14 handover.

### Out of scope

- No age-verification product, account-creation rule, Realtime subscription, polling loop, ranking
  algorithm change, or Most Bidded work.
- No client-side image processing, changes to CSL, STS, vouch weight, Skill Verified, player
  visibility, RLS, anonymous-voucher protections, payment state transitions, payment-proof retention,
  or destructive retroactive rewriting of existing media.

### Success criteria

- A public player with an unknown DOB is eligible when every other `LEADER_V1` condition passes;
  supplied minors remain excluded.
- Existing Supabase settings change through migration 0018, with a copy in `scripts/`, and preserve
  the Admin setting as the operational override after application.
- A hidden tab refreshes once on return after 60 seconds or a persisted page restore; it never polls,
  does not refresh repeatedly on focus, and exposes a polite refresh status.
- `/players?view=compact` is keyboard-accessible, responsive, preserves existing filters/pagination,
  and renders only avatar/name, labelled skill colour/source, STS, and a profile destination.
- Every new avatar, club logo, and image payment proof is stored as a valid, metadata-stripped WebP
  within its bounded output profile. Invalid/deceptive bytes fail safely with actionable form errors;
  a PDF proof remains a validated private PDF.
- Typecheck, lint, tests, formatting, build, migration verification, live deploy, and both-domain
  browser/HTTP checks pass.

### Assumptions and risks

- The current production `leaderboard_exclude_unknown_dob=true` row overrides code defaults, so the
  database change must be applied by Jasper before production behavior changes. The migration is
  intentionally explicit and verifiable.
- Browser suspension is normal mobile-web behavior. The codebase has no `visibilitychange` or
  persisted-page recovery, so stale App Router/auth/network state survives until navigation. The
  recovery refreshes only on resume and leaves cache-first server reads intact.
- Users without DOB can be minors. The requested rule accepts that trade-off; supplied under-age DOB
  remains an exclusion and Admin exclusion/fraud/account/privacy gates remain unchanged.
- Compression is irreversible for newly uploaded images. This is deliberate for public-display media
  and private payment-proof images, where a 2048px, high-quality private derivative retains receipt
  readability. Existing original objects stay untouched; a future retention/backfill decision needs
  its own approved data-migration plan.

## 2. System Architecture and Component Specs

### Eligibility flow

`system_settings.leaderboard_exclude_unknown_dob` defaults to `false`. The pure eligibility function
continues to accept the setting, so Admin can restore conservative unknown-age exclusion when needed.
`0018` updates the existing production setting; the bounded snapshot builder continues to pass the
setting into the pure scorer.

### Resume recovery flow

`PageResumeRefresh` is mounted once in the authenticated/public app shell. A pure predicate receives
timestamps and event facts. On `visibilitychange` to visible, persisted `pageshow`, or reconnect after
at least 60 seconds hidden, it invokes one `router.refresh()` transition. A 15-second dedupe window
prevents overlapping refreshes. It performs no work while hidden and does not keep timers alive.

### Compact directory flow

`view=compact` is a sanitized URL parameter. A small two-option control pushes the current player URL
with the parameter added or removed, retaining filters and pagination. `PlayerCard` gains a compact
variant that uses the existing safe `PlayerCardDTO`-there are no new queries, fields, or client fetches.

### Media-normalization flow

One server-only Sharp utility accepts only PNG/JPEG/WebP sources, verifies that decoded bytes match the
declared MIME type, auto-orients, removes metadata, avoids enlargement, adaptively reduces dimensions
and WebP quality, and rejects output that cannot meet a bounded profile. Profiles are: avatar (512px,
250 KB), club logo (768px, 384 KB), and payment-proof image (2048px, 1.5 MB). Generated `.webp` paths
receive immutable cache headers only for public avatar/logo media; proof images remain in the private
bucket and are available only through the existing authorized signed-URL path. PDFs are signature- and
parse-validated, retained as PDFs, and never converted to images.

## 3. File Action Matrix

- `[NEW] apps/web/src/lib/navigation/resume-refresh.ts`: pure resume/dedupe predicate and tests.
- `[NEW] apps/web/src/components/ui/page-resume-refresh.tsx`: client lifecycle listener and polite
  refresh status.
- `[NEW] apps/web/src/components/players/player-view-toggle.tsx`: accessible view selector with
  navigation feedback.
- `[NEW] supabase/migrations/0018_leaderboard_unknown_dob_optional.sql`: changes the seeded setting
  and returns verification counts.
- `[NEW] scripts/apply-0018.sql`: exact SQL-editor copy.
- `[NEW] docs/PHASE_14_RECRUITMENT_SPONSORSHIP_AND_BIDDING_HANDOVER.md`: next-phase scoped handover.
- `[NEW] apps/web/src/lib/images/normalize-upload-image.ts`: server-only adaptive WebP normalizer and
  constrained profiles for public display media and private image proofs.
- `[NEW] apps/web/src/lib/payments/proof-file.ts`: payment-proof preparation, including image
  normalization and safe PDF validation.
- `[NEW] apps/web/src/lib/images/normalize-upload-image.test.ts` and
  `apps/web/src/lib/payments/proof-file.test.ts`: decode/type, output-size/dimensions, metadata,
  unreadable-input, and PDF coverage.
- `[MODIFY] packages/config/src/settings.ts`: fallback default becomes `false`.
- `[MODIFY] apps/web/src/lib/settings.ts`: unknown-DOB fallback becomes `false`.
- `[MODIFY] packages/core/src/leaderboards/eligibility.test.ts`: fixture coverage for optional DOB
  and supplied-minor safety.
- `[MODIFY] apps/web/src/components/app-shell.tsx`: mounts resume recovery once.
- `[MODIFY] apps/web/src/app/(app)/players/page.tsx`: parses `view`, preserves it in pagination, and
  selects detailed versus compact rendering.
- `[MODIFY] apps/web/src/components/players/player-card.tsx`: compact semantic row variant.
- `[MODIFY] apps/web/src/lib/actions/profile.ts`: normalize avatar uploads, use generated WebP paths,
  expose actionable errors, and clean failed/replaced generated objects safely.
- `[MODIFY] apps/web/src/lib/actions/club.ts`: normalize logo uploads before storage and clean failed
  or superseded generated logo objects without widening public storage access.
- `[MODIFY] apps/web/src/lib/actions/payment.ts`: normalize image proofs, retain validated PDFs, and
  clean only a newly uploaded proof when recording the payment fails.
- `[MODIFY] profile, club, and payment upload forms`: explain optimization without obscuring accepted
  formats, limits, private-proof handling, or submit feedback.
- `[MODIFY] VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md`, `notes.md`, and this plan:
  locked rule, operational diagnosis, release record, and handover links.

## 4. Phased Execution Plan

### Phase 1: Lock rules and migration

- [x] Update §6.1, §8.1, §34A.6, §0Z, and the changelog before implementation.
- [x] Add migration/apply copy and copy-byte verification.
- [x] Change code defaults and pure eligibility fixtures.

### Phase 2: Resume resilience

- [x] Implement the pure 60-second/persisted-page/dedupe decision function and unit tests.
- [x] Mount one lifecycle-aware refresh component in the app shell.
- [ ] Validate simulated browser hidden/resume behavior before release.

### Phase 3: Compact Players UI

- [x] Implement URL-safe view parsing and an accessible detailed/compact selector.
- [x] Render a dense, tappable compact row from the existing safe DTO; preserve detailed cards.
- [ ] Test desktop/mobile, filters, pagination, empty states, keyboard use, dark/light, and reduced
  motion.

### Phase 4: Release and handoff

- [x] Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run format:check`, and
  `npm run build`.
- [x] Commit/push `main`, wait for Vercel Ready, and verify both production domains.
- [ ] Jasper applies `scripts/apply-0018.sql`, returns verification counts, then triggers an Admin
  rebuild or waits for the scheduled snapshot before claiming the optional-DOB ranking change live.

### Phase 5: Image storage efficiency

- [x] Lock the public/private normalization profiles and the non-retroactive data-retention boundary.
- [x] Add shared normalization and payment-proof preparation with server-side tests.
- [x] Route avatar, logo, and payment-proof writes through the prepared output and transactional
  cleanup paths; update form help text.
- [x] Run all repository gates and controlled private/public storage smoke tests.
- [x] Commit/push `main`, wait for Vercel Ready, and verify both production domains.

## 5. Verification and Safety Protocol

- Automated: pure eligibility/resume fixtures; media decode/type/dimension/byte-bound/PDF fixtures;
  full repository gates; `cmp -s` equivalent hash check between migration and apply copy.
- Manual: simulated hidden/resume and BFCache-style page-show browser checks; 390px and desktop player
  directory checks; screen-reader labels and no horizontal overflow; controlled avatar/logo public URL
  and private payment-proof signed-URL checks confirming generated WebP MIME, bounds, and no EXIF.
- Rollback: Admin can set `leaderboard_exclude_unknown_dob=true` and rebuild snapshots immediately;
  the resume component, compact UI, and media pipeline are isolated, reversible source changes. Revert
  the release commit if a client lifecycle regression appears. Existing media remains intact; do not
  bulk-delete or rewrite it as part of rollback.
