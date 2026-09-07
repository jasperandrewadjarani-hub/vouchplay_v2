import { describe, expect, it } from 'vitest';
import { canArchiveTournamentStatus, tournamentArchiveNameMatches } from './retention';

describe('tournament retention guards', () => {
  it('allows archive only from safe inactive states', () => {
    expect(canArchiveTournamentStatus('draft')).toBe(true);
    expect(canArchiveTournamentStatus('cancelled')).toBe(true);
    expect(canArchiveTournamentStatus('completed')).toBe(true);
    expect(canArchiveTournamentStatus('registration_open')).toBe(false);
    expect(canArchiveTournamentStatus('live')).toBe(false);
    expect(canArchiveTournamentStatus('archived')).toBe(false);
  });

  it('requires the exact tournament name', () => {
    expect(tournamentArchiveNameMatches('Hermosa Cup', ' Hermosa Cup ')).toBe(true);
    expect(tournamentArchiveNameMatches('Hermosa Cup', 'hermosa cup')).toBe(false);
    expect(tournamentArchiveNameMatches('Hermosa Cup', 'Hermosa Cup 2026')).toBe(false);
  });
});
