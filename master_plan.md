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
