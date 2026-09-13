'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface OverflowMenuAction {
  label: string;
  /** 'danger' reads the item red - reserve for a destructive/irreversible choice. */
  tone?: 'danger';
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * A `⋯` icon button that opens a small popover list of actions (master_plan §2AQ Decision E) - the
 * home for an entry's rare actions (confirm without payment, reject, refund, request a skill review,
 * assign a partner) so the sheet's main surface only ever shows the one or two buttons that matter
 * right now. No library: a fixed-position popover, closed on outside click, Escape, or picking an
 * item; `role="menu"`/`menuitem` with arrow-key navigation between items.
 */
export function OverflowMenu({
  actions,
  label = 'More actions',
}: {
  actions: OverflowMenuAction[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ??
        [],
    );
    if (items.length === 0) return;
    e.preventDefault();
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="text-foreground-muted hover:text-foreground hover:bg-surface-muted inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <MoreHorizontal size={18} aria-hidden />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="border-border bg-surface absolute right-0 z-20 mt-1 min-w-[13rem] overflow-hidden rounded-xl border py-1 shadow-lg"
        >
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              onClick={() => {
                setOpen(false);
                a.onSelect();
              }}
              className={`flex min-h-11 w-full items-center px-3 text-left text-sm font-medium disabled:opacity-50 ${
                a.tone === 'danger'
                  ? 'text-danger hover:bg-danger/10'
                  : 'text-foreground hover:bg-surface-muted'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
