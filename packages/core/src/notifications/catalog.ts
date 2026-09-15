/**
 * Notification catalog (handover §27) - the single source of truth for notification COPY, the
 * category each type belongs to (for preferences), and whether a type is CRITICAL (critical types
 * cannot be muted and are eligible for the email channel, §27.5). Pure + deterministic so copy is
 * reviewable and testable. Deep-link routes are supplied by the caller (they depend on slugs/ids);
 * the catalog only builds the title/body from a small params bag.
 */

export type NotificationCategory =
  | 'vouches'
  | 'partners'
  | 'registrations'
  | 'payments'
  | 'eligibility'
  | 'tournaments'
  | 'clubs'
  | 'leaderboards'
  | 'roles'
  | 'moderation'
  | 'security'
  | 'badges';

export interface NotificationParams {
  actorName?: string;
  tournamentName?: string;
  divisionName?: string;
  clubName?: string;
  offerTitle?: string;
  reason?: string;
  outcome?: string; // 'approved' | 'rejected' etc.
  extra?: string;
  /**
   * §2AO A - tournament slots. Preformatted (e.g. `formatFee('PHP', 1500)` -> "PHP 1,500"), NOT a
   * bare number: this catalog is pure copy and has no business deciding currency formatting.
   */
  amount?: string;
  /** Currency code (e.g. "PHP"), for a caller that wants to compose its own amount string. */
  currency?: string;
  /** Preformatted deadline (e.g. "Sep 20, 2026") - the early-bird cutoff, when one applies. */
  deadline?: string;
  /**
   * §2AS C - disambiguates which cutoff `deadline` refers to for a copy that reads differently for
   * each (organizer_payment_nudge): true for the early-bird cutoff, false/absent for the registration
   * close date. Mirrors the existing `quoteSlotPrice(divisions, earlyBird, at?)` boolean convention.
   */
  earlyBird?: boolean;
}

export interface NotificationTypeDef {
  category: NotificationCategory;
  critical: boolean;
  title: (p: NotificationParams) => string;
  body: (p: NotificationParams) => string | undefined;
}

const t = (
  category: NotificationCategory,
  critical: boolean,
  title: (p: NotificationParams) => string,
  body?: (p: NotificationParams) => string | undefined,
): NotificationTypeDef => ({ category, critical, title, body: body ?? (() => undefined) });

const who = (p: NotificationParams) => p.actorName ?? 'Someone';
const tour = (p: NotificationParams) => p.tournamentName ?? 'a tournament';
const when = (p: NotificationParams) => p.deadline ?? 'the deadline';

export const NOTIFICATION_CATALOG: Record<string, NotificationTypeDef> = {
  // --- Vouches (§27.1) ---
  vouch_received: t(
    'vouches',
    false,
    (p) => `${who(p)} vouched for you`,
    () => 'Tap to view your profile.',
  ),
  vouch_request_received: t(
    'vouches',
    false,
    (p) => `${who(p)} asked you to vouch`,
    (p) => p.reason,
  ),
  // A comment no longer has to arrive attached to a rating (master_plan §2B), so the copy can no
  // longer say "with their vouch" - it would be false half the time.
  vouch_comment_received: t(
    'vouches',
    false,
    (p) => `${who(p)} commented on your profile`,
    () => 'Tap to read it.',
  ),

  // --- Partners (§27.1) ---
  partner_invite_received: t(
    'partners',
    false,
    (p) => `${who(p)} invited you as a partner`,
    (p) => `For ${p.divisionName ?? 'a division'} in ${tour(p)}.`,
  ),
  partner_accepted: t(
    'partners',
    false,
    (p) => `${who(p)} accepted your partner invite`,
    (p) => `Your team is formed for ${tour(p)}.`,
  ),
  // A partner was named on a PAID entry, so this is not a casual invite: the fee is already in,
  // and until they answer they cannot enter that division with anybody else (master_plan §1U).
  // Critical: it is money-adjacent and it blocks the recipient, so it must not be mutable.
  partner_named_paid: t(
    'partners',
    true,
    (p) => `${who(p)} entered you as their partner`,
    (p) =>
      `They have already paid for ${p.divisionName ?? 'your division'} in ${tour(p)}. Confirm or decline - either is free.`,
  ),
  partner_declined: t(
    'partners',
    true,
    (p) => `${who(p)} cannot partner with you`,
    (p) => `Your slot and payment for ${tour(p)} are safe. You can name someone else.`,
  ),
  partner_confirmed_paid: t(
    'partners',
    false,
    (p) => `${who(p)} confirmed as your partner`,
    (p) => `Your team is complete for ${tour(p)}.`,
  ),
  // Critical: being taken off a team is not something a person should be able to mute or miss.
  // §1D forbids displacing somebody WITHOUT THEIR KNOWLEDGE - this notification is what makes the
  // swap permissible at all (master_plan §2A).
  partner_removed: t(
    'partners',
    true,
    (p) => `${who(p)} changed partner`,
    (p) =>
      `You are no longer on their team for ${tour(p)}. You are free to enter with someone else.`,
  ),
  partner_team_left: t(
    'partners',
    false,
    (p) => `${who(p)} left your team`,
    (p) => `Form a new team for ${tour(p)} if you still want to join.`,
  ),

  // --- Partner release / lock-in (§2AM decision 4, 5) ---
  // Critical: it blocks the recipient's team (no invites/swaps until they answer) and asks them to
  // approve giving up money-adjacent standing on a paid entry, same category as partner_named_paid.
  partner_release_requested: t(
    'partners',
    true,
    (p) => `${who(p)} asked to change partners`,
    (p) => `Approve to free the seat for ${tour(p)}. The entry and payment stay with the team.`,
  ),
  partner_release_accepted: t(
    'partners',
    false,
    (p) => `${who(p)} agreed to leave the team`,
    (p) => `The seat is open - choose a new partner for ${tour(p)} before the partner lock-in.`,
  ),
  partner_release_declined: t(
    'partners',
    false,
    (p) => `${who(p)} kept the team as it is`,
    (p) => `Your partner change request for ${tour(p)} was declined.`,
  ),
  partner_invite_withdrawn: t(
    'partners',
    false,
    (p) => `${who(p)} withdrew their partner invite`,
    (p) => `You are no longer named on their entry for ${tour(p)}.`,
  ),
  // §2AP C4: a confirmed entry that becomes partial (an accepted release detaches the seat) is not
  // downgraded (§2AM) - but the remaining player is now the one holding a paid entry with an empty
  // seat, and the next partner they name arrives owing money. Critical for the same reason as
  // partner_named_paid: it is money-adjacent and blocks nothing but should not be missed.
  partner_left_pay_pending: t(
    'partners',
    true,
    (p) => `${who(p)} left your team for ${tour(p)} - the new partner will need to pay their slot`,
  ),

  // --- Partner matchmaking / "swipe to partner" (§2AV F, G) ---
  // Critical: a mutual match is the moment the door (invite or "enter together") opens, and it is
  // the only signal telling either side to act before the other loses interest.
  partner_match: t(
    'partners',
    true,
    (p) => `You matched with ${who(p)}`,
    (p) => `For ${p.divisionName ?? 'doubles'} at ${tour(p)}. Tap to team up.`,
  ),
  // Non-critical: a nudge, not a blocker - the match still stands either way, so it is fine to mute.
  partner_match_reminder: t(
    'partners',
    false,
    (p) => `Still want to team up with ${who(p)}?`,
    (p) => `Your match for ${tour(p)} hasn't become an entry yet. Tap to finish it.`,
  ),
  // Critical: sent once at registration lock minus 3 days - the last practical chance to act before
  // the match cannot become an entry at all, same time-boxed reasoning as partner_lock_soon.
  partner_match_lock_reminder: t(
    'partners',
    true,
    (p) => `Partner lock-in is near for ${tour(p)}`,
    (p) => `You and ${who(p)} matched but aren't entered yet. Enter before registration locks.`,
  ),
  // Non-critical: the daily "new candidates" digest for an open search - informational, mutable.
  partner_search_new_candidates: t(
    'partners',
    false,
    (p) => `New players are looking for a partner at ${tour(p)}`,
    () => "Open your deck to see who's new.",
  ),

  // --- Registrations (§27.1 / §27.3) ---
  // Critical: a player has asked to undo a payment that reached the organizer directly, so it must
  // not be mutable and must be able to reach them by email (master_plan §1Y).
  registration_cancellation_requested: t(
    'registrations',
    true,
    (p) => `${who(p)} asked to cancel their entry`,
    (p) => `${tour(p)}. Reason: ${p.reason ?? 'not given'}`,
  ),

  registration_submitted: t(
    'registrations',
    false,
    (p) => `New registration in ${tour(p)}`,
    (p) => (p.divisionName ? `Division: ${p.divisionName}.` : undefined),
  ),
  registration_confirmed: t(
    'registrations',
    true,
    (p) => `You're confirmed for ${tour(p)}`,
    (p) => (p.divisionName ? `Division: ${p.divisionName}.` : undefined),
  ),
  registration_rejected: t(
    'registrations',
    true,
    (p) => `Registration not accepted for ${tour(p)}`,
    (p) => p.reason,
  ),
  registration_waitlisted: t(
    'registrations',
    false,
    (p) => `You're on the waitlist for ${tour(p)}`,
    (p) => (p.divisionName ? `Division: ${p.divisionName}.` : undefined),
  ),
  registration_promoted: t(
    'registrations',
    true,
    (p) => `A waitlist spot opened up in ${tour(p)}`,
    () => 'Complete the next steps before the hold expires.',
  ),
  team_withdrawn: t(
    'registrations',
    false,
    (p) => `A team withdrew from ${tour(p)}`,
    (p) => (p.divisionName ? `Division: ${p.divisionName}.` : undefined),
  ),

  // --- Payments (§27.1 / §27.3) ---
  payment_submitted: t(
    'payments',
    false,
    (p) => `Payment proof submitted in ${tour(p)}`,
    () => 'Review it in the registrations dashboard.',
  ),
  payment_verified: t('payments', true, (p) => `Your payment was verified for ${tour(p)}`),
  payment_rejected: t(
    'payments',
    true,
    (p) => `Your payment needs another look for ${tour(p)}`,
    (p) => p.reason,
  ),

  // --- Tournament slots (§2AO A) - the seat is its own unit of payment, separate from the team
  // receipt above. Critical where money or a hold is on the line, same reasoning as partner_named_paid.
  seat_payment_due: t(
    'payments',
    true,
    (p) => `Your seat for ${tour(p)} needs payment`,
    (p) => {
      const amount = p.amount ?? 'the seat fee';
      const deadline = p.deadline ? ` Pay by ${p.deadline} for the early-bird price.` : '';
      return `Pay ${amount} to hold your seat.${deadline}`;
    },
  ),
  seat_payment_verified: t(
    'payments',
    false,
    (p) => `Your seat payment for ${tour(p)} was verified`,
  ),
  slot_reservation_verified: t(
    'payments',
    true,
    (p) => `Your reserved slot for ${tour(p)} is verified - choose your division`,
    () => 'Open the registration wizard to pick your division.',
  ),
  slot_reservation_rejected: t(
    'payments',
    true,
    (p) => `Your slot receipt for ${tour(p)} was declined`,
    (p) => p.reason,
  ),
  // §2AP C5: the leaving player's own seat detaches silently otherwise - this is what tells them it
  // is theirs to reuse. Non-critical: nothing is blocked and nothing needs urgent action.
  slot_released: t(
    'payments',
    false,
    (p) => `Your slot for ${tour(p)} is free to use again`,
    () => 'Choose a division any time before registration closes.',
  ),

  // --- Eligibility (§27.1 / §27.3) ---
  eligibility_reclassified: t(
    'eligibility',
    false,
    (p) => `Your team was moved to another division in ${tour(p)}`,
    (p) => (p.divisionName ? `Now: ${p.divisionName}.` : undefined),
  ),
  eligibility_review_required: t(
    'eligibility',
    false,
    (p) => `A registration needs an eligibility review in ${tour(p)}`,
    (p) => (p.divisionName ? `Division: ${p.divisionName}.` : undefined),
  ),

  // --- Tournaments (§27.1) ---
  tournament_announcement: t(
    'tournaments',
    false,
    (p) =>
      p.extra ? `${p.tournamentName ?? 'Tournament'}: ${p.extra}` : `Announcement from ${tour(p)}`,
    (p) => p.reason,
  ),
  tournament_cancelled: t(
    'tournaments',
    false,
    (p) => `${tour(p)} was cancelled`,
    (p) => p.reason,
  ),

  // --- Clubs (§27.1 / §27.2) ---
  club_join_request: t(
    'clubs',
    false,
    (p) => `${who(p)} asked to join ${p.clubName ?? 'your club'}`,
  ),
  club_join_accepted: t(
    'clubs',
    false,
    (p) => `You're now a member of ${p.clubName ?? 'the club'}`,
  ),
  club_join_rejected: t(
    'clubs',
    false,
    (p) => `Your request to join ${p.clubName ?? 'the club'} wasn't accepted`,
  ),

  // --- Club offers / recruitment (§16, Phase 14A) ---
  offer_response_received: t(
    'clubs',
    false,
    (p) => `${who(p)} responded to ${p.offerTitle ?? 'your offer'}`,
    (p) => (p.clubName ? `For ${p.clubName}.` : undefined),
  ),
  offer_response_accepted: t(
    'clubs',
    false,
    (p) => `${p.clubName ?? 'A club'} accepted your response`,
    (p) => (p.offerTitle ? `For ${p.offerTitle}.` : undefined),
  ),
  offer_response_declined: t(
    'clubs',
    false,
    (p) => `${p.clubName ?? 'A club'} responded to your interest`,
    (p) => (p.offerTitle ? `For ${p.offerTitle}.` : undefined),
  ),

  // --- Achievements (§9.4, §27.1) ---
  achievement_awarded: t(
    'tournaments',
    false,
    (p) =>
      `You earned ${p.extra ?? 'an achievement'}${p.tournamentName ? ` at ${p.tournamentName}` : ''}`,
    () => 'It now shows on your profile.',
  ),
  achievement_nominated: t(
    'tournaments',
    false,
    (p) => `${who(p)} added an achievement for you`,
    (p) =>
      p.extra
        ? `"${p.extra}". Confirm it to show it on your profile.`
        : 'Confirm it to show it on your profile.',
  ),
  achievement_nomination_confirmed: t(
    'tournaments',
    false,
    (p) => `${who(p)} confirmed the achievement you added`,
    () => 'It now shows on their profile.',
  ),

  // --- Roles (§27.1) ---
  organizer_application_result: t(
    'roles',
    false,
    (p) => `Your organizer application was ${p.outcome ?? 'reviewed'}`,
    (p) => p.reason,
  ),
  coach_application_result: t(
    'roles',
    true,
    (p) => `Your coach application was ${p.outcome ?? 'reviewed'}`,
    (p) => p.reason,
  ),
  coach_information_requested: t(
    'roles',
    true,
    () => 'More information is needed for your Coach application',
    (p) => p.reason,
  ),
  coach_role_revoked: t(
    'roles',
    true,
    () => 'Your Coach role was revoked',
    (p) => p.reason,
  ),
  leaderboard_milestone: t(
    'leaderboards',
    false,
    (p) => p.outcome ?? 'You reached a leaderboard milestone',
    (p) => p.extra,
  ),

  // --- Moderation + security (§27.1) - CRITICAL: cannot be muted, email-eligible ---
  moderation_action: t(
    'moderation',
    true,
    (p) => `An action was taken on your account`,
    (p) => p.reason,
  ),
  account_security: t(
    'security',
    true,
    (p) => `Security update on your account`,
    (p) => p.reason,
  ),

  // --- Reminders cron + organizer assign-partner (§2AQ A1/A2/A3) - all critical: money-adjacent or
  // time-boxed action, and Hermosa's reminders must reach email as well as in-app (§27.5). ---
  early_bird_ending: t(
    'payments',
    true,
    (p) => `Early bird for ${tour(p)} ends soon`,
    (p) => `Pay by ${when(p)} to keep the early-bird price.`,
  ),
  registration_closing_unpaid: t(
    'payments',
    true,
    (p) => `Registration for ${tour(p)} closes soon - your slot is not paid`,
  ),
  registration_closing_choose_division: t(
    'registrations',
    true,
    (p) => `Choose your division for ${tour(p)} before ${when(p)}`,
  ),
  partner_lock_soon: t(
    'partners',
    true,
    (p) => `Partner lock-in for ${tour(p)} is ${when(p)} - your seat is still open`,
  ),
  // §2AQ A2: the paying player's "Remind {name}" button on My registrations, throttled to once/24h
  // by the caller (this catalog only owns the copy).
  seat_payment_reminder: t(
    'payments',
    true,
    (p) => `${who(p)} is waiting for you to pay your slot for ${tour(p)}`,
  ),
  // §2AQ A3: organizer_assign_partner seats a player immediately (no invite to accept) - both players
  // must still be told, and the reason the organizer gave belongs in the body when there is one.
  partner_assigned: t(
    'partners',
    true,
    (p) => `The organizer assigned ${who(p)} as your partner for ${tour(p)}`,
    (p) => p.reason,
  ),

  // --- §2AS C/F - organizer pay-nudge blast + cancel-my-reservation ---
  // Critical: it is the organizer's direct "pay now or lose your slot" blast, same money-adjacent
  // reasoning as seat_payment_due/early_bird_ending - must not be mutable and must reach email.
  organizer_payment_nudge: t(
    'payments',
    true,
    (p) => `${tour(p)}: pay now to secure your slot`,
    (p) => {
      const base = 'Your slot is not secured until you pay.';
      if (!p.deadline) return base;
      const suffix = p.earlyBird
        ? `Early bird ends ${when(p)}.`
        : `Registration closes ${when(p)}.`;
      return `${base} ${suffix}`;
    },
  ),
  // §2AS F: a bare-slot cancellation request goes to the organizer - not money-adjacent for the
  // organizer themselves and not time-boxed, so this one is fine to mute.
  slot_cancel_requested: t(
    'registrations',
    false,
    (p) => `${who(p)} asked to cancel their reserved slot for ${tour(p)}`,
  ),
  // Critical: this is the "Keep" outcome telling a player their paid slot stays despite their
  // cancellation request - money-adjacent and must not be missed, same as slot_reservation_rejected.
  slot_cancel_declined: t(
    'payments',
    true,
    (p) => `Your reserved slot for ${tour(p)} stays - the organizer kept it`,
    () => 'Your cancellation request was not accepted.',
  ),

  // --- §2AT - solo-entry partner merge, cancellation requests (tag/withdraw/approve) ---
  // Critical: the accepting player's own paid entry just disappeared into someone else's team - not
  // something to miss, same reasoning as partner_named_paid/partner_removed.
  entry_merged: t(
    'partners',
    true,
    (p) => `Your entry for ${tour(p)} was folded into ${who(p)}'s team - you're partners now`,
  ),
  // Non-critical: nothing is blocked and nothing needs urgent action - it is just the organizer being
  // told a request they had not yet acted on no longer stands.
  cancellation_withdrawn: t(
    'registrations',
    false,
    (p) => `${who(p)} withdrew their cancellation request for ${tour(p)}`,
  ),
  // Critical: this is the money-settling outcome of a cancellation request - must not be muted or
  // missed, same reasoning as registration_rejected/payment_rejected.
  cancellation_approved: t(
    'registrations',
    true,
    (p) => `Your entry for ${tour(p)} is cancelled - any refund is settled with the organizer`,
  ),
  // Critical: tells the player their entry (and their money) stands despite asking to cancel it.
  cancellation_declined: t(
    'registrations',
    true,
    (p) => `Your cancellation request for ${tour(p)} was declined - your entry stands`,
  ),
  // Critical: the money-settling outcome of a reserved-slot cancellation request, same reasoning as
  // cancellation_approved above.
  slot_cancel_approved: t(
    'payments',
    true,
    (p) =>
      `Your reserved slot for ${tour(p)} is cancelled - any refund is settled with the organizer`,
  ),

  // --- §2AU E - guest entry: "finish setting up your account" reminders (6h and 48h after
  // `guest_created_at`, while still un-onboarded with a live entry). Two distinct types share
  // identical copy - only their existence keys differ - so the reminders cron can send each once
  // without a new table. Critical: an unverified guest entry is one missed email away from lapsing
  // like any unpaid/unclaimed entry, and this is the player's only way back into it (§2AU C/E).
  guest_verify_reminder: t(
    'registrations',
    true,
    (p) => `Finish setting up your VouchPlay account to keep your entry for ${tour(p)}`,
    () => 'Enter the code from your email or sign in with this address.',
  ),
  guest_verify_reminder_2: t(
    'registrations',
    true,
    (p) => `Finish setting up your VouchPlay account to keep your entry for ${tour(p)}`,
    () => 'Enter the code from your email or sign in with this address.',
  ),

  // --- §2BE B/C - organizer powers: every decision retractable, add-entry (2026-09-14) ---
  // Critical: the organizer explicitly reversed a confirmation the player may already be relying on -
  // same money-adjacent reasoning as registration_rejected/payment_rejected, must not be missed.
  registration_reverted: t(
    'registrations',
    true,
    () => 'Your entry was moved back to review',
    (p) =>
      `${who(p)} moved your ${p.divisionName ?? 'entry'} entry back to review${p.reason ? `: ${p.reason}` : '.'}`,
  ),
  // Critical: the entry (and any money on it) is live again after having been closed - the player
  // must know, same reasoning as registration_restored's sibling notifications above.
  registration_restored: t(
    'registrations',
    true,
    (p) => `Your ${p.divisionName ?? 'tournament'} entry was restored by the organizer`,
  ),
  // Critical: the player is now entered (and possibly paying) in a tournament without having taken
  // any action themselves - they must be told plainly, with a way to undo it, same reasoning as
  // partner_named_paid/organizer_assign_partner's partner_assigned.
  organizer_entered_you: t(
    'registrations',
    true,
    (p) => `You've been entered in ${tour(p)}`,
    (p) =>
      `${who(p)} entered you in ${p.divisionName ?? 'a division'}${p.extra ? ` with ${p.extra}` : ''}. Not right? Ask the organizer or request a cancellation from My registrations.`,
  ),

  // --- Badges (master_plan §2BK) - non-critical, mutable. Only the FIRST award of a key notifies;
  // recomputations and expiries are silent (§2BK "Loose ends"). Revoke is in-app only (no push) - the
  // push channel is decided by the caller (`lib/badges/compute.ts` / `lib/actions/badges.ts`), not by
  // this catalog, since criticality alone does not model it here.
  badge_earned: t(
    'badges',
    false,
    (p) => `You earned ${p.extra ?? 'a badge'}`,
    () => 'It now shows on your badge case.',
  ),
  badge_granted: t(
    'badges',
    false,
    (p) => `You were awarded ${p.extra ?? 'a badge'}`,
    (p) => p.reason ?? 'It now shows on your badge case.',
  ),
  badge_revoked: t(
    'badges',
    false,
    (p) => `${p.extra ?? 'A badge'} was removed from your profile`,
    (p) => p.reason ?? undefined,
  ),
};

export function notificationDef(type: string): NotificationTypeDef | undefined {
  return NOTIFICATION_CATALOG[type];
}

/** Categories a user may mute (everything except critical categories). */
export const MUTABLE_CATEGORIES: NotificationCategory[] = Array.from(
  new Set(
    Object.values(NOTIFICATION_CATALOG)
      .filter((d) => !d.critical)
      .map((d) => d.category),
  ),
);

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  vouches: 'Vouches',
  partners: 'Partner invites',
  registrations: 'Registrations',
  payments: 'Payments',
  eligibility: 'Eligibility',
  tournaments: 'Tournament updates',
  clubs: 'Clubs',
  leaderboards: 'Leaderboards',
  roles: 'Role applications',
  moderation: 'Moderation',
  security: 'Account & security',
  badges: 'Badges',
};
