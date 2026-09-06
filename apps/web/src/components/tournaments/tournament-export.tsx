import { Download, FileSpreadsheet, FileText } from 'lucide-react';

/**
 * Organizer export panel (handover §26.11). Plain download links to the authorized export route -
 * cookies are sent, the server enforces the `export` permission and returns the file. The canonical
 * Tournament-System XLSX is the primary action; a normalized workbook and per-entity CSVs follow.
 */
export function TournamentExport({ slug }: { slug: string }) {
  const href = (qs: string) => `/api/tournaments/${slug}/export?${qs}`;
  const chip =
    'border-border text-foreground hover:bg-surface-muted inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium';

  return (
    <div className="space-y-3">
      <a
        href={href('format=system')}
        className="vp-gradient vp-glow inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white"
      >
        <Download size={15} aria-hidden />
        Tournament-System XLSX
      </a>
      <p className="text-foreground-muted text-xs">
        The canonical operational workbook for the JT tournament system (Teams, Players, Divisions,
        Dates). Confirmed + pending teams are included; withdrawn/rejected are not.
      </p>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <a href={href('format=normalized')} className={chip}>
          <FileSpreadsheet size={14} aria-hidden />
          Normalized XLSX
        </a>
        <a href={href('format=csv&entity=registrations')} className={chip}>
          <FileText size={14} aria-hidden />
          Registrations CSV
        </a>
        <a href={href('format=csv&entity=teams')} className={chip}>
          <FileText size={14} aria-hidden />
          Teams CSV
        </a>
        <a href={href('format=csv&entity=players')} className={chip}>
          <FileText size={14} aria-hidden />
          Players CSV
        </a>
        <a href={href('format=csv&entity=divisions')} className={chip}>
          <FileText size={14} aria-hidden />
          Divisions CSV
        </a>
      </div>
    </div>
  );
}
