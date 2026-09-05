/**
 * Player avatar with initials fallback. Uses a plain <img> (avatars are small, few, and come from a
 * dynamic Supabase Storage host); next/image optimization isn't worth the remote-pattern coupling.
 */

const sizeMap = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-14 w-14 text-base',
  lg: 'h-20 w-20 text-2xl',
} as const;

export function PlayerAvatar({
  url,
  initials,
  name,
  size = 'md',
  className = '',
}: {
  url: string | null;
  initials: string;
  name: string;
  size?: keyof typeof sizeMap;
  className?: string;
}) {
  const dims = sizeMap[size];
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        loading="lazy"
        className={`border-border bg-surface-muted shrink-0 rounded-full border object-cover ${dims} ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`bg-surface-muted text-foreground-muted border-border inline-flex shrink-0 items-center justify-center rounded-full border font-semibold ${dims} ${className}`}
    >
      {initials}
    </span>
  );
}
