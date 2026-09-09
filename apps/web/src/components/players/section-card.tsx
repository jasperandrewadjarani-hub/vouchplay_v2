import type { ReactNode } from 'react';

/**
 * Titled card wrapper for profile sections (handover §9).
 *
 * It lives in its own module so a CLIENT section (the comments panel, §2B) can use the same shell
 * without dragging the rest of `profile-sections.tsx` into the client bundle with it.
 */
export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-border bg-surface rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-foreground text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
