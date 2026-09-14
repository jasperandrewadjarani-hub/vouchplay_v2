'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff, Check, Circle } from 'lucide-react';
import { Field } from './field';

// Mirrors field.tsx's `controlClass` exactly (that file is out of scope for this change) with room
// for the eye-toggle button on the right.
const controlClass =
  'w-full rounded-xl border border-border bg-background px-3.5 py-2.5 pr-11 text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * Standard password field (master_plan §2BD-B): same visual styling as `Input`, plus a show/hide eye
 * toggle. `tabIndex={-1}` keeps the toggle out of the tab order so keyboard users go straight from the
 * field to the next control. Big enough tap target (44px) for older / less tech-savvy users.
 */
export function PasswordInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${controlClass} ${className}`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="text-foreground-muted hover:text-foreground absolute inset-y-0 right-0 flex min-h-11 w-11 min-w-11 items-center justify-center"
      >
        {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  );
}

/**
 * New-password + confirm pair (master_plan §2BD-B): two `PasswordInput`s with two live check rows
 * under the confirm field ("At least 8 characters", "Passwords match") that turn green as the user
 * types, replacing hint sentences. No strength meter - length + match is the honest, non-nagging rule
 * for this audience. The server-side schema stays the source of truth; these are affordance only.
 */
export function PasswordPair({
  passwordId,
  confirmId,
  passwordName = 'password',
  confirmName = 'confirm',
  autoComplete = 'new-password',
  labels,
}: {
  passwordId: string;
  confirmId: string;
  passwordName?: string;
  confirmName?: string;
  autoComplete?: string;
  labels?: { password?: string; confirm?: string };
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const longEnough = password.length >= 8;
  const matches = confirm.length > 0 && password === confirm;

  return (
    <>
      <Field label={labels?.password ?? 'New password'} htmlFor={passwordId} required>
        <PasswordInput
          id={passwordId}
          name={passwordName}
          autoComplete={autoComplete}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label={labels?.confirm ?? 'Confirm password'} htmlFor={confirmId} required>
        <PasswordInput
          id={confirmId}
          name={confirmName}
          autoComplete={autoComplete}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <ul aria-live="polite" className="mt-1.5 space-y-1">
          <CheckRow ok={longEnough} label="At least 8 characters" />
          <CheckRow ok={matches} label="Passwords match" />
        </ul>
      </Field>
    </>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li
      className={`flex items-center gap-1.5 text-xs ${ok ? 'text-success' : 'text-foreground-muted'}`}
    >
      {ok ? (
        <Check size={14} aria-hidden />
      ) : (
        <Circle size={6} className="mx-1 fill-current" aria-hidden />
      )}
      {label}
    </li>
  );
}
