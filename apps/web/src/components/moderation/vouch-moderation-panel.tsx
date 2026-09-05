'use client';

import { useState, useTransition } from 'react';
import { SKILL_BANDS } from '@vouchplay/config';
import { loadActiveVouchesForTarget, invalidateVouch } from '@/lib/actions/moderation';

interface Vouch {
  id: string;
  voucherName: string;
  voucherSlug: string | null;
  wasAnonymous: boolean;
  skillLevel: number;
  interactionType: string;
  usedCoachWeight: boolean;
  createdAt: string;
}

function bandLabel(ordinal: number): string {
  return SKILL_BANDS.find((b) => b.ordinal === ordinal)?.label ?? String(ordinal);
}

/**
 * Staff vouch-invalidation panel (handover §11.1, §11.3, §37). Loads a target's active vouches on
 * demand — this is an authorized moderation path, so it reveals the real (otherwise-anonymous)
 * voucher identity — and lets staff invalidate a vouch with a mandatory reason (audited + recomputed).
 */
export function VouchModerationPanel({
  targetId,
  targetName,
}: {
  targetId: string;
  targetName: string;
}) {
  const [open, setOpen] = useState(false);
  const [vouches, setVouches] = useState<Vouch[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    setMsg(null);
    if (!open && vouches === null) {
      start(async () => {
        const data = await loadActiveVouchesForTarget(targetId);
        setVouches(data);
      });
    }
    setOpen((v) => !v);
  }

  function doInvalidate(id: string) {
    const reason = (reasons[id] ?? '').trim();
    if (!reason) {
      setMsg('A reason is required to invalidate a vouch.');
      return;
    }
    if (!confirm('Invalidate this vouch? It will be removed from the skill calculation.')) return;
    start(async () => {
      const res = await invalidateVouch(id, reason);
      if (res.ok) {
        setVouches((prev) => (prev ? prev.filter((v) => v.id !== id) : prev));
        setMsg(res.message ?? 'Invalidated.');
      } else {
        setMsg(res.error ?? 'Failed.');
      }
    });
  }

  const input =
    'w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <div className="border-border mt-3 rounded-xl border border-dashed p-3">
      <button
        type="button"
        onClick={toggle}
        className="text-primary text-xs font-semibold"
        aria-expanded={open}
      >
        {open ? 'Hide' : 'Manage'} vouches for {targetName} (reveals voucher identity)
      </button>
      {msg && <p className="text-foreground-muted mt-1 text-xs">{msg}</p>}
      {open && (
        <div className="mt-2 space-y-2">
          {vouches === null ? (
            <p className="text-foreground-muted text-xs">Loading…</p>
          ) : vouches.length === 0 ? (
            <p className="text-foreground-muted text-xs">No active vouches.</p>
          ) : (
            vouches.map((v) => (
              <div key={v.id} className="border-border rounded-lg border p-2">
                <p className="text-foreground text-xs">
                  <span className="font-medium">{v.voucherName}</span>
                  {v.wasAnonymous && (
                    <span className="text-foreground-muted"> · anonymous publicly</span>
                  )}
                  {v.usedCoachWeight && (
                    <span className="text-foreground-muted"> · coach weight</span>
                  )}
                </p>
                <p className="text-foreground-muted text-xs">
                  Rated {bandLabel(v.skillLevel)} · played {v.interactionType} ·{' '}
                  {new Date(v.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
                <div className="mt-1 flex gap-2">
                  <input
                    value={reasons[v.id] ?? ''}
                    onChange={(e) => setReasons((r) => ({ ...r, [v.id]: e.target.value }))}
                    placeholder="Reason to invalidate"
                    className={input}
                  />
                  <button
                    type="button"
                    onClick={() => doInvalidate(v.id)}
                    disabled={pending}
                    className="bg-danger/90 hover:bg-danger shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Invalidate
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
