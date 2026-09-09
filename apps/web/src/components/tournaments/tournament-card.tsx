import Link from 'next/link';
import {
  Trophy,
  MapPin,
  CalendarDays,
  Heart,
  TicketCheck,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import type { TournamentCardDTO } from '@/lib/tournaments/dto';
import { TournamentStatusPill } from './status-pill';
import { LinkSpinner } from '@/components/ui/link-spinner';
import { formatDate } from '@/lib/format-date';

/** Dates are shown in Philippine time so a card never disagrees with the tournament page. */
function dateRange(startAt: string | null, endAt: string | null): string | null {
  if (!startAt) return null;
  const s = formatDate(startAt);
  if (!endAt) return s;
  const e = formatDate(endAt);
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
        {tournament.visibility === 'unlisted' && (
          <span className="bg-surface/90 text-foreground absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm">
            Unlisted
          </span>
        )}
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
        {tournament.engagementAvailable && (
          <div className="text-foreground-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <Heart size={12} aria-hidden />
              {tournament.interestedCount} interested
            </span>
            <span className="inline-flex items-center gap-1">
              <TicketCheck size={12} aria-hidden />
              {tournament.joiningCount} joining
            </span>
            {/* A provisional entry never gets the green tick or "joining" - only a confirmed one
                reads as done. An unpaid/under-review entry says so, to keep the urgency to pay
                (§2G). */}
            {tournament.viewerSecured ? (
              <span className="text-success inline-flex items-center gap-1 font-semibold">
                <CheckCircle2 size={12} aria-hidden />
                You&rsquo;re in
              </span>
            ) : tournament.viewerJoining ? (
              <span className="text-warning inline-flex items-center gap-1 font-semibold">
                <Clock size={12} aria-hidden />
                Not secured yet
              </span>
            ) : (
              tournament.viewerInterested && (
                <span className="text-primary inline-flex items-center gap-1 font-semibold">
                  <CheckCircle2 size={12} aria-hidden />
                  You&rsquo;re interested
                </span>
              )
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
