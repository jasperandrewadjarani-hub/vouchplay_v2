'use client';

import type { ComponentType } from 'react';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  description?: string;
  /** Icon shown at the start of the label when `checked` is true (e.g. lucide `Eye`). */
  iconOn?: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
  /** Icon shown at the start of the label when `checked` is false (e.g. lucide `Lock`). */
  iconOff?: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
  /** Disables the control - the caller drives this from its own pending state (master_plan §2AW). */
  disabled?: boolean;
  id?: string;
}

/**
 * Generic labeled switch row (master_plan §2AW). A native `<button role="switch">` handles Space/
 * Enter for free; the 44px-tall row keeps the whole label a comfortable tap target, not just the
 * track. Track/thumb use brand tokens so the control reads consistently in light and dark: on = brand
 * primary, off = the neutral border tone (never a semantic red/green - going private is a normal
 * choice, not a warning).
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  iconOn: IconOn,
  iconOff: IconOff,
  disabled = false,
  id,
}: SwitchProps) {
  const Icon = checked ? IconOn : IconOff;
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl text-left disabled:opacity-60"
    >
      <span className="flex min-w-0 items-center gap-2">
        {Icon && <Icon size={15} className="text-foreground-muted shrink-0" aria-hidden />}
        <span className="min-w-0">
          <span className="text-foreground block text-sm font-medium">{label}</span>
          {description && (
            <span className="text-foreground-muted block text-xs">{description}</span>
          )}
        </span>
      </span>
      <span
        aria-hidden
        className={`border-border relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
          checked ? 'bg-primary' : 'bg-border'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
