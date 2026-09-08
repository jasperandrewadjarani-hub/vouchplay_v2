'use client';

import { useId, useState } from 'react';
import { Info } from 'lucide-react';

/**
 * Small "i" info control that reveals a short help text on demand (progressive disclosure). Keeps
 * screens uncluttered for non-technical users while retaining required guidance behind one tap.
 * Accessible: a real button with aria-expanded/aria-controls and keyboard focus styles.
 */
export function InfoDisclosure({
  label = 'More info',
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="text-foreground-muted hover:text-foreground inline-flex w-fit items-center gap-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Info size={13} aria-hidden />
        {label}
      </button>
      {open && (
        <div
          id={id}
          className="text-foreground-muted border-border mt-1.5 rounded-lg border border-dashed p-2 text-xs leading-relaxed"
        >
          {children}
        </div>
      )}
    </div>
  );
}
