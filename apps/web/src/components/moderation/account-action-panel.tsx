'use client';

import { useState, useTransition } from 'react';
import { applyAccountAction, type AccountAction } from '@/lib/actions/moderation';

const ACTIONS: { value: AccountAction; label: string; timed?: boolean; danger?: boolean }[] = [
  { value: 'warn', label: 'Warn (record only)' },
  { value: 'restrict_vouching', label: 'Restrict vouching', timed: true },
  { value: 'restrict_account', label: 'Restrict account' },
  { value: 'suspend', label: 'Suspend', timed: true, danger: true },
  { value: 'ban', label: 'Ban', danger: true },
  { value: 'lift_status', label: 'Lift restriction / reinstate' },
];

/**
 * Staff account-action panel (handover §47). Applies warn / restrict / suspend / ban / lift — each
 * with a mandatory reason (and optional duration for timed actions) — via applyAccountAction, which
 * writes an append-only audit_logs row server-side.
 */
export function AccountActionPanel({ userId, userName }: { userId: string; userName: string }) {
  const [action, setAction] = useState<AccountAction>('warn');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const timed = ACTIONS.find((a) => a.value === action)?.timed;

  function apply() {
    setMsg(null);
    const dangerous = action === 'ban' || action === 'suspend';
    if (
      dangerous &&
      !confirm(
        `${action === 'ban' ? 'Ban' : 'Suspend'} ${userName}? This is a material account action.`,
      )
    ) {
      return;
    }
    start(async () => {
      const res = await applyAccountAction(
        userId,
        action,
        reason,
        timed && days ? Number(days) : undefined,
      );
      setMsg({ ok: !!res.ok, text: res.ok ? (res.message ?? 'Done.') : (res.error ?? 'Failed.') });
      if (res.ok) setReason('');
    });
  }

  const input =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <div className="border-border mt-3 space-y-2 rounded-xl border border-dashed p-3">
      <p className="text-foreground-muted text-xs font-semibold tracking-wide uppercase">
        Account action
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as AccountAction)}
          className={`${input} sm:w-auto`}
        >
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        {timed && (
          <input
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="Days (blank = indefinite)"
            className={`${input} sm:w-52`}
          />
        )}
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Reason (required, recorded in the audit log)"
        className={input}
      />
      <button
        type="button"
        onClick={apply}
        disabled={pending || !reason.trim()}
        className="bg-danger/90 hover:bg-danger inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Applying…' : 'Apply action'}
      </button>
      {msg && <p className={`text-xs ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
    </div>
  );
}
