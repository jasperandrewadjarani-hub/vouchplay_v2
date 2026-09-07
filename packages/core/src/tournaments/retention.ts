export const ARCHIVABLE_TOURNAMENT_STATUSES = ['draft', 'cancelled', 'completed'] as const;

/** Pure UI/domain guard; the database function independently enforces the same locked states. */
export function canArchiveTournamentStatus(status: string): boolean {
  return (ARCHIVABLE_TOURNAMENT_STATUSES as readonly string[]).includes(status);
}

/** Exact-name confirmation with only accidental outer whitespace ignored. */
export function tournamentArchiveNameMatches(actualName: string, enteredName: string): boolean {
  return enteredName.trim() === actualName;
}
