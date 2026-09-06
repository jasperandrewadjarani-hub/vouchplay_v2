import { getOptionalUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { authorizeOrganizer } from '@/lib/tournaments/authz';
import { writeAudit } from '@/lib/moderation/audit';
import { buildTournamentSnapshot } from '@/lib/exports/build';
import { buildSystemWorkbookBuffer } from '@/lib/exports/system-xlsx';
import { buildNormalizedWorkbookBuffer } from '@/lib/exports/normalized-xlsx';
import { buildCsv, CSV_ENTITIES, type CsvEntity } from '@/lib/exports/csv';

/**
 * Organizer export (handover §26.11). GET with `?format=system|normalized|csv` (+ `&entity=` for
 * csv). Server-authorized: the caller must hold the tournament `export` permission (owner or a
 * co-organizer granted it). Every export writes an audit_logs row (authorized data egress). Files are
 * never cached.
 */
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function slugSafe(s: string): string {
  return (
    (s || 'tournament')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'tournament'
  );
}
function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getOptionalUser();
  if (!user) return new Response('Sign in required.', { status: 401 });

  const svc = createServiceClient();
  const { data: tData } = await svc
    .from('tournaments')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle();
  const tournament = tData as { id: string; name: string } | null;
  if (!tournament) return new Response('Tournament not found.', { status: 404 });

  if (!(await authorizeOrganizer(user.id, tournament.id, 'export'))) {
    return new Response('You do not have permission to export this tournament.', { status: 403 });
  }

  const url = new URL(req.url);
  const format = (url.searchParams.get('format') ?? 'system').toLowerCase();
  const entityParam = (url.searchParams.get('entity') ?? 'registrations').toLowerCase();

  const snapshot = await buildTournamentSnapshot(tournament.id);
  const base = slugSafe(tournament.name || slug);

  await writeAudit({
    actorId: user.id,
    action: 'tournament_export',
    entityType: 'tournament',
    entityId: tournament.id,
    reason: `format=${format}${format === 'csv' ? `:${entityParam}` : ''}`,
  });

  if (format === 'system') {
    const buf = await buildSystemWorkbookBuffer(snapshot);
    return fileResponse(buf, XLSX_MIME, `${base}-tournament-system-${stamp()}.xlsx`);
  }
  if (format === 'normalized') {
    const buf = await buildNormalizedWorkbookBuffer(snapshot);
    return fileResponse(buf, XLSX_MIME, `${base}-normalized-${stamp()}.xlsx`);
  }
  if (format === 'csv') {
    if (!CSV_ENTITIES.includes(entityParam as CsvEntity)) {
      return new Response('Unknown CSV entity.', { status: 400 });
    }
    const csv = buildCsv(snapshot, entityParam as CsvEntity);
    // BOM so Excel opens UTF-8 CSVs correctly.
    return fileResponse(
      Buffer.from('﻿' + csv, 'utf8'),
      'text/csv; charset=utf-8',
      `${base}-${entityParam}-${stamp()}.csv`,
    );
  }
  return new Response('Unknown export format.', { status: 400 });
}

function fileResponse(buf: Buffer, mime: string, filename: string): Response {
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
