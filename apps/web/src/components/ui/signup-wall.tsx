import Link from 'next/link';
import { UserPlus, type LucideIcon } from 'lucide-react';

/**
 * Shared signup prompt (master_plan §2AH). A calm, warm invitation - never a cold paywall - shown to
 * anonymous visitors when they reach for depth. One component, reused across the players list, clubs
 * list and gated surfaces, so the message and the tap targets stay consistent for a non-technical,
 * mixed-age audience. Every prompt carries a same-origin `next` so signup drops the visitor exactly
 * where they were headed. Server component: it renders plain links, so it needs no client JS.
 */
export function SignupWall({
  title,
  message,
  next,
  icon: Icon = UserPlus,
}: {
  title: string;
  message: string;
  /** Same-origin absolute path to resume after signup/login. Encoded here, so callers pass it raw. */
  next: string;
  icon?: LucideIcon;
}) {
  const encoded = encodeURIComponent(next);
  return (
    <section className="border-border bg-surface flex flex-col items-center gap-4 rounded-2xl border p-8 text-center">
      <span
        className="vp-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
        aria-hidden
      >
        <Icon size={24} />
      </span>
      <div className="space-y-1.5">
        <h2 className="text-foreground text-xl font-bold tracking-tight">{title}</h2>
        <p className="text-foreground-muted mx-auto max-w-md text-sm leading-relaxed">{message}</p>
      </div>
      <Link
        href={`/signup?next=${encoded}`}
        className="vp-gradient vp-glow inline-flex min-h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white hover:brightness-110"
      >
        Create a free account
      </Link>
      <p className="text-foreground-muted text-sm">
        Already have an account?{' '}
        <Link
          href={`/login?next=${encoded}`}
          className="text-primary font-semibold hover:underline"
        >
          Log in
        </Link>
      </p>
    </section>
  );
}

/**
 * A slim one-line variant (master_plan §2AH) for the top of the tournaments/players lists: enough to
 * invite without interrupting the preview a guest is scanning. Server component - a plain link, no
 * client JS.
 */
export function GuestBanner({ next, message }: { next: string; message: string }) {
  return (
    <div className="border-primary/30 bg-primary/5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border px-4 py-3">
      <p className="text-foreground text-sm">{message}</p>
      <Link
        href={`/signup?next=${encodeURIComponent(next)}`}
        className="text-primary inline-flex min-h-11 shrink-0 items-center text-sm font-semibold hover:underline"
      >
        Create free account
      </Link>
    </div>
  );
}
