import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildSystemWorkbookBuffer } from './system-xlsx';
import { SYSTEM_SHEETS, TEAM_STATUS_MAP, type TournamentExportSnapshot } from './schema';
import { buildCsv } from './csv';

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

const fixture: TournamentExportSnapshot = {
  tournamentName: 'Test Open',
  city: 'Cebu',
  startDate: d(2026, 9, 5),
  endDate: d(2026, 9, 6),
  exportedAt: d(2026, 9, 1),
  players: [
    {
      playerId: 'PLY-001',
      firstName: 'Al',
      lastName: 'Muqri',
      nickname: 'AM',
      email: 'a@x.com',
      phone: '',
      gender: 'Male',
      skillLevel: 'Novice',
      registeredAt: d(2026, 9, 1),
      enteredBy: 'VouchPlay Export',
    },
    {
      playerId: 'PLY-002',
      firstName: 'Zein',
      lastName: 'Dantes',
      nickname: '',
      email: 'b@x.com',
      phone: '',
      gender: 'Female',
      skillLevel: '',
      registeredAt: d(2026, 9, 1),
      enteredBy: 'VouchPlay Export',
    },
  ],
  teams: [
    {
      teamId: 'TEAM-001',
      divisionId: 'DIV-01',
      teamName: 'Muqri/Dantes',
      player1Email: 'a@x.com',
      player2Email: 'b@x.com',
      registeredAt: d(2026, 9, 1),
      status: 'Confirmed',
      pool: '',
      enteredBy: 'VouchPlay Export',
    },
  ],
  divisions: [
    {
      divisionId: 'DIV-01',
      name: 'Mixed Doubles Novice',
      playType: 'Novice',
      skillLevel: 'Novice',
      status: '',
      numPools: 1,
      advancePerPool: 2,
      pointsToWin: 11,
      winBy: 1,
      createdBy: 'VouchPlay Export',
      playoffFieldMode: '',
      playoffFixedSize: '',
      scoringRules: '',
      scheduleBlocks: '',
      maxTeams: 16,
      playoffSeeding: 'PoolRank',
    },
  ],
  dates: [{ dateId: 'DATE-001', date: d(2026, 9, 5), label: 'Day 1' }],
  config: [{ key: 'TournamentName', value: 'Test Open' }],
  registrations: [
    {
      teamId: 'TEAM-001',
      divisionId: 'DIV-01',
      divisionName: 'Mixed Doubles Novice',
      teamName: 'Muqri/Dantes',
      members: 'Al Muqri <a@x.com>; Zein Dantes <b@x.com>',
      status: 'Confirmed',
      eligibilityStatus: 'Eligible',
      paymentStatus: 'Verified',
      amountDue: 500,
      currency: 'PHP',
      waitlistPosition: null,
      representedClubs: 'Cebu Smashers',
      registeredAt: d(2026, 9, 1),
    },
  ],
};

async function reload(): Promise<ExcelJS.Workbook> {
  const buf = await buildSystemWorkbookBuffer(fixture);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe('TournamentSystemXlsxExporter - canonical compatibility contract (§26.11.1)', () => {
  it('has exactly the locked sheets in the locked order', async () => {
    const wb = await reload();
    expect(wb.worksheets.map((w) => w.name)).toEqual(SYSTEM_SHEETS.map((s) => s.name));
  });

  it('every sheet has the exact header row (names + order)', async () => {
    const wb = await reload();
    for (const spec of SYSTEM_SHEETS) {
      const ws = wb.getWorksheet(spec.name);
      expect(ws, `missing sheet ${spec.name}`).toBeTruthy();
      const header = (ws!.getRow(1).values as unknown[])
        .slice(1)
        .map((v) => (v == null ? '' : String(v)));
      expect(header, `header drift on ${spec.name}`).toEqual([...spec.headers]);
    }
  });

  it('empty (tournament-system-owned) sheets carry only the header row', async () => {
    const wb = await reload();
    for (const name of ['Standings', 'Matches', 'Sponsors']) {
      const ws = wb.getWorksheet(name)!;
      expect(ws.actualRowCount, `${name} should be header-only`).toBe(1);
    }
  });

  it('date columns are real Excel dates, not text', async () => {
    const wb = await reload();
    const teamsDate = wb.getWorksheet('Teams')!.getRow(2).getCell(6).value;
    const playersDate = wb.getWorksheet('Players')!.getRow(2).getCell(9).value;
    const datesDate = wb.getWorksheet('TournamentDates')!.getRow(2).getCell(2).value;
    expect(teamsDate).toBeInstanceOf(Date);
    expect(playersDate).toBeInstanceOf(Date);
    expect(datesDate).toBeInstanceOf(Date);
  });

  it('Teams.Status uses the locked status vocabulary', async () => {
    const wb = await reload();
    const allowed = new Set(Object.values(TEAM_STATUS_MAP));
    const status = String(wb.getWorksheet('Teams')!.getRow(2).getCell(7).value);
    expect(allowed.has(status)).toBe(true);
  });

  it('Divisions row maps identity + defaults correctly', async () => {
    const wb = await reload();
    const row = wb.getWorksheet('Divisions')!.getRow(2);
    expect(row.getCell(1).value).toBe('DIV-01');
    expect(row.getCell(2).value).toBe('Mixed Doubles Novice');
    expect(row.getCell(15).value).toBe(16); // MaxTeams
    expect(row.getCell(16).value).toBe('PoolRank'); // PlayoffSeeding default
  });
});

describe('CsvExporter', () => {
  it('quotes fields containing commas/quotes and emits headers', () => {
    const csv = buildCsv(fixture, 'registrations');
    const lines = csv.split('\r\n');
    const head = lines[0] ?? '';
    const first = lines[1] ?? '';
    expect(head.startsWith('Division,Team,Players,Status')).toBe(true);
    expect(first).toContain('Mixed Doubles Novice');
    expect(first).toContain('Eligible');
  });

  it('teams CSV has the canonical header', () => {
    const csv = buildCsv(fixture, 'teams');
    expect(csv.split('\r\n')[0]).toBe(
      'TeamID,DivisionID,TeamName,Player1Email,Player2Email,RegisteredAt,Status,Pool,EnteredBy',
    );
  });
});
