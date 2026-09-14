'use client';

/**
 * The team card (master_plan §2BG Decision E) - a roster with a next step. Replaces `RegRow` and its
 * satellite components in `organizer-registrations.tsx` (lane B deletes those; this is the only file
 * that renders them now). One question leads: what does the organizer need to decide? Everything else
 * - roster, eligibility, payment - is reference material underneath that one decision.
 *
 * Renders its own bottom sheet (mobile) / centered dialog (>= sm) - `Modal` (`components/ui/modal.tsx`)
 * always renders its own title row + close button, which collides with this card's custom header
 * (stacked avatars, verdict pill, a ⋯ button beside close), so the sheet mechanics (portal, Escape,
 * backdrop click, body-scroll lock) are re-implemented here rather than reused.
 *
 * State is orchestrated here; presentational pieces (roster rows, payment rows, the More list/step
 * views, the award picker) live in `team-card-parts.tsx` - split out only because this file is long.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  Banknote,
  Check,
  CheckCircle2,
  MoreHorizontal,
  Repeat,
  RotateCcw,
  UserSearch,
  X,
  XCircle,
} from 'lucide-react';
import type { OrganizerRegistration } from '@/lib/tournaments/registration-queries';
import type { EligibilityDivisionOption } from '@/lib/tournaments/organizer-types';
import {
  needsReasons,
  NEEDS_REASON_LABELS,
  entryBucket,
  entryVerdict,
  moneyRead,
  memberDisplay,
  hasOpenSeat,
  isClosed,
  isFreeEntry,
  teamLabel,
  amountLabel,
  type NeedsReason,
} from '@/lib/tournaments/entry-view';
import {
  confirmRegistration,
  rejectRegistration,
  approveRegistrationCancellation,
  declineRegistrationCancellation,
  revertConfirmation,
  restoreRegistration,
  resendGuestCode,
} from '@/lib/actions/registration';
import {
  approveEligibility,
  reclassifyRegistration,
  requestSkillReviewForRegistration,
  undoEligibilityApproval,
} from '@/lib/actions/eligibility';
import {
  verifyPayment,
  rejectPayment,
  markRefunded,
  getProofSignedUrl,
} from '@/lib/actions/payment';
import { PlayerAvatar } from '@/components/players/player-avatar';
import {
  type ActionResult,
  type RunFn,
  type StartTransition,
  type Snapshot,
  type ReceiptRef,
  type MoreListItem,
  btn,
  VerdictPill,
  ToastLine,
  OpenSeatAvatar,
  NameWithNickname,
  InlineConfirm,
  InlineReasonPrompt,
  eligibilityReasonLines,
  eligibilityResultLabel,
  REASON_LINE_TONE,
  RosterSection,
  PaymentSection,
  MoreList,
  ReasonStepView,
  ReclassifyStepView,
  AwardPicker,
  firstSubmittedReceipt,
} from './team-card-parts';

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

// ---------------------------------------------------------------------------
// Header (master_plan §2BG Decision E "Header")
// ---------------------------------------------------------------------------

function Header({
  reg,
  openSeat,
  onClose,
  onOpenMore,
  showMoreButton,
}: {
  reg: OrganizerRegistration;
  openSeat: boolean;
  onClose: () => void;
  onOpenMore: () => void;
  showMoreButton: boolean;
}) {
  const verdict = entryVerdict(reg);
  const money = moneyRead(reg);
  return (
    <div className="flex items-start justify-between gap-2 px-4 pt-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="isolate flex -space-x-3">
          {reg.members.map((m) => (
            <PlayerAvatar
              key={m.id}
              url={m.avatarUrl}
              initials={initialsOf(m.name)}
              name={m.name}
              size="md"
              className="ring-surface ring-2"
            />
          ))}
          {openSeat && <OpenSeatAvatar size="md" />}
        </span>
        <span className="min-w-0">
          <span className="text-foreground block text-base font-semibold">
            {reg.members.map((m, i) => {
              const display = memberDisplay(m);
              return (
                <span key={m.id}>
                  {i > 0 && ' & '}
                  <NameWithNickname name={display.name} nickname={display.nickname} />
                </span>
              );
            })}
            {openSeat && <span className="text-foreground-muted"> &amp; Open seat</span>}
          </span>
          <span className="text-foreground-muted block truncate text-xs">
            {reg.divisionName} · {reg.teamSize > 1 ? 'Doubles' : 'Singles'}
          </span>
          <span className="mt-1.5 block">
            <VerdictPill label={`${verdict.label} · ${money}`} tone={verdict.tone} />
          </span>
        </span>
      </div>
      <span className="flex shrink-0 items-center gap-0.5">
        {showMoreButton && (
          <button
            type="button"
            aria-label="More actions"
            onClick={onOpenMore}
            className="text-foreground-muted hover:text-foreground hover:bg-surface-muted inline-flex h-11 w-11 items-center justify-center rounded-full"
          >
            <MoreHorizontal size={20} aria-hidden />
          </button>
        )}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="text-foreground-muted hover:text-foreground hover:bg-surface-muted inline-flex h-11 w-11 items-center justify-center rounded-full"
        >
          <X size={20} aria-hidden />
        </button>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Next step (master_plan §2BG Decision E "Next step") - one amber card for the FIRST needs-reason.
// ---------------------------------------------------------------------------

function NextStepCard({
  reg,
  tournamentId,
  reasons,
  firstReceipt,
  nameById,
  pending,
  start,
  run,
  setMsg,
  onOpenReclassify,
}: {
  reg: OrganizerRegistration;
  tournamentId: string;
  reasons: NeedsReason[];
  firstReceipt: ReceiptRef | null;
  nameById: Map<string, string>;
  pending: boolean;
  start: StartTransition;
  run: RunFn;
  setMsg: (m: { text: string; tone: 'success' | 'error' | 'note' } | null) => void;
  onOpenReclassify: () => void;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showDeclineReceipt, setShowDeclineReceipt] = useState(false);
  const [confirmTopup, setConfirmTopup] = useState(false);
  const [showApproveRule, setShowApproveRule] = useState(false);

  const first = reasons[0];
  if (!first) return null;
  const second = reasons[1];

  let body: React.ReactNode = null;

  if (first === 'cancel') {
    body = (
      <>
        <p className="text-foreground text-sm font-semibold">Wants to cancel</p>
        <p className="text-foreground-muted mt-1 text-sm whitespace-pre-wrap">
          &ldquo;{reg.cancellationRequest?.reason ?? ''}&rdquo;
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmCancel(true)}
            className={`${btn} bg-danger/90 text-white`}
          >
            Approve cancellation
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => declineRegistrationCancellation(reg.id, tournamentId))}
            className={`${btn} border-border text-foreground border`}
          >
            Keep entry
          </button>
        </div>
        {confirmCancel && (
          <InlineConfirm
            prompt="Cancel this entry?"
            confirmLabel="Yes, cancel"
            tone="danger"
            pending={pending}
            onConfirm={() =>
              run(async () => {
                const res = await approveRegistrationCancellation(reg.id, tournamentId);
                if (res.ok) setConfirmCancel(false);
                return res;
              })
            }
            onCancel={() => setConfirmCancel(false)}
          />
        )}
      </>
    );
  } else if (first === 'receipt' && firstReceipt) {
    const isTeam = firstReceipt.kind === 'team';
    const label = isTeam
      ? `${amountLabel(reg) ?? 'Free'} · Team receipt`
      : `Slot · ${(nameById.get(firstReceipt.playerId) ?? 'Player').split(/\s+/)[0]}`;
    const totalSubmitted =
      (reg.paymentStatus === 'submitted' ? 1 : 0) +
      (reg.slots ?? []).filter((s) => s.status === 'submitted').length;
    body = (
      <>
        <p className="text-foreground text-sm font-semibold">Check receipt</p>
        <p className="text-foreground-muted mt-1 text-sm">{label}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await getProofSignedUrl(firstReceipt.id, firstReceipt.kind);
                if (res.url) window.open(res.url, '_blank', 'noopener');
                else setMsg({ text: res.error ?? 'Could not open proof.', tone: 'error' });
              })
            }
            className={`${btn} border-border text-foreground border`}
          >
            View
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => verifyPayment(firstReceipt.id, tournamentId, firstReceipt.kind))
            }
            className={`${btn} vp-gradient text-white`}
          >
            Verify
          </button>
          <button
            type="button"
            onClick={() => setShowDeclineReceipt((v) => !v)}
            className={`${btn} text-danger border-border border`}
          >
            Decline
          </button>
        </div>
        {showDeclineReceipt && (
          <InlineReasonPrompt
            placeholder="Reason for declining (required)"
            pending={pending}
            confirmLabel="Confirm decline"
            tone="danger"
            onConfirm={(r) =>
              run(async () => {
                const res = await rejectPayment(
                  firstReceipt.id,
                  tournamentId,
                  r,
                  firstReceipt.kind,
                );
                if (res.ok) setShowDeclineReceipt(false);
                return res;
              })
            }
            onCancel={() => setShowDeclineReceipt(false)}
          />
        )}
        {totalSubmitted > 1 && (
          <p className="text-foreground-muted mt-1.5 text-xs">
            {totalSubmitted - 1} more receipt{totalSubmitted - 1 === 1 ? '' : 's'} below
          </p>
        )}
      </>
    );
  } else if (first === 'topup') {
    const due = reg.paymentSummary.topupDue;
    body = (
      <>
        <p className="text-foreground text-sm font-semibold">Top-up due</p>
        <p className="text-foreground-muted mt-1 text-sm tabular-nums">
          {reg.currency ?? 'PHP'} {due.toLocaleString()} still owed
        </p>
        <div className="mt-2.5">
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmTopup(true)}
            className={`${btn} vp-gradient text-white`}
          >
            Confirm anyway
          </button>
        </div>
        {confirmTopup && (
          <InlineConfirm
            prompt="Confirm this entry without the top-up?"
            confirmLabel="Yes, confirm"
            pending={pending}
            onConfirm={() =>
              run(async () => {
                const res = await confirmRegistration(reg.id, tournamentId);
                if (res.ok) setConfirmTopup(false);
                return res;
              })
            }
            onCancel={() => setConfirmTopup(false)}
          />
        )}
      </>
    );
  } else if (first === 'rule') {
    const snap = (reg.eligibilitySnapshot ?? {}) as Snapshot;
    const lines = eligibilityReasonLines(snap, nameById);
    const isHardRule = reg.eligibilityStatus === 'ineligible_hard_rule';
    body = (
      <>
        <p className="text-foreground text-sm font-semibold">Rule check</p>
        <div className="mt-1 space-y-0.5">
          {lines.length > 0 ? (
            lines.map((l, i) => (
              <p key={i} className={`text-sm ${REASON_LINE_TONE[l.tone]}`}>
                {l.text}
              </p>
            ))
          ) : (
            <p className="text-foreground-muted text-sm">
              {eligibilityResultLabel(reg.eligibilityStatus, snap)}
            </p>
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setShowApproveRule((v) => !v)}
            className={`${btn} vp-gradient text-white`}
          >
            Approve
          </button>
          <button
            type="button"
            onClick={onOpenReclassify}
            className={`${btn} border-border text-foreground border`}
          >
            Reclassify
          </button>
        </div>
        {showApproveRule && (
          <InlineReasonPrompt
            placeholder={isHardRule ? 'Reason (required to override a rule)' : 'Reason (optional)'}
            minLen={isHardRule ? 3 : 0}
            pending={pending}
            confirmLabel="Confirm approve"
            onConfirm={(r) =>
              run(async () => {
                const res = await approveEligibility(reg.id, tournamentId, r);
                if (res.ok) setShowApproveRule(false);
                return res;
              })
            }
            onCancel={() => setShowApproveRule(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="mx-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 sm:mx-5">
      {body}
      {second && (
        <p className="text-foreground-muted mt-2.5 text-xs">Then: {NEEDS_REASON_LABELS[second]}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eligibility line (master_plan §2BG Decision E "Eligibility") - only rendered when 'rule' is not a
// pending Next Step reason; a problem always shows there instead.
// ---------------------------------------------------------------------------

function EligibilityLine({
  reg,
  tournamentId,
  pending,
  run,
}: {
  reg: OrganizerRegistration;
  tournamentId: string;
  pending: boolean;
  run: RunFn;
}) {
  const snap = (reg.eligibilitySnapshot ?? {}) as Snapshot;
  return (
    <section className="px-4 sm:px-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-success flex items-center gap-1.5 text-sm font-medium">
          <Check size={14} aria-hidden />
          Eligible for this division
        </p>
        {snap.override && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => undoEligibilityApproval(reg.id, tournamentId))}
            className="text-foreground-muted hover:text-foreground text-xs font-semibold underline-offset-2 hover:underline"
          >
            Undo approval
          </button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// TeamCard - the exported sheet shell + orchestration.
// ---------------------------------------------------------------------------

type StepKind =
  'reclassify' | 'confirm' | 'move-back' | 'reject' | 'restore' | 'refund' | 'skill-review';
type Panel =
  | { kind: 'main' }
  | { kind: 'more' }
  | { kind: 'step'; step: StepKind; memberId?: string; memberName?: string };

export function TeamCard({
  tournamentId,
  reg,
  divisions,
  onClose,
}: {
  tournamentId: string;
  reg: OrganizerRegistration;
  divisions: EligibilityDivisionOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ text: string; tone: 'success' | 'error' | 'note' } | null>(null);
  const [panel, setPanel] = useState<Panel>({ kind: 'main' });
  const [showAssignPartner, setShowAssignPartner] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const run: RunFn = (fn) => {
    setMsg(null);
    startTransition(async () => {
      const res: ActionResult = await fn();
      if (res.error) setMsg({ text: res.error, tone: 'error' });
      else if (res.note) setMsg({ text: res.note, tone: 'note' });
      else if (res.message) setMsg({ text: res.message, tone: 'success' });
      if (res.ok) router.refresh();
    });
  };
  const start: StartTransition = (fn) => {
    setMsg(null);
    startTransition(fn);
  };

  const closed = isClosed(reg);
  const confirmed = reg.status === 'confirmed';
  const waitlisted = reg.status === 'waitlisted';
  const restorable = ['rejected', 'cancelled', 'withdrawn'].includes(reg.status);
  const nameById = new Map(reg.members.map((m) => [m.id, m.name]));
  const isFree = isFreeEntry(reg);
  const openSeat = hasOpenSeat(reg);
  const partnerNote = reg.partnerNote ?? null;
  const reasons = needsReasons(reg);
  const firstReceipt = firstSubmittedReceipt(reg);
  const canConfirmWithoutPayment = !confirmed && !closed && !waitlisted;

  // A verified payment eligible for refund - team receipt first, else a verified seat (master_plan
  // §2BE Decision B's `verifiedTarget`, preserved: dropping the seat fallback would silently remove
  // refund access for a doubles team paid seat-by-seat with no team receipt).
  const verifiedSlot = (reg.slots ?? []).find((s) => s.status === 'verified');
  const verifiedTarget: { kind: 'team' | 'slot'; id: string } | null =
    reg.paymentStatus === 'verified' && reg.paymentId
      ? { kind: 'team', id: reg.paymentId }
      : verifiedSlot
        ? { kind: 'slot', id: verifiedSlot.id }
        : null;

  // Reclassify targets: same format + team size as the current division, excluding it (master_plan
  // §2BG hotfix 52b6eeb already fixed the member-count bug server-side; this is the client-side filter
  // driving the radio list).
  const currentDivision = divisions.find((d) => d.id === reg.divisionId);
  const reclassifyTargets = divisions.filter(
    (d) =>
      d.id !== reg.divisionId &&
      (!currentDivision ||
        (d.format === currentDivision.format && d.teamSize === currentDivision.teamSize)),
  );

  if (!mounted) return null;

  const moreItems: MoreListItem[] = [];
  if (reclassifyTargets.length > 0) {
    moreItems.push({
      key: 'reclassify',
      label: 'Reclassify division',
      icon: Repeat,
      onSelect: () => setPanel({ kind: 'step', step: 'reclassify' }),
    });
  }
  if (canConfirmWithoutPayment) {
    moreItems.push({
      key: 'confirm',
      label: isFree ? 'Confirm entry' : 'Confirm without payment',
      icon: CheckCircle2,
      onSelect: () => setPanel({ kind: 'step', step: 'confirm' }),
    });
  }
  if (confirmed) {
    moreItems.push({
      key: 'move-back',
      label: 'Move back to review',
      icon: RotateCcw,
      onSelect: () => setPanel({ kind: 'step', step: 'move-back' }),
    });
  }
  if (!closed && !reg.cancellationRequest) {
    moreItems.push({
      key: 'reject',
      label: 'Reject entry',
      icon: XCircle,
      tone: 'danger',
      onSelect: () => setPanel({ kind: 'step', step: 'reject' }),
    });
  }
  if (restorable) {
    moreItems.push({
      key: 'restore',
      label: 'Restore entry',
      icon: RotateCcw,
      onSelect: () => setPanel({ kind: 'step', step: 'restore' }),
    });
  }
  if (verifiedTarget && !reg.cancellationRequest) {
    moreItems.push({
      key: 'refund',
      label: 'Refund payment',
      icon: Banknote,
      tone: 'danger',
      onSelect: () => setPanel({ kind: 'step', step: 'refund' }),
    });
  }
  for (const m of reg.members) {
    moreItems.push({
      key: `skill-${m.id}`,
      label: `Request skill review · ${m.name.split(/\s+/)[0]}`,
      icon: UserSearch,
      onSelect: () =>
        setPanel({
          kind: 'step',
          step: 'skill-review',
          memberId: m.id,
          memberName: m.name.split(/\s+/)[0] ?? m.name,
        }),
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={teamLabel(reg)}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="border-border bg-surface flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border sm:max-h-[88dvh] sm:max-w-lg sm:rounded-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div
          aria-hidden
          className="bg-foreground-muted/30 mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full sm:hidden"
        />
        <div className="overflow-y-auto">
          <Header
            reg={reg}
            openSeat={openSeat}
            onClose={onClose}
            onOpenMore={() => setPanel({ kind: 'more' })}
            showMoreButton={panel.kind === 'main' && moreItems.length > 0}
          />

          {msg && (
            <div className="mt-2">
              <ToastLine text={msg.text} tone={msg.tone} />
            </div>
          )}

          {panel.kind === 'main' && (
            <div className="mt-3 space-y-4 pb-5">
              {reasons.length > 0 ? (
                <NextStepCard
                  reg={reg}
                  tournamentId={tournamentId}
                  reasons={reasons}
                  firstReceipt={firstReceipt}
                  nameById={nameById}
                  pending={pending}
                  start={start}
                  run={run}
                  setMsg={setMsg}
                  onOpenReclassify={() => setPanel({ kind: 'step', step: 'reclassify' })}
                />
              ) : entryBucket(reg) === 'confirmed' ? (
                <div className="text-success mx-4 flex items-center gap-2 text-sm font-medium sm:mx-5">
                  <CheckCircle2 size={16} aria-hidden />
                  All set
                </div>
              ) : null}

              <RosterSection
                reg={reg}
                tournamentId={tournamentId}
                openSeat={openSeat}
                partnerNote={partnerNote}
                pending={pending}
                onResendCode={(memberId) =>
                  run(() =>
                    resendGuestCode(memberId, tournamentId).then((res) =>
                      res.ok ? { ok: true, message: 'Code sent' } : res,
                    ),
                  )
                }
                showAssignPartner={showAssignPartner}
                onToggleAssignPartner={setShowAssignPartner}
              />

              {!reasons.includes('rule') && (
                <EligibilityLine
                  reg={reg}
                  tournamentId={tournamentId}
                  pending={pending}
                  run={run}
                />
              )}

              <PaymentSection
                reg={reg}
                tournamentId={tournamentId}
                isFree={isFree}
                pending={pending}
                start={start}
                run={run}
                setMsg={(m) => setMsg(m ? { text: m, tone: 'error' } : null)}
                nameById={nameById}
              />

              {confirmed && (
                <AwardPicker
                  tournamentId={tournamentId}
                  teamId={reg.teamId}
                  pending={pending}
                  run={run}
                />
              )}
            </div>
          )}

          {panel.kind === 'more' && (
            <MoreList items={moreItems} onBack={() => setPanel({ kind: 'main' })} />
          )}

          {panel.kind === 'step' && panel.step === 'reclassify' && (
            <ReclassifyStepView
              targets={reclassifyTargets}
              pending={pending}
              onSubmit={(divisionId, reason) =>
                run(async () => {
                  const res = await reclassifyRegistration(
                    reg.id,
                    tournamentId,
                    divisionId,
                    reason,
                  );
                  if (res.ok) setPanel({ kind: 'main' });
                  return res;
                })
              }
              onBack={() => setPanel({ kind: 'more' })}
            />
          )}

          {panel.kind === 'step' && panel.step === 'confirm' && (
            <div className="space-y-3 px-4 pb-2 sm:px-5">
              <h3 className="text-foreground text-base font-semibold">
                {isFree ? 'Confirm entry' : 'Confirm without payment'}
              </h3>
              <p className="text-foreground-muted text-sm">
                {isFree ? 'Confirm this entry?' : 'Confirm this entry without a payment record?'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const res = await confirmRegistration(reg.id, tournamentId);
                      if (res.ok) setPanel({ kind: 'main' });
                      return res;
                    })
                  }
                  className={`${btn} vp-gradient text-white`}
                >
                  Yes, confirm
                </button>
                <button
                  type="button"
                  onClick={() => setPanel({ kind: 'more' })}
                  className="text-foreground-muted hover:text-foreground min-h-11 px-3 text-sm font-medium"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {panel.kind === 'step' && panel.step === 'move-back' && (
            <ReasonStepView
              title="Move back to review"
              placeholder="Reason (required)"
              minLen={3}
              primaryLabel="Move back to review"
              pending={pending}
              onSubmit={(r) =>
                run(async () => {
                  const res = await revertConfirmation(reg.id, tournamentId, r);
                  if (res.ok) setPanel({ kind: 'main' });
                  return res;
                })
              }
              onBack={() => setPanel({ kind: 'more' })}
            />
          )}

          {panel.kind === 'step' && panel.step === 'reject' && (
            <ReasonStepView
              title="Reject entry"
              placeholder="Reason (required)"
              minLen={3}
              primaryLabel="Confirm reject"
              primaryTone="danger"
              pending={pending}
              onSubmit={(r) =>
                run(async () => {
                  const res = await rejectRegistration(reg.id, tournamentId, r);
                  if (res.ok) setPanel({ kind: 'main' });
                  return res;
                })
              }
              onBack={() => setPanel({ kind: 'more' })}
            />
          )}

          {panel.kind === 'step' && panel.step === 'restore' && (
            <ReasonStepView
              title="Restore entry"
              placeholder="Reason (required)"
              minLen={3}
              primaryLabel="Restore entry"
              pending={pending}
              onSubmit={(r) =>
                run(async () => {
                  const res = await restoreRegistration(reg.id, tournamentId, r);
                  if (res.ok) setPanel({ kind: 'main' });
                  return res;
                })
              }
              onBack={() => setPanel({ kind: 'more' })}
            />
          )}

          {panel.kind === 'step' && panel.step === 'refund' && verifiedTarget && (
            <ReasonStepView
              title="Refund payment"
              placeholder="Reason (optional)"
              minLen={0}
              primaryLabel="Mark refunded"
              primaryTone="danger"
              pending={pending}
              onSubmit={(r) =>
                run(async () => {
                  const res = await markRefunded(
                    verifiedTarget.id,
                    tournamentId,
                    r,
                    verifiedTarget.kind,
                  );
                  if (res.ok) setPanel({ kind: 'main' });
                  return res;
                })
              }
              onBack={() => setPanel({ kind: 'more' })}
            />
          )}

          {panel.kind === 'step' && panel.step === 'skill-review' && panel.memberId && (
            <ReasonStepView
              title={`Request skill review · ${panel.memberName ?? ''}`}
              placeholder="Reason (required)"
              minLen={1}
              primaryLabel="Submit review"
              pending={pending}
              onSubmit={(r) => {
                const targetId = panel.memberId as string;
                run(async () => {
                  const res = await requestSkillReviewForRegistration(
                    reg.id,
                    tournamentId,
                    targetId,
                    r,
                  );
                  if (res.ok) setPanel({ kind: 'main' });
                  return res;
                });
              }}
              onBack={() => setPanel({ kind: 'more' })}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
