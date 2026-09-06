import ExcelJS from 'exceljs';
import type { TournamentExportSnapshot } from './schema';

/**
 * NormalizedXlsxExporter (handover §26.11) - a human-readable workbook of the SAME snapshot, laid out
 * for a person reading in Excel rather than for machine ingest. Restrained JT Excel styling: bold
 * frozen headers, filters, readable widths, real dates. Pure: snapshot in, xlsx bytes out.
 */
function styleSheet(ws: ExcelJS.Worksheet, headers: string[], widths?: number[]) {
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = widths?.[i] ?? Math.min(48, Math.max(12, h.length + 2));
  });
}

export async function buildNormalizedWorkbook(
  snapshot: TournamentExportSnapshot,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VouchPlay';
  wb.created = snapshot.exportedAt;

  // --- Summary ---
  const sum = wb.addWorksheet('Summary');
  sum.addRow(['Field', 'Value']);
  const confirmed = snapshot.registrations.filter((r) => r.status === 'Confirmed').length;
  const waitlisted = snapshot.registrations.filter((r) => r.status === 'Waitlisted').length;
  const rows: [string, string | number | Date | null][] = [
    ['Tournament', snapshot.tournamentName],
    ['City', snapshot.city ?? ''],
    ['Start date', snapshot.startDate],
    ['End date', snapshot.endDate],
    ['Divisions', snapshot.divisions.length],
    ['Teams (roster)', snapshot.teams.length],
    ['Confirmed teams', confirmed],
    ['Waitlisted teams', waitlisted],
    ['Distinct players', snapshot.players.length],
    ['Exported at', snapshot.exportedAt],
    ['Source', 'VouchPlay'],
  ];
  for (const r of rows) sum.addRow(r);
  sum.getColumn(2).numFmt = 'yyyy-mm-dd hh:mm';
  styleSheet(sum, ['Field', 'Value'], [22, 40]);

  // --- Registrations (rich) ---
  const regHeaders = [
    'Division',
    'Team',
    'Players',
    'Status',
    'Eligibility',
    'Payment',
    'Amount',
    'Currency',
    'Waitlist #',
    'Represented clubs',
    'Registered',
  ];
  const reg = wb.addWorksheet('Registrations');
  reg.addRow(regHeaders);
  for (const r of snapshot.registrations) {
    reg.addRow([
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
    ]);
  }
  reg.getColumn(11).numFmt = 'yyyy-mm-dd';
  styleSheet(reg, regHeaders, [22, 24, 40, 12, 20, 14, 10, 10, 10, 28, 14]);

  // --- Players ---
  const plHeaders = [
    'PlayerID',
    'First name',
    'Last name',
    'Nickname',
    'Email',
    'Gender',
    'Community skill',
  ];
  const pl = wb.addWorksheet('Players');
  pl.addRow(plHeaders);
  for (const p of snapshot.players) {
    pl.addRow([p.playerId, p.firstName, p.lastName, p.nickname, p.email, p.gender, p.skillLevel]);
  }
  styleSheet(pl, plHeaders, [12, 18, 18, 16, 30, 10, 18]);

  // --- Divisions ---
  const dvHeaders = ['DivisionID', 'Name', 'Skill', 'Max teams'];
  const dv = wb.addWorksheet('Divisions');
  dv.addRow(dvHeaders);
  for (const d of snapshot.divisions) {
    dv.addRow([d.divisionId, d.name, d.skillLevel, d.maxTeams]);
  }
  styleSheet(dv, dvHeaders, [12, 30, 18, 12]);

  return wb;
}

export async function buildNormalizedWorkbookBuffer(
  snapshot: TournamentExportSnapshot,
): Promise<Buffer> {
  const wb = await buildNormalizedWorkbook(snapshot);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
