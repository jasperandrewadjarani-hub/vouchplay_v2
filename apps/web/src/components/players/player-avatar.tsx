import { Check } from 'lucide-react';
import { avatarThumb } from '@/lib/storage';

/**
 * Player avatar with initials fallback. Uses a plain <img> (next/image optimization isn't worth the
 * remote-pattern coupling), but requests a server-resized Supabase thumbnail sized to the display
 * (master_plan §2AV egress follow-up) so a full-size upload is never downloaded to render a small
 * circle. External avatar URLs (e.g. Google) pass through `avatarThumb` unchanged.
 */

const sizeMap = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-14 w-14 text-base',
  lg: 'h-20 w-20 text-2xl',
} as const;

/** Requested thumbnail px per size - roughly 2x the rendered diameter (40/56/80) for high-density
 *  screens, so the circle stays crisp while the transferred image stays tiny. */
const thumbPxMap = {
  sm: 96,
  md: 128,
  lg: 176,
} as const;

/** Verified-check disc size per avatar size (master_plan §2AN decision 3): disc diameter / icon size,
 *  in px, so the check stays legible without overwhelming the smallest avatar. */
const verifiedSizeMap = {
  sm: { disc: 14, icon: 9 },
  md: { disc: 18, icon: 11 },
  lg: { disc: 24, icon: 14 },
} as const;

export function PlayerAvatar({
  url,
  initials,
  name,
  size = 'md',
  verified = false,
  className = '',
}: {
  url: string | null;
  initials: string;
  name: string;
  size?: keyof typeof sizeMap;
  /** Identity-verified check overlay (master_plan §2AN decision 3) - pinned bottom-right, matching
   *  `IdentityVerifiedBadge`'s success colour so the two never disagree about what "verified" means. */
  verified?: boolean;
  className?: string;
}) {
  const dims = sizeMap[size];
  const { disc, icon } = verifiedSizeMap[size];
  // `bg-success` matches `IdentityVerifiedBadge` (badges.tsx) - the app's identity-verified colour -
  // so the disc and the profile-page pill never disagree about what "verified" means. `ring-2
  // ring-surface` gives the disc a border that reads on any photo, light or dark; it is absolutely
  // positioned against the `relative inline-block` wrapper, not the <img>/<span> itself, so it
  // survives whichever branch below renders.
  const verifiedBadge = verified && (
    <span
      className="bg-success ring-surface absolute right-0 bottom-0 inline-flex items-center justify-center rounded-full text-white ring-2"
      style={{ width: disc, height: disc }}
      role="img"
      aria-label="Identity verified"
      title="Identity verified"
    >
      <Check size={icon} strokeWidth={3} aria-hidden />
    </span>
  );

  if (url) {
    return (
      <span className="relative inline-block shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarThumb(url, thumbPxMap[size]) ?? url}
          alt={name}
          loading="lazy"
          decoding="async"
          className={`border-border bg-surface-muted rounded-full border object-cover ${dims} ${className}`}
        />
        {verifiedBadge}
      </span>
    );
  }
  return (
    <span className="relative inline-block shrink-0">
      <span
        aria-hidden
        className={`bg-surface-muted text-foreground-muted border-border inline-flex items-center justify-center rounded-full border font-semibold ${dims} ${className}`}
      >
        {initials}
      </span>
      {verifiedBadge}
    </span>
  );
}
