import ExcelJS from 'exceljs';
import { SYSTEM_SHEETS, rowValuesFor, type TournamentExportSnapshot } from './schema';

/**
 * TournamentSystemXlsxExporter (handover §26.11.1) - the canonical operational handover workbook. It
 * reproduces the locked sheet order + headers from `schema.ts` EXACTLY so the downstream JT tournament
 * system can ingest it. Structure (not styling) is the contract; the structural compatibility test
 * regenerates this and asserts the shape. Pure: snapshot in, xlsx bytes out - no DB access.
 */
export async function buildSystemWorkbook(
  snapshot: TournamentExportSnapshot,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VouchPlay';
  wb.created = snapshot.exportedAt;
  wb.modified = snapshot.exportedAt;

  for (const spec of SYSTEM_SHEETS) {
    const ws = wb.addWorksheet(spec.name);
    // Header row (row 1) - the locked contract.
    ws.addRow([...spec.headers]);
    ws.getRow(1).font = { bold: true };

    const rows = rowValuesFor(spec.source, snapshot);
    for (const r of rows) ws.addRow(r);

    // Real Excel dates (serial + number format) on the declared date columns, data rows only.
    for (const dc of spec.dateColumns ?? []) {
      for (let rowNumber = 2; rowNumber <= rows.length + 1; rowNumber++) {
        const cell = ws.getRow(rowNumber).getCell(dc.index);
        if (cell.value instanceof Date) cell.numFmt = dc.numFmt;
      }
    }

    // JT Excel defaults: readable widths, frozen header, filter on the used range.
    spec.headers.forEach((h, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.min(40, Math.max(12, h.length + 2));
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: spec.headers.length },
    };
  }

  return wb;
}

export async function buildSystemWorkbookBuffer(
  snapshot: TournamentExportSnapshot,
): Promise<Buffer> {
  const wb = await buildSystemWorkbook(snapshot);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
