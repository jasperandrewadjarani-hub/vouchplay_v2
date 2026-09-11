import { Check } from 'lucide-react';

/**
 * Player avatar with initials fallback. Uses a plain <img> (avatars are small, few, and come from a
 * dynamic Supabase Storage host); next/image optimization isn't worth the remote-pattern coupling.
 */

const sizeMap = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-14 w-14 text-base',
  lg: 'h-20 w-20 text-2xl',
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
          src={url}
          alt={name}
          loading="lazy"
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
