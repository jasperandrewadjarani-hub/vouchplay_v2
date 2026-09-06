import type { TournamentExportSnapshot } from './schema';

/**
 * CsvExporter (handover §26.11) - flat CSV per entity. RFC-4180 quoting; dates as ISO yyyy-mm-dd.
 * Pure: snapshot + entity in, CSV text out.
 */
export type CsvEntity = 'registrations' | 'teams' | 'players' | 'divisions';

export const CSV_ENTITIES: CsvEntity[] = ['registrations', 'teams', 'players', 'divisions'];

function cell(v: string | number | Date | null | undefined): string {
  if (v == null) return '';
  if (v instanceof Date) return isoDate(v);
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toCsv(headers: string[], rows: (string | number | Date | null)[][]): string {
  const lines = [headers.map(cell).join(',')];
  for (const r of rows) lines.push(r.map(cell).join(','));
  return lines.join('\r\n');
}

export function buildCsv(snapshot: TournamentExportSnapshot, entity: CsvEntity): string {
  switch (entity) {
    case 'registrations':
      return toCsv(
        [
          'Division',
          'Team',
          'Players',
          'Status',
          'Eligibility',
          'Payment',
          'Amount',
          'Currency',
          'WaitlistPosition',
          'RepresentedClubs',
          'RegisteredAt',
        ],
        snapshot.registrations.map((r) => [
          r.divisionName,
          r.teamName,
          r.members,
          r.status,
          r.eligibilityStatus,
          r.paymentStatus,
          r.amountDue,
          r.currency ?? '',
          r.waitlistPosition,
          r.representedClubs,
          r.registeredAt,
        ]),
      );
    case 'teams':
      return toCsv(
        [
          'TeamID',
          'DivisionID',
          'TeamName',
          'Player1Email',
          'Player2Email',
          'RegisteredAt',
          'Status',
          'Pool',
          'EnteredBy',
        ],
        snapshot.teams.map((t) => [
          t.teamId,
          t.divisionId,
          t.teamName,
          t.player1Email,
          t.player2Email,
          t.registeredAt,
          t.status,
          t.pool,
          t.enteredBy,
        ]),
      );
    case 'players':
      return toCsv(
        [
          'PlayerID',
          'FirstName',
          'LastName',
          'Nickname',
          'Email',
          'Phone',
          'Gender',
          'SkillLevel',
          'RegisteredAt',
          'EnteredBy',
        ],
        snapshot.players.map((p) => [
          p.playerId,
          p.firstName,
          p.lastName,
          p.nickname,
          p.email,
          p.phone,
          p.gender,
          p.skillLevel,
          p.registeredAt,
          p.enteredBy,
        ]),
      );
    case 'divisions':
      return toCsv(
        ['DivisionID', 'Name', 'PlayType', 'SkillLevel', 'MaxTeams'],
        snapshot.divisions.map((d) => [d.divisionId, d.name, d.playType, d.skillLevel, d.maxTeams]),
      );
  }
}
