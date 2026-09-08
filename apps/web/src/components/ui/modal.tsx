'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Shared bottom-sheet-on-mobile / centered-on-desktop modal shell (matches the vouch form pattern).
 * Closes on overlay click, the X button, or Escape. Locks body scroll while open.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  size = 'md',
  align = 'sheet',
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** 'lg' is a near-full-screen announcement surface; 'md' is the default dialog. */
  size?: 'md' | 'lg';
  /**
   * 'sheet' rises from the bottom on mobile (good for long, image-led content). 'center' floats in the
   * middle at every width - the right choice for a short explainer, which otherwise sits under the
   * browser chrome and reads as clipped.
   */
  align?: 'sheet' | 'center';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-black/50 ${
        align === 'center' ? 'items-center p-4' : 'items-end p-0 sm:items-center sm:p-4'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={`border-border bg-surface w-full overflow-y-auto border p-5 ${
          align === 'center' ? 'rounded-2xl' : 'rounded-t-2xl sm:rounded-2xl'
        } ${size === 'lg' ? 'max-h-[94dvh] max-w-2xl sm:p-6' : 'max-h-[85dvh] max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              className={`text-foreground font-semibold ${
                size === 'lg' ? 'text-xl sm:text-2xl' : 'text-lg'
              }`}
            >
              {title}
            </h2>
            {subtitle && (
              <p className={`text-foreground-muted ${size === 'lg' ? 'text-base' : 'text-sm'}`}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-foreground-muted hover:text-foreground hover:bg-surface-muted -m-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
