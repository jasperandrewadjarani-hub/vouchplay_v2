import Link from 'next/link';
import { Activity } from 'lucide-react';

const SIZE_CLASSES = {
  sm: 'min-h-8 px-2.5 py-1 text-xs gap-1.5',
  md: 'min-h-11 px-3 py-2 text-sm gap-2',
} as const;

/**
 * Staff-only entry point into `/staff/players/[slug]` (master_plan §2AN decision 6). A quiet outline
 * button, not a call-to-action - staff already know what it does. The CALLER decides whether the
 * viewer is staff (`viewer.isStaff`) and only then renders this; the link itself does no auth check
 * (the destination page re-guards via `requireStaffPage`).
 */
export function StaffPlayerActivityLink({
  slug,
  size = 'md',
}: {
  slug: string;
  size?: 'sm' | 'md';
}) {
  return (
    <Link
      href={`/staff/players/${slug}`}
      title="Staff: vouch and comment activity"
      className={`border-border text-foreground-muted hover:text-foreground inline-flex shrink-0 items-center rounded-xl border font-medium transition-colors ${SIZE_CLASSES[size]}`}
    >
      <Activity size={size === 'sm' ? 13 : 15} aria-hidden />
      Activity
    </Link>
  );
}
