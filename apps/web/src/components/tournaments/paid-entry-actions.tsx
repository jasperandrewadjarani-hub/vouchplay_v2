'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, Users, XCircle } from 'lucide-react';
import { requestRegistrationCancellation } from '@/lib/actions/registration';
import { ChangePartnerForm } from './change-partner-form';

/**
 * What a player can do once their receipt is in (master_plan §1Y, §2L).
 *
 * The state itself is told once, by the §2G "not secured" checklist above this - so this component is
 * just the two actions, not another retelling. Change partner and Request to cancel are a matched
 * pair of equal-width buttons; each opens its panel full-width below (§2L). "Request to cancel" does
 * not cancel anything and says so before it is pressed: once a receipt exists the money went straight
 * to the organizer, so only they can undo it.
 */
export function PaidEntryActions({
  registrationId,
  tournamentId,
  teamId,
  divisionId,
  partnerName,
  canChangePartner,
}: {
  registrationId: string;
  tournamentId: string;
  teamId?: string;
  divisionId?: string;
  partnerName?: string | null;
  /** Doubles only, and only once migration 0027 is applied (§2A). */
  canChangePartner?: boolean;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<'none' | 'partner' | 'cancel'>('none');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function submit() {
    setMsg(null);
    setIsError(false);
    start(async () => {
      const res = await requestRegistrationCancellation(registrationId, tournamentId, reason);
      if (res.ok) {
        setSent(true);
        setPanel('none');
        setMsg(null);
        router.refresh();
      } else {
        setMsg(res.error ?? 'Could not send that request.');
        setIsError(true);
      }
    });
  }

  const showChange = Boolean(canChangePartner && teamId && divisionId);
  const actionBtn =
    'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors';

  if (sent) {
    return (
      <p className="text-foreground-muted mt-2 flex items-start gap-2 text-sm" role="status">
        <CheckCircle2 size={15} className="text-success mt-0.5 shrink-0" aria-hidden />
        <span>Your cancellation request is with the organizer and is under review.</span>
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {/* One matched pair - equal width, side by side from the narrowest phone up. */}
      <div className={`grid gap-2 ${showChange ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {showChange && (
          <button
            type="button"
            aria-expanded={panel === 'partner'}
            onClick={() => setPanel((p) => (p === 'partner' ? 'none' : 'partner'))}
            className={`${actionBtn} ${
              panel === 'partner'
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-foreground hover:bg-surface-muted'
            }`}
          >
            <Users size={16} aria-hidden />
            Change partner
          </button>
        )}
        <button
          type="button"
          aria-expanded={panel === 'cancel'}
          onClick={() => setPanel((p) => (p === 'cancel' ? 'none' : 'cancel'))}
          className={`${actionBtn} ${
            panel === 'cancel'
              ? 'border-warning bg-warning/10 text-foreground'
              : 'border-border text-foreground hover:bg-surface-muted'
          }`}
        >
          <XCircle size={16} aria-hidden />
          Request to cancel
        </button>
      </div>

      {panel === 'partner' && showChange && (
        <ChangePartnerForm
          teamId={teamId as string}
          tournamentId={tournamentId}
          divisionId={divisionId as string}
          currentPartnerName={partnerName ?? null}
          onClose={() => setPanel('none')}
        />
      )}

      {panel === 'cancel' && (
        <div className="border-border space-y-2 rounded-xl border p-3">
          <label className="text-foreground block text-sm font-medium" htmlFor="cancelReason">
            Why do you need to cancel?
          </label>
          <textarea
            id="cancelReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. I am injured and cannot play"
            className="border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm"
          />
          <p className="text-foreground-muted text-xs">
            This sends a request to the organizer. It does not cancel your entry by itself, and
            anything about your payment is settled with them directly.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || reason.trim().length < 5}
              onClick={submit}
              className="vp-gradient inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
              {pending ? 'Sending…' : 'Send request'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setPanel('none')}
              className="text-foreground-muted hover:text-foreground min-h-[44px] px-2 text-sm font-medium"
            >
              Never mind
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={`text-sm ${isError ? 'text-danger' : 'text-foreground-muted'}`} role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
