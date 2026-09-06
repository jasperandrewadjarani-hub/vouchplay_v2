import Link from 'next/link';
import { Trophy, MapPin, CalendarDays } from 'lucide-react';
import type { TournamentCardDTO } from '@/lib/tournaments/dto';
import { TournamentStatusPill } from './status-pill';
import { LinkSpinner } from '@/components/ui/link-spinner';

function dateRange(startAt: string | null, endAt: string | null): string | null {
  if (!startAt) return null;
  const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  const s = new Date(startAt).toLocaleDateString('en-US', opts);
  if (!endAt) return s;
  const e = new Date(endAt).toLocaleDateString('en-US', opts);
  return s === e ? s : `${s} – ${e}`;
}

/** Concise tournament card for discovery (handover §19). */
export function TournamentCard({ tournament }: { tournament: TournamentCardDTO }) {
  const when = dateRange(tournament.startAt, tournament.endAt);
  return (
    <Link
      href={`/tournaments/${tournament.slug}`}
      className="border-border bg-surface vp-card overflow-hidden rounded-2xl border"
    >
      <div className="bg-surface-muted relative h-28 w-full">
        {tournament.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tournament.coverUrl}
            alt={tournament.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-foreground-muted flex h-full w-full items-center justify-center">
            <Trophy size={28} aria-hidden />
          </span>
        )}
        <span className="absolute top-2 right-2">
          <TournamentStatusPill status={tournament.status} />
        </span>
      </div>
      <div className="p-3.5">
        <div className="flex items-center gap-1.5">
          <h3 className="text-foreground truncate font-semibold">{tournament.name}</h3>
          <span className="text-primary ml-auto shrink-0">
            <LinkSpinner size={15} />
          </span>
        </div>
        <div className="text-foreground-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {tournament.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} aria-hidden />
              {tournament.city}
            </span>
          )}
          {when && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={12} aria-hidden />
              {when}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
