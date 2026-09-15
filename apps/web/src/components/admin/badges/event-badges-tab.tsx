import { EventBadgeRow } from './event-badge-row';

interface CommemorativeTournament {
  id: string;
  name: string;
  label: string | null;
  status: string;
}

/** Admin → Badges "Event badges" tab (master_plan §2BK B). */
export function EventBadgesTab({ tournaments }: { tournaments: CommemorativeTournament[] }) {
  return (
    <div className="space-y-3">
      <p className="text-foreground-muted text-xs">Every confirmed entrant gets this badge.</p>
      {tournaments.length === 0 ? (
        <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-6 text-center text-sm">
          No commemorative tournaments yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {tournaments.map((t) => (
            <li key={t.id} className="border-border bg-surface rounded-xl border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-foreground text-sm font-semibold">{t.name}</p>
                <span className="text-foreground-muted text-xs capitalize">{t.status}</span>
              </div>
              <EventBadgeRow tournamentId={t.id} initialLabel={t.label} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
