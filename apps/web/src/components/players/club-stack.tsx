import Link from 'next/link';
import { Shield } from 'lucide-react';
import type { ClubRef } from '@/lib/players/dto';

/**
 * Compact club-icon stack (handover §8.1/§8.3, up to 3).
 *
 * `interactive={false}` renders the same icons as plain spans. Compact directory rows use that:
 * the row already holds a link and an STS button, and every extra interactive island inside a row
 * makes it harder to predict what a tap will do (§1S). The detailed card keeps the linked version.
 */
export function ClubStack({
  clubs,
  max = 3,
  interactive = true,
  size = 24,
}: {
  clubs: ClubRef[];
  max?: number;
  interactive?: boolean;
  size?: 20 | 24;
}) {
  if (!clubs || clubs.length === 0) return null;
  const shown = clubs.slice(0, max);
  const extra = clubs.length - shown.length;
  const box = size === 20 ? 'h-5 w-5' : 'h-6 w-6';
  const icon = size === 20 ? 10 : 12;
  const chip = `border-border bg-surface inline-flex ${box} items-center justify-center overflow-hidden rounded-full border`;

  return (
    <div className="flex items-center gap-1">
      {shown.map((club) => {
        const label = `${club.name}${club.verified ? ' · Verified' : ''} · ${club.relationship}`;
        const inner = club.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={club.iconUrl} alt={club.name} className="h-full w-full object-cover" />
        ) : (
          <Shield size={icon} aria-hidden className="text-foreground-muted" />
        );
        return interactive ? (
          <Link key={club.slug} href={`/clubs/${club.slug}`} title={label} className={chip}>
            {inner}
          </Link>
        ) : (
          <span key={club.slug} title={label} className={chip}>
            {inner}
            <span className="sr-only">{label}</span>
          </span>
        );
      })}
      {extra > 0 && <span className="text-foreground-muted text-[11px] font-medium">+{extra}</span>}
    </div>
  );
}
