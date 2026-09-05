'use client';

import { useState, useTransition } from 'react';
import type { SafetyActionState } from '@/lib/actions/report';

export interface StatusOption {
  value: string;
  label: string;
}

/**
 * Generic status + reason resolver used by every moderation queue card. The parent binds `onResolve`
 * to the right server action (resolveReport / resolveSkillReview / reviewFraudFlag / …); this
 * component only collects the status + reason and reports the result.
 */
export function ResolveForm({
  statuses,
  onResolve,
  requireReasonFor = [],
}: {
  statuses: StatusOption[];
  onResolve: (status: string, reason: string) => Promise<SafetyActionState>;
  /** Status values that require a non-empty reason before Apply is enabled. */
  requireReasonFor?: string[];
}) {
  const [status, setStatus] = useState(statuses[0]?.value ?? '');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const reasonRequired = requireReasonFor.includes(status);
  const disabled = pending || !status || (reasonRequired && !reason.trim());

  function apply() {
    setMsg(null);
    start(async () => {
      const res = await onResolve(status, reason);
      setMsg({ ok: !!res.ok, text: res.ok ? (res.message ?? 'Done.') : (res.error ?? 'Failed.') });
      if (res.ok) setReason('');
    });
  }

  const input =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={`${input} sm:w-auto`}
        >
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={apply}
          disabled={disabled}
          className="vp-gradient inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Apply'}
        </button>
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder={
          reasonRequired ? 'Resolution note (required)' : 'Resolution / internal note (optional)'
        }
        className={input}
      />
      {msg && <p className={`text-xs ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
    </div>
  );
}
