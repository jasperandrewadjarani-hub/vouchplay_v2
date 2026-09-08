/**
 * Pure lifecycle rules for club offers and their responses (Phase 14A, handover §16). Framework-free
 * so the server actions and UI share one source of truth. Offers never touch scoring/eligibility.
 */

export const CLUB_OFFER_STATUSES = ['draft', 'open', 'closed', 'expired', 'cancelled'] as const;
export type ClubOfferStatus = (typeof CLUB_OFFER_STATUSES)[number];

export const CLUB_OFFER_STATUS_GUIDANCE: Record<ClubOfferStatus, string> = {
  draft: 'Only your club managers can see this. Publish it to make it visible to players.',
  open: 'Visible to players, who can respond until it closes or expires.',
  closed: 'No longer accepting responses. You closed it manually.',
  expired: 'Passed its expiry date and stopped accepting responses automatically.',
  cancelled: 'Withdrawn by the club. It is no longer visible to players.',
};

export function isClubOfferStatus(value: unknown): value is ClubOfferStatus {
  return typeof value === 'string' && (CLUB_OFFER_STATUSES as readonly string[]).includes(value);
}

/**
 * Allowed offer transitions. A draft opens; an open offer closes, is cancelled, or expires. Closed,
 * expired, and cancelled are terminal - an offer is never revived (publish a new one instead).
 */
export function canChangeOfferStatus(current: string, next: string): boolean {
  if (current === next || !isClubOfferStatus(current) || !isClubOfferStatus(next)) return false;
  const allowed: Record<ClubOfferStatus, ClubOfferStatus[]> = {
    draft: ['open', 'cancelled'],
    open: ['closed', 'cancelled', 'expired'],
    closed: [],
    expired: [],
    cancelled: [],
  };
  return allowed[current].includes(next);
}

export const OFFER_RESPONSE_STATUSES = ['submitted', 'accepted', 'declined', 'withdrawn'] as const;
export type OfferResponseStatus = (typeof OFFER_RESPONSE_STATUSES)[number];

export function isOfferResponseStatus(value: unknown): value is OfferResponseStatus {
  return (
    typeof value === 'string' && (OFFER_RESPONSE_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Allowed response transitions. A submitted response is accepted or declined by the club, or withdrawn
 * by the player. Accepted/declined/withdrawn are terminal.
 */
export function canChangeResponseStatus(current: string, next: string): boolean {
  if (current === next || !isOfferResponseStatus(current) || !isOfferResponseStatus(next)) {
    return false;
  }
  const allowed: Record<OfferResponseStatus, OfferResponseStatus[]> = {
    submitted: ['accepted', 'declined', 'withdrawn'],
    accepted: [],
    declined: [],
    withdrawn: [],
  };
  return allowed[current].includes(next);
}

/** An offer is publicly visible only while open and not past its expiry. */
export function isOfferPubliclyVisible(
  status: string,
  expiresAt: string | null,
  now: number = Date.now(),
): boolean {
  if (status !== 'open') return false;
  if (expiresAt == null) return true;
  const t = new Date(expiresAt).getTime();
  return Number.isNaN(t) || t > now;
}
