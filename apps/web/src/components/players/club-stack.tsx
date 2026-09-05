import Link from 'next/link';
import { Shield } from 'lucide-react';
import type { ClubRef } from '@/lib/players/dto';

/**
 * Compact club-icon stack (handover §8.1/§8.3, up to 3). Clubs arrive in Phase 5; renders nothing
 * until this player has memberships. The interactive "compact sheet" on click is added with clubs.
 */
export function ClubStack({ clubs, max = 3 }: { clubs: ClubRef[]; max?: number }) {
  if (!clubs || clubs.length === 0) return null;
  const shown = clubs.slice(0, max);
  const extra = clubs.length - shown.length;
  return (
    <div className="flex items-center gap-1">
      {shown.map((club) => (
        <Link
          key={club.slug}
          href={`/clubs/${club.slug}`}
          title={`${club.name}${club.verified ? ' · Verified' : ''} · ${club.relationship}`}
          className="border-border bg-surface inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border"
        >
          {club.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={club.iconUrl} alt={club.name} className="h-full w-full object-cover" />
          ) : (
            <Shield size={12} aria-hidden className="text-foreground-muted" />
          )}
        </Link>
      ))}
      {extra > 0 && (
        <span className="text-foreground-muted text-[11px] font-medium">+{extra}</span>
      )}
    </div>
  );
}
