import type { ReactNode } from 'react';

/**
 * Phase-0 scaffold placeholder so every route renders a real, themed shell (handover §62: never
 * render a blank screen). Replaced by feature UI in later phases.
 */
export function PagePlaceholder({
  title,
  phase,
  children,
}: {
  title: string;
  phase: string;
  children?: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-foreground text-xl font-semibold tracking-tight">{title}</h1>
        <span className="border-border bg-surface-muted text-foreground-muted rounded-full border px-2.5 py-1 text-xs font-medium">
          {phase}
        </span>
      </div>
      <div className="border-border bg-surface text-foreground-muted rounded-2xl border p-6 text-sm leading-relaxed">
        {children ?? 'Coming online in a later build phase.'}
      </div>
    </section>
  );
}
