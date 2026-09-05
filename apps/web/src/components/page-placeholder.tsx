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
    <section className="vp-in mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-foreground text-3xl font-extrabold tracking-tight">
          <span className="vp-gradient-text">{title}</span>
        </h1>
        <span className="border-primary/30 bg-primary/10 text-primary rounded-full border px-2.5 py-1 text-xs font-semibold">
          {phase}
        </span>
      </div>
      <div className="border-border bg-surface vp-hero text-foreground-muted rounded-2xl border p-6 text-sm leading-relaxed">
        {children ?? 'Coming online in a later build phase.'}
      </div>
    </section>
  );
}
