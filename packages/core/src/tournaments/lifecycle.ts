export const MANAGEABLE_TOURNAMENT_STATUSES = [
  'draft',
  'published',
  'registration_open',
  'registration_closed',
  'locked',
  'live',
  'completed',
  'cancelled',
] as const;

export type ManageableTournamentStatus = (typeof MANAGEABLE_TOURNAMENT_STATUSES)[number];

export const TOURNAMENT_STATUS_GUIDANCE: Record<ManageableTournamentStatus, string> = {
  draft: 'Visible only to organizers and staff. Player registration is unavailable.',
  published: 'Visible to players, but registration is not open yet.',
  registration_open: 'Players can register in divisions that are also set to Open.',
  registration_closed:
    'New registrations stop; organizers can continue reviewing existing entries.',
  locked: 'Team, club, and division changes are frozen except for organizer overrides.',
  live: 'Shows players that the tournament is currently underway.',
  completed: 'The event is finished; results and achievements can be finalized.',
  cancelled: 'Registration is closed and existing participants are notified of the cancellation.',
};

export function isManageableTournamentStatus(value: unknown): value is ManageableTournamentStatus {
  return (
    typeof value === 'string' &&
    (MANAGEABLE_TOURNAMENT_STATUSES as readonly string[]).includes(value)
  );
}

/** Any non-archived state may move to any other non-archived state (§17.2). */
export function canChangeTournamentStatus(current: string, next: string): boolean {
  return (
    current !== next && isManageableTournamentStatus(current) && isManageableTournamentStatus(next)
  );
}
