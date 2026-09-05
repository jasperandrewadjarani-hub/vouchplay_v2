import Link from 'next/link';
import { Shield, MapPin, BadgeCheck, Users } from 'lucide-react';
import type { ClubCardDTO } from '@/lib/clubs/dto';

/** Concise club card for the directory (handover §15.5). Never ranked by anything sensitive. */
export function ClubCard({ club }: { club: ClubCardDTO }) {
  return (
    <Link
      href={`/clubs/${club.slug}`}
      className="border-border bg-surface vp-card flex items-center gap-3 rounded-2xl border p-3.5"
    >
      <span className="border-border bg-surface-muted ring-primary/15 inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border ring-2">
        {club.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={club.logoUrl} alt={club.name} className="h-full w-full object-cover" />
        ) : (
          <Shield size={20} aria-hidden className="text-foreground-muted" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="text-foreground truncate font-semibold">{club.name}</h3>
          {club.verified && <BadgeCheck size={15} aria-hidden className="text-primary shrink-0" />}
        </div>
        <div className="text-foreground-muted mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {club.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} aria-hidden />
              {club.city}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Users size={12} aria-hidden />
            {club.memberCount} {club.memberCount === 1 ? 'member' : 'members'}
          </span>
          {club.privacy === 'approval_required' && (
            <span className="vp-label">Approval to join</span>
          )}
        </div>
      </div>
    </Link>
  );
}
