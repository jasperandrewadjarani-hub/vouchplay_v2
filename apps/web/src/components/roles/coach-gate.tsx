import Link from 'next/link';
import { Check, Clock } from 'lucide-react';
import type { CoachGateState } from '@/lib/coach/queries';

/**
 * "Two things first" gate for `/me/roles/coach` (master_plan §2AO G, handover §4.4 amendment):
 * shown instead of the application form until the player has BOTH an approved identity verification
 * and a profile photo. Coaches vouch with their name shown by default, so both facts are asked for
 * up front rather than surfacing as a rejection after a full application is submitted.
 *
 * Only one row's button is ever "primary" at a time - the first step still needing action - so the
 * player is walked through them in order instead of facing two equally loud calls to action.
 */
export function CoachGate({ hasPhoto, identityStatus }: CoachGateState) {
  const idApproved = identityStatus === 'approved';
  const idPending = identityStatus === 'pending';
  const idNeedsAction = !idApproved && !idPending;
  const photoNeedsAction = !hasPhoto;
  // Step 1 gets the primary treatment whenever it still needs a click; step 2 only becomes primary
  // once step 1 has nothing left to click (approved, or awaiting staff review).
  const idIsPrimary = idNeedsAction;
  const photoIsPrimary = photoNeedsAction && !idNeedsAction;

  return (
    <div className="border-border bg-surface space-y-4 rounded-2xl border p-5">
      <div>
        <h2 className="text-foreground font-semibold">Two things first</h2>
        <p className="text-foreground-muted mt-1 text-sm">
          Coaches vouch with their name shown, so we ask for both before an application.
        </p>
      </div>

      <ol className="space-y-3">
        <GateRow
          number={1}
          label="Verify your ID"
          ctaLabel="Verify ID"
          done={idApproved}
          pending={idPending}
          href="/me/settings/identity?next=%2Fme%2Froles%2Fcoach"
          primary={idIsPrimary}
        />
        <GateRow
          number={2}
          label="Add a profile photo"
          ctaLabel="Add photo"
          done={hasPhoto}
          pending={false}
          href="/me/edit?next=%2Fme%2Froles%2Fcoach"
          primary={photoIsPrimary}
        />
      </ol>
    </div>
  );
}

function GateRow({
  number,
  label,
  ctaLabel,
  done,
  pending,
  href,
  primary,
}: {
  number: number;
  label: string;
  ctaLabel: string;
  done: boolean;
  pending: boolean;
  href: string;
  primary: boolean;
}) {
  return (
    <li className="border-border bg-background flex items-center gap-3 rounded-xl border p-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done
            ? 'bg-success/15 text-success'
            : primary
              ? 'vp-gradient text-white'
              : 'bg-surface-muted text-foreground-muted'
        }`}
        aria-hidden
      >
        {done ? <Check size={15} /> : number}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
      {done ? (
        <span className="text-success flex items-center gap-1 text-sm font-semibold">
          <Check size={15} aria-hidden />
          Done
        </span>
      ) : pending ? (
        <span className="text-foreground-muted flex items-center gap-1 text-sm font-medium">
          <Clock size={15} aria-hidden />
          Pending review
        </span>
      ) : (
        <Link
          href={href}
          className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold ${
            primary ? 'vp-gradient text-white' : 'border-border text-foreground border'
          }`}
        >
          {ctaLabel}
        </Link>
      )}
    </li>
  );
}
