'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, Receipt } from 'lucide-react';
import { formatDate } from '@/lib/format-date';
import {
  verifyPayment,
  rejectPayment,
  markRefunded,
  getProofSignedUrl,
} from '@/lib/actions/payment';

/**
 * One bare `tournament_slots` row (master_plan §2AO A1/A5): a player reserved and paid for their own
 * seat before choosing a division. Mirrors `getOrganizerBareSlots`'s return shape
 * (`@/lib/tournaments/registration-queries`, built in a parallel lane) structurally rather than by
 * import, so this component compiles against the contract before that lane lands.
 */
export interface ReservedSlot {
  id: string;
  playerId: string;
  playerName: string;
  playerSlug: string | null;
  status: string;
  amountDue: number;
  amountSubmitted: number | null;
  currency: string;
  hasProof: boolean;
  submittedAt: string | null;
  rejectionReason: string | null;
  divisionName: string | null;
  /** master_plan §2AQ Decision F: true for a slot that still needs (or has) an organizer's live
   *  attention (submitted/verified). Optional because the query lane may not carry it yet - falls
   *  back to reading `status` directly below. */
  live?: boolean;
}

type ActionResult = { ok?: boolean; error?: string; message?: string };

const STATUS_STYLES: Record<string, { label: string; tone: string }> = {
  submitted: { label: 'Receipt sent', tone: 'border-warning/40 bg-warning/10 text-warning' },
  verified: { label: 'Verified', tone: 'border-success/30 bg-success/10 text-success' },
  rejected: { label: 'Declined', tone: 'border-danger/30 bg-danger/10 text-danger' },
  refunded: { label: 'Refunded', tone: 'border-border text-foreground-muted' },
};

/** True for a slot that still deserves default visibility - live (`submitted`/`verified`) work, not
 *  history. Master_plan §2AQ Decision F/Finding 6: declined and refunded slots used to sit in this
 *  list forever; they now go behind "Show declined". */
function isLiveSlot(slot: ReservedSlot): boolean {
  return slot.live ?? (slot.status === 'submitted' || slot.status === 'verified');
}

/**
 * "Reserved slots" panel (master_plan §2AO A6, §2AQ Decision F) - shown above the registrations list
 * on Manage. A bare slot is a receipt with nowhere else to be reviewed: it has no registration yet,
 * so it would never appear in the Registrations list below. Collapsible; hidden entirely when there
 * is nothing to show AND the feature is not even switched on, so a tournament that predates slot
 * reservations never grows a permanently-empty section. Declined/refunded slots are collapsed behind
 * "Show declined (n)" so a channel's history does not bury this batch's live work.
 */
export function ReservedSlotsPanel({
  tournamentId,
  slots,
  enabled,
}: {
  tournamentId: string;
  slots: ReservedSlot[];
  /** `isSlotReservationsEnabled()` (migration 0042's own seed) - the feature's proof of life. */
  enabled: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [showDeclined, setShowDeclined] = useState(false);
  if (slots.length === 0 && !enabled) return null;

  const liveSlots = slots.filter(isLiveSlot);
  const declinedSlots = slots.filter((s) => !isLiveSlot(s));

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-foreground flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm font-semibold"
      >
        <span>Reserved slots ({liveSlots.length})</span>
        <ChevronDown
          size={16}
          aria-hidden
          className={`text-foreground-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="space-y-2.5">
          <p className="text-foreground-muted text-xs">
            Players who paid for a seat before choosing a division. Their slot is applied
            automatically when they enter a division.
          </p>
          {liveSlots.length === 0 ? (
            <p className="text-foreground-muted text-sm">No reserved slots yet.</p>
          ) : (
            <ul className="border-border divide-border divide-y overflow-hidden rounded-2xl border">
              {liveSlots.map((slot) => (
                <SlotRow key={slot.id} slot={slot} tournamentId={tournamentId} />
              ))}
            </ul>
          )}
          {declinedSlots.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowDeclined((v) => !v)}
                aria-expanded={showDeclined}
                className="text-foreground-muted hover:text-foreground min-h-11 text-xs font-medium underline underline-offset-2"
              >
                {showDeclined ? 'Hide declined' : `Show declined (${declinedSlots.length})`}
              </button>
              {showDeclined && (
                <ul className="border-border divide-border mt-2 divide-y overflow-hidden rounded-2xl border">
                  {declinedSlots.map((slot) => (
                    <SlotRow key={slot.id} slot={slot} tournamentId={tournamentId} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SlotRow({ slot, tournamentId }: { slot: ReservedSlot; tournamentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  function run(fn: () => Promise<ActionResult>) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      setMsg(res.error ?? res.message ?? null);
      if (res.ok) router.refresh();
    });
  }

  const style = STATUS_STYLES[slot.status] ?? {
    label: slot.status.replace(/_/g, ' '),
    tone: 'border-border text-foreground-muted',
  };
  const btn =
    'inline-flex min-h-11 items-center justify-center rounded-lg px-2.5 text-xs font-semibold disabled:opacity-50';

  return (
    <li className="flex flex-col gap-1.5 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 flex-1">
          {slot.playerSlug ? (
            <Link
              href={`/players/${slot.playerSlug}`}
              className="text-foreground hover:text-primary block truncate text-sm font-semibold"
            >
              {slot.playerName}
            </Link>
          ) : (
            <span className="text-foreground block truncate text-sm font-semibold">
              {slot.playerName}
            </span>
          )}
          <span className="text-foreground-muted mt-0.5 block truncate text-xs">
            {slot.currency} {slot.amountDue.toLocaleString()}
            {slot.divisionName ? ` · ${slot.divisionName}` : ' · No division chosen yet'}
          </span>
        </span>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.tone}`}
        >
          <Receipt size={10} aria-hidden />
          {style.label}
        </span>
      </div>

      {slot.submittedAt && (
        <p className="text-foreground-muted text-[11px]">
          Submitted {formatDate(slot.submittedAt)}
        </p>
      )}
      {slot.rejectionReason && (
        <p className="text-danger text-[11px]">Declined: {slot.rejectionReason}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {slot.hasProof && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await getProofSignedUrl(slot.id, 'slot');
                if (res.url) window.open(res.url, '_blank', 'noopener');
                else setMsg(res.error ?? 'Could not open proof.');
              })
            }
            className={`${btn} border-border text-foreground border`}
          >
            View proof
          </button>
        )}
        {slot.status === 'submitted' && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => verifyPayment(slot.id, tournamentId, 'slot'))}
              className={`${btn} vp-gradient text-white`}
            >
              Verify
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setShowReject((v) => !v)}
              className={`${btn} text-danger border-border border`}
            >
              Reject
            </button>
          </>
        )}
        {slot.status === 'verified' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm('Mark this seat payment refunded?'))
                run(() => markRefunded(slot.id, tournamentId, '', 'slot'));
            }}
            className={`${btn} border-border text-foreground border`}
          >
            Mark refunded
          </button>
        )}
      </div>

      {showReject && (
        <div className="flex flex-wrap gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            className="border-border bg-background min-h-11 flex-1 rounded-lg border px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <button
            type="button"
            disabled={pending || !reason.trim()}
            onClick={() => run(() => rejectPayment(slot.id, tournamentId, reason.trim(), 'slot'))}
            className={`${btn} bg-danger/90 text-white`}
          >
            Confirm reject
          </button>
        </div>
      )}

      {msg && <p className="text-foreground-muted text-xs">{msg}</p>}
    </li>
  );
}
