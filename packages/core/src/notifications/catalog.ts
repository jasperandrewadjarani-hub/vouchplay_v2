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
  | 'security';

export interface NotificationParams {
  actorName?: string;
  tournamentName?: string;
  divisionName?: string;
  clubName?: string;
  offerTitle?: string;
  reason?: string;
  outcome?: string; // 'approved' | 'rejected' etc.
  extra?: string;
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
  vouch_comment_received: t('vouches', false, (p) => `${who(p)} left a comment with their vouch`),

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
  partner_team_left: t(
    'partners',
    false,
    (p) => `${who(p)} left your team`,
    (p) => `Form a new team for ${tour(p)} if you still want to join.`,
  ),

  // --- Registrations (§27.1 / §27.3) ---
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
};
