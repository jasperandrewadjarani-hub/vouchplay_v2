'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { confirmRegistration, rejectRegistration } from '@/lib/actions/registration';
import {
  verifyPayment,
  rejectPayment,
  markRefunded,
  getProofSignedUrl,
} from '@/lib/actions/payment';
import type { OrganizerRegistration } from '@/lib/tournaments/registration-queries';

/** Organizer registrations dashboard (handover §26.4) — confirm / reject with waitlist release. */
export function OrganizerRegistrations({
  tournamentId,
  registrations,
}: {
  tournamentId: string;
  registrations: OrganizerRegistration[];
}) {
  if (registrations.length === 0) {
    return <p className="text-foreground-muted text-sm">No registrations yet.</p>;
  }
  // Group by division for readability.
  const byDivision = new Map<string, OrganizerRegistration[]>();
  for (const r of registrations) {
    const arr = byDivision.get(r.divisionName) ?? [];
    arr.push(r);
    byDivision.set(r.divisionName, arr);
  }

  return (
    <div className="space-y-4">
      {[...byDivision.entries()].map(([division, regs]) => (
        <div key={division}>
          <h3 className="text-foreground mb-2 text-sm font-semibold">{division}</h3>
          <ul className="space-y-2">
            {regs.map((r) => (
              <RegRow key={r.id} tournamentId={tournamentId} reg={r} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function RegRow({ tournamentId, reg }: { tournamentId: string; reg: OrganizerRegistration }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      setMsg(res.error ?? res.message ?? null);
      if (res.ok) router.refresh();
    });
  }

  const terminal = ['confirmed', 'withdrawn', 'cancelled', 'rejected'].includes(reg.status);
  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50';

  return (
    <li className="border-border rounded-xl border p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-foreground text-sm">
          {reg.members.map((m) => m.name).join(' & ') || 'Team'}
          <span className="text-foreground-muted ml-1.5 text-xs">
            · {reg.status.replace(/_/g, ' ')}
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {reg.status !== 'confirmed' && reg.status !== 'waitlisted' && !terminal && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => confirmRegistration(reg.id, tournamentId))}
              className={`${btn} vp-gradient text-white`}
            >
              Confirm
            </button>
          )}
          {!terminal && (
            <button
              type="button"
              onClick={() => setShowReject((v) => !v)}
              className={`${btn} text-danger border-border border`}
            >
              Reject
            </button>
          )}
        </div>
      </div>
      {showReject && !terminal && (
        <div className="mt-2 flex gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="border-border bg-background flex-1 rounded-lg border px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => rejectRegistration(reg.id, tournamentId, reason))}
            className={`${btn} bg-danger/90 text-white`}
          >
            Confirm reject
          </button>
        </div>
      )}

      {/* Payment review (§24.4) */}
      {reg.paymentId && (
        <div className="border-border mt-2 rounded-lg border border-dashed p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-foreground-muted text-xs">
              Payment:{' '}
              <span className="text-foreground font-medium">
                {reg.paymentStatus?.replace(/_/g, ' ')}
              </span>
              {reg.amountDue != null && reg.currency && (
                <span>
                  {' '}
                  · {reg.currency} {reg.amountDue.toLocaleString()}
                </span>
              )}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {reg.hasProof && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await getProofSignedUrl(reg.paymentId as string);
                      if (res.url) window.open(res.url, '_blank', 'noopener');
                      else setMsg(res.error ?? 'Could not open proof.');
                    })
                  }
                  className={`${btn} border-border text-foreground border`}
                >
                  View proof
                </button>
              )}
              {reg.paymentStatus === 'submitted' && (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => verifyPayment(reg.paymentId as string, tournamentId))}
                    className={`${btn} vp-gradient text-white`}
                  >
                    Verify
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      const why = prompt('Reason for rejecting this payment?');
                      if (why && why.trim())
                        run(() => rejectPayment(reg.paymentId as string, tournamentId, why.trim()));
                    }}
                    className={`${btn} text-danger border-border border`}
                  >
                    Reject payment
                  </button>
                </>
              )}
              {reg.paymentStatus === 'verified' && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (confirm('Mark this payment refunded?'))
                      run(() => markRefunded(reg.paymentId as string, tournamentId, ''));
                  }}
                  className={`${btn} border-border text-foreground border`}
                >
                  Mark refunded
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {msg && <p className="text-foreground-muted mt-1 text-xs">{msg}</p>}
    </li>
  );
}
