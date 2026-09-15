'use client';

/**
 * Shared building blocks for `team-card.tsx` (master_plan §2BG Decision E) - split out only because
 * the card itself is long, not because these are reused anywhere else. Everything here is a small,
 * presentational or narrowly-scoped piece: the toast line, inline confirms, the roster row, the
 * payment rows, the "More" step list, and the award picker. `team-card.tsx` owns all server-action
 * wiring and state; these components take plain data + callbacks.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Clock, UserX, type LucideIcon } from 'lucide-react';
import {
  ELIGIBILITY_RESULT_LABELS,
  HARD_RULE_LABELS,
  REASON_LABELS,
  FLAG_LABELS,
  priceBasisLabel,
  type SeatSummary,
} from '@vouchplay/core';
import { OFFICIAL_ACHIEVEMENTS } from '@vouchplay/config';
import type {
  OrganizerRegistration,
  OrganizerMember,
} from '@/lib/tournaments/registration-queries';
import type { EligibilityDivisionOption } from '@/lib/tournaments/organizer-types';
import { memberDisplay } from '@/lib/tournaments/entry-view';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { AssignPartnerForm } from './assign-partner-form';
import {
  getProofSignedUrl,
  unverifyPayment,
  restorePayment,
  verifyPayment,
  markSeatPaid,
  undoSeatPaid,
} from '@/lib/actions/payment';
import { issueOfficialAchievement } from '@/lib/actions/achievements';

/** Broad enough to structurally accept every action's own result shape (`RegistrationActionState`,
 *  `PaymentActionState`, `EligibilityActionState`, `AchievementActionState`, `OrganizerActionResult`) -
 *  same posture as the pre-§2BG `RegRow` this card replaces. `note` is the capacity/skill-fit
 *  advisory some actions (reclassify, restore) return alongside success. */
export type ActionResult = { ok?: boolean; error?: string; message?: string; note?: string };
export type RunFn = (fn: () => Promise<ActionResult>) => void;
/** A running server-action call that does not itself resolve to an `ActionResult` (fetching a signed
 *  proof URL) - `RunFn`'s wrapper only fits actions that report ok/error/message. */
export type StartTransition = (fn: () => void) => void;

export const btn =
  'inline-flex min-h-11 items-center justify-center rounded-xl px-3.5 text-sm font-semibold disabled:opacity-50';
export const btnSmall =
  'inline-flex min-h-9 items-center justify-center rounded-lg px-2.5 text-xs font-semibold disabled:opacity-50';

const TONE_DOT: Record<'action' | 'waiting' | 'done' | 'closed', string> = {
  action: 'bg-warning',
  waiting: 'bg-foreground-muted',
  done: 'bg-success',
  closed: 'bg-foreground-muted',
};
const TONE_PILL: Record<'action' | 'waiting' | 'done' | 'closed', string> = {
  action: 'border-warning/40 bg-warning/10 text-warning',
  waiting: 'border-border text-foreground-muted',
  done: 'border-success/30 bg-success/10 text-success',
  closed: 'border-border text-foreground-muted opacity-70',
};

/** One removable-free status pill: tone dot + label (master_plan §2BG Decision E header). */
export function VerdictPill({
  label,
  tone,
}: {
  label: string;
  tone: 'action' | 'waiting' | 'done' | 'closed';
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${TONE_PILL[tone]}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
      {label}
    </span>
  );
}

/** The one toast line under the header (master_plan §2BG Decision E "Feedback") - success emerald,
 *  error danger, note/capacity amber. Cleared by the caller when the next action starts. */
export function ToastLine({ text, tone }: { text: string; tone: 'success' | 'error' | 'note' }) {
  const cls = tone === 'error' ? 'text-danger' : tone === 'note' ? 'text-warning' : 'text-success';
  return (
    <p role="status" className={`px-4 text-sm font-medium sm:px-5 ${cls}`}>
      {text}
    </p>
  );
}

/** A dashed "?" avatar for an open seat, sized to match `PlayerAvatar`. */
export function OpenSeatAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims =
    size === 'sm'
      ? 'h-10 w-10 text-sm'
      : size === 'lg'
        ? 'h-20 w-20 text-2xl'
        : 'h-14 w-14 text-base';
  return (
    <span
      aria-hidden
      className={`text-foreground-muted border-border inline-flex shrink-0 items-center justify-center rounded-full border border-dashed font-semibold ${dims}`}
    >
      ?
    </span>
  );
}

/** A member's display name with the nickname inserted after the first token, in quotes, in
 *  `text-primary` - matches master_plan §2BG Decision E's example: `Rene "Bogart" Villanueva Jr`. */
export function NameWithNickname({ name, nickname }: { name: string; nickname: string | null }) {
  if (!nickname) return <>{name}</>;
  const idx = name.indexOf(' ');
  const first = idx === -1 ? name : name.slice(0, idx);
  const rest = idx === -1 ? '' : name.slice(idx);
  return (
    <>
      {first} <span className="text-primary">&ldquo;{nickname}&rdquo;</span>
      {rest}
    </>
  );
}

export function UnverifiedAccountChip() {
  return (
    <span className="border-warning/30 bg-warning/10 text-warning inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold">
      <UserX size={10} aria-hidden />
      Unverified
    </span>
  );
}

/** A generic inline "are you sure?" reveal (master_plan §2BG: every `window.confirm` replaced by this
 *  same pattern - never a browser dialog). */
export function InlineConfirm({
  prompt,
  confirmLabel,
  cancelLabel = 'No',
  tone = 'default',
  pending,
  onConfirm,
  onCancel,
}: {
  prompt: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border-border bg-surface-muted/60 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed p-2.5">
      <p className="text-foreground-muted text-xs">{prompt}</p>
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className={`${btnSmall} text-white ${tone === 'danger' ? 'bg-danger/90' : 'vp-gradient'}`}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`${btnSmall} border-border text-foreground border`}
        >
          {cancelLabel}
        </button>
      </span>
    </div>
  );
}

/** A one-line reason prompt shared by every Decline/Undo/Restore/Refund/etc. `minLen` 0 means the
 *  reason is optional - the confirm button is never blocked on it, only on `pending`. */
export function InlineReasonPrompt({
  placeholder,
  pending,
  confirmLabel,
  minLen = 3,
  tone = 'default',
  onConfirm,
  onCancel,
}: {
  placeholder: string;
  pending: boolean;
  confirmLabel: string;
  minLen?: number;
  tone?: 'default' | 'danger';
  onConfirm: (reason: string) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="border-border bg-background min-h-11 min-w-[10rem] flex-1 rounded-lg border px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      <button
        type="button"
        disabled={pending || value.trim().length < minLen}
        onClick={() => onConfirm(value.trim())}
        className={`${btnSmall} text-white ${tone === 'danger' ? 'bg-danger/90' : 'vp-gradient'}`}
      >
        {confirmLabel}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className={`${btnSmall} border-border text-foreground border`}
        >
          Cancel
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eligibility reason lines (copied from organizer-registrations.tsx RegRow - master_plan §2BE
// Decision A, unchanged behaviour, only the surrounding layout moved).
// ---------------------------------------------------------------------------

export interface SnapshotPlayer {
  playerId: string;
  result: string;
  communitySkillLevel: number | null;
  sts: number;
  uniqueVoucherCount: number;
  skillVerified: boolean;
  hardRuleCodes: string[];
  reasonCodes: string[];
  flags: string[];
}
export interface Snapshot {
  result?: string;
  hardRuleCodes?: string[];
  reasonCodes?: string[];
  flags?: string[];
  players?: SnapshotPlayer[];
  override?: { by: string; at: string; reason: string | null } | null;
}

const REASON_LABEL_FALLBACK: Record<string, string> = {
  PLAYING_DOWN_ONE_LEVEL: 'Entered one level below their skill - assess before confirming',
};

export function reasonLabel(code: string): string {
  return REASON_LABELS[code as keyof typeof REASON_LABELS] ?? REASON_LABEL_FALLBACK[code] ?? code;
}

export const REASON_LINE_TONE: Record<'danger' | 'warning' | 'muted', string> = {
  danger: 'text-danger',
  warning: 'text-warning',
  muted: 'text-foreground-muted',
};

export function eligibilityReasonLines(
  snap: Snapshot,
  nameById: Map<string, string>,
): { text: string; tone: 'danger' | 'warning' | 'muted' }[] {
  const players = snap.players ?? [];
  const multi = players.length > 1;
  const lines: { text: string; tone: 'danger' | 'warning' | 'muted' }[] = [];
  for (const p of players) {
    const prefix = multi ? `${(nameById.get(p.playerId) ?? 'Player').split(/\s+/)[0]}: ` : '';
    for (const c of p.hardRuleCodes) {
      lines.push({
        text: prefix + (HARD_RULE_LABELS[c as keyof typeof HARD_RULE_LABELS] ?? c),
        tone: 'danger',
      });
    }
    for (const c of p.reasonCodes) {
      lines.push({ text: prefix + reasonLabel(c), tone: 'warning' });
    }
    for (const c of p.flags) {
      lines.push({
        text: prefix + (FLAG_LABELS[c as keyof typeof FLAG_LABELS] ?? c),
        tone: 'muted',
      });
    }
  }
  return lines.slice(0, 2);
}

export function eligibilityResultLabel(status: string, snap: Snapshot): string {
  const resultKey = snap.result as keyof typeof ELIGIBILITY_RESULT_LABELS | undefined;
  if (resultKey && ELIGIBILITY_RESULT_LABELS[resultKey])
    return ELIGIBILITY_RESULT_LABELS[resultKey];
  const map: Record<string, string> = {
    eligible: 'Eligible',
    review: 'Needs review',
    skill_mismatch: 'Potential skill mismatch',
    ineligible_hard_rule: 'Does not meet a division rule',
  };
  return map[status] ?? status.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

/** A tiny "Change ▾" menu - Replace/Remove are disabled until Phase B (migration 0051) ships the
 *  underlying RPCs; shown rather than hidden so the organizer knows the power is coming. */
function ChangeMenu({ firstName }: { firstName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Change ${firstName}'s seat`}
        onClick={() => setOpen((v) => !v)}
        className="text-foreground-muted hover:text-foreground inline-flex min-h-9 items-center gap-0.5 rounded-lg px-1.5 text-xs font-medium"
      >
        Change
        <ChevronDown size={12} aria-hidden />
      </button>
      {open && (
        <div className="border-border bg-surface absolute right-0 z-10 mt-1 min-w-[12rem] rounded-xl border p-1 shadow-lg">
          <button
            type="button"
            disabled
            className="text-foreground-muted flex w-full flex-col items-start rounded-lg px-2.5 py-1.5 text-left text-xs disabled:opacity-60"
          >
            <span className="font-medium">Replace player</span>
            <span>Coming soon</span>
          </button>
          <button
            type="button"
            disabled
            className="text-foreground-muted flex w-full flex-col items-start rounded-lg px-2.5 py-1.5 text-left text-xs disabled:opacity-60"
          >
            <span className="font-medium">Remove</span>
            <span>Coming soon</span>
          </button>
        </div>
      )}
    </div>
  );
}

function MemberRow({
  member,
  unconfirmed,
  pending,
  onResendCode,
}: {
  member: OrganizerMember;
  unconfirmed: boolean;
  pending: boolean;
  onResendCode: () => void;
}) {
  const display = memberDisplay(member);
  const initials =
    display.name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  const firstName = display.name.split(/\s+/)[0] ?? display.name;
  return (
    <li className="flex items-start justify-between gap-2 py-2">
      <span className="flex min-w-0 items-center gap-2.5">
        <PlayerAvatar url={member.avatarUrl} initials={initials} name={display.name} size="md" />
        <span className="min-w-0">
          {member.slug ? (
            <Link
              href={`/players/${member.slug}`}
              className="text-foreground hover:text-primary text-sm font-semibold"
            >
              <NameWithNickname name={display.name} nickname={display.nickname} />
            </Link>
          ) : (
            <span className="text-foreground text-sm font-semibold">
              <NameWithNickname name={display.name} nickname={display.nickname} />
            </span>
          )}
          <span className="text-foreground-muted block text-xs">
            Community: {member.communitySkill ?? 'Unrated'}
          </span>
          {(member.unverified === true || unconfirmed) && (
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              {member.unverified === true && (
                <>
                  <UnverifiedAccountChip />
                  <button
                    type="button"
                    disabled={pending}
                    onClick={onResendCode}
                    className="text-primary text-[11px] font-semibold underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    Resend code
                  </button>
                </>
              )}
              {unconfirmed && (
                <span className="border-border text-foreground-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
                  <Clock size={10} aria-hidden />
                  Partner pending
                </span>
              )}
            </span>
          )}
        </span>
      </span>
      <ChangeMenu firstName={firstName} />
    </li>
  );
}

export function RosterSection({
  reg,
  tournamentId,
  openSeat,
  partnerNote,
  pending,
  onResendCode,
  showAssignPartner,
  onToggleAssignPartner,
}: {
  reg: OrganizerRegistration;
  tournamentId: string;
  openSeat: boolean;
  partnerNote: string | null;
  pending: boolean;
  onResendCode: (memberId: string) => void;
  showAssignPartner: boolean;
  onToggleAssignPartner: (open: boolean) => void;
}) {
  return (
    <section className="px-4 sm:px-5">
      <h3 className="text-foreground-muted text-[11px] font-semibold tracking-wide uppercase">
        Roster
      </h3>
      <ul className="divide-border mt-1 divide-y">
        {reg.members.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            unconfirmed={reg.unconfirmedMemberIds.includes(m.id)}
            pending={pending}
            onResendCode={() => onResendCode(m.id)}
          />
        ))}
        {openSeat && (
          <li className="py-2">
            {showAssignPartner ? (
              <AssignPartnerForm
                teamId={reg.teamId}
                tournamentId={tournamentId}
                divisionId={reg.divisionId}
                onClose={() => onToggleAssignPartner(false)}
              />
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2.5">
                  <OpenSeatAvatar size="md" />
                  {partnerNote ? (
                    <span className="min-w-0">
                      <span className="text-foreground-muted block text-sm">{partnerNote}</span>
                      <span className="text-foreground-muted block text-xs">to be invited</span>
                    </span>
                  ) : (
                    <span className="text-foreground-muted text-sm">Open seat</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onToggleAssignPartner(true)}
                  className={`${btnSmall} shrink-0 border`}
                  style={{ borderColor: 'var(--accent-lime)', color: 'var(--accent-lime)' }}
                >
                  + Add partner
                </button>
              </div>
            )}
          </li>
        )}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

export type ReceiptRef =
  { kind: 'team'; id: string } | { kind: 'slot'; id: string; playerId: string };

/** The entry's first submitted receipt, team scope first then seats in list order - the one Next Step
 *  offers Verify/Decline for, so Payment never duplicates those two buttons (master_plan §2BG E). */
export function firstSubmittedReceipt(reg: OrganizerRegistration): ReceiptRef | null {
  if (reg.paymentStatus === 'submitted' && reg.paymentId)
    return { kind: 'team', id: reg.paymentId };
  const slot = (reg.slots ?? []).find((s) => s.status === 'submitted');
  if (slot) return { kind: 'slot', id: slot.id, playerId: slot.playerId };
  return null;
}

function TeamReceiptLine({
  reg,
  tournamentId,
  pending,
  start,
  run,
  setMsg,
}: {
  reg: OrganizerRegistration;
  tournamentId: string;
  pending: boolean;
  start: StartTransition;
  run: RunFn;
  setMsg: (m: string | null) => void;
}) {
  const [showUndo, setShowUndo] = useState(false);
  const status = reg.paymentStatus ?? 'none';
  const rejectionReason = (
    reg as OrganizerRegistration & { paymentRejectionReason?: string | null }
  ).paymentRejectionReason;
  const stateText: Record<string, string> = {
    none: 'Not paid',
    submitted: 'Receipt sent',
    verified: 'Verified',
    rejected: rejectionReason ? `Declined - ${rejectionReason}` : 'Declined',
    refunded: 'Refunded',
  };

  return (
    <div className="border-border rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-foreground text-sm font-medium">
          Team receipt
          {reg.amountDue != null && reg.currency && (
            <span className="text-foreground-muted tabular-nums">
              {' '}
              · {reg.currency} {reg.amountDue.toLocaleString()}
            </span>
          )}
        </span>
        <span
          className={`text-xs font-semibold ${
            status === 'verified'
              ? 'text-success'
              : status === 'rejected'
                ? 'text-danger'
                : status === 'submitted'
                  ? 'text-warning'
                  : 'text-foreground-muted'
          }`}
        >
          {stateText[status] ?? stateText.none}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {reg.hasProof && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await getProofSignedUrl(reg.paymentId as string, 'team');
                if (res.url) window.open(res.url, '_blank', 'noopener');
                else setMsg(res.error ?? 'Could not open proof.');
              })
            }
            className={`${btnSmall} border-border text-foreground border`}
          >
            View
          </button>
        )}
        {status === 'verified' && (
          <button
            type="button"
            onClick={() => setShowUndo((v) => !v)}
            className={`${btnSmall} border-border text-foreground border`}
          >
            Undo
          </button>
        )}
        {status === 'rejected' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => restorePayment(reg.paymentId as string, tournamentId, 'team'))}
            className={`${btnSmall} border-border text-foreground border`}
          >
            Restore
          </button>
        )}
      </div>
      {showUndo && (
        <InlineReasonPrompt
          placeholder="Reason for undoing this verification (required)"
          pending={pending}
          confirmLabel="Confirm undo"
          onConfirm={(r) =>
            run(async () => {
              const res = await unverifyPayment(reg.paymentId as string, tournamentId, 'team', r);
              if (res.ok) setShowUndo(false);
              return res;
            })
          }
          onCancel={() => setShowUndo(false)}
        />
      )}
    </div>
  );
}

function SeatLine({
  seat,
  slot,
  nameById,
  currency,
  coveredByTeamReceipt,
  teamPaymentId,
  isFirstReceipt,
  registrationId,
  tournamentId,
  pending,
  start,
  run,
  setMsg,
}: {
  seat: SeatSummary;
  slot: OrganizerRegistration['slots'][number] | undefined;
  nameById: Map<string, string>;
  currency: string | null;
  coveredByTeamReceipt: boolean;
  teamPaymentId: string | null;
  isFirstReceipt: boolean;
  registrationId: string;
  tournamentId: string;
  pending: boolean;
  start: StartTransition;
  run: RunFn;
  setMsg: (m: string | null) => void;
}) {
  const [showUndo, setShowUndo] = useState(false);
  const [showUndoCash, setShowUndoCash] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const name = seat.playerId ? (nameById.get(seat.playerId) ?? 'Player') : null;
  const firstName = name ? (name.split(/\s+/)[0] ?? name) : 'Open';
  const topupAmount = Math.max(0, seat.amountDue - seat.amountSubmitted);

  async function viewSlotProof(id: string, kind: 'team' | 'slot') {
    const res = await getProofSignedUrl(id, kind);
    if (res.url) window.open(res.url, '_blank', 'noopener');
    else setMsg(res.error ?? 'Could not open proof.');
  }

  if (coveredByTeamReceipt) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
        <span className="text-foreground-muted text-sm">{firstName}</span>
        <span className="flex items-center gap-1.5">
          <span className="text-foreground-muted text-xs">Covered by team receipt</span>
          {teamPaymentId && (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => viewSlotProof(teamPaymentId, 'team'))}
              className={`${btnSmall} border-border text-foreground border`}
            >
              View
            </button>
          )}
        </span>
      </li>
    );
  }

  if (!slot) {
    return (
      <li className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-foreground-muted text-sm">{firstName}</span>
          <span className="flex items-center gap-1.5">
            <span className="text-foreground-muted text-xs">Unpaid</span>
            {seat.playerId && (
              <button
                type="button"
                onClick={() => setShowMarkPaid((v) => !v)}
                className={`${btnSmall} border-border text-foreground border`}
              >
                Mark paid (cash)
              </button>
            )}
          </span>
        </div>
        {showMarkPaid && seat.playerId && (
          <InlineConfirm
            prompt={`Mark ${firstName}'s seat as paid in cash?`}
            confirmLabel="Yes, mark paid"
            pending={pending}
            onConfirm={() =>
              run(async () => {
                const res = await markSeatPaid(
                  registrationId,
                  seat.playerId as string,
                  tournamentId,
                );
                if (res.ok) setShowMarkPaid(false);
                return res;
              })
            }
            onCancel={() => setShowMarkPaid(false)}
          />
        )}
      </li>
    );
  }

  let label = 'Unpaid';
  let tone = 'text-foreground-muted';
  if (slot.status === 'verified') {
    label = slot.hasProof ? 'Paid' : 'Paid (cash)';
    tone = 'text-success';
  } else if (slot.status === 'rejected') {
    label = 'Declined';
    tone = 'text-danger';
  } else if (slot.status === 'submitted') {
    label =
      seat.state === 'topup'
        ? `Top-up needed (${currency ?? 'PHP'} ${topupAmount.toLocaleString()})`
        : 'Receipt sent';
    tone = 'text-warning';
  }

  const basisLabel = priceBasisLabel(slot.priceBasis);

  return (
    <li className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-foreground-muted text-sm">{firstName}</span>
        <span className="flex items-center gap-1.5">
          {/* Quiet: this is provenance for the amount next to it, not a status the organizer
              needs to act on (§2BQ). */}
          {basisLabel && (
            <span className="border-border text-foreground-muted inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]">
              {basisLabel}
            </span>
          )}
          <span className={`text-xs font-semibold tabular-nums ${tone}`}>{label}</span>
        </span>
      </div>
      {slot.rejectionReason && slot.status === 'rejected' && (
        <p className="text-danger text-[11px]">{slot.rejectionReason}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {slot.hasProof && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => viewSlotProof(slot.id, 'slot'))}
            className={`${btnSmall} border-border text-foreground border`}
          >
            View
          </button>
        )}
        {slot.status === 'submitted' && !isFirstReceipt && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => verifyPayment(slot.id, tournamentId, 'slot'))}
            className={`${btnSmall} vp-gradient text-white`}
          >
            Verify
          </button>
        )}
        {slot.status === 'verified' && slot.hasProof && (
          <button
            type="button"
            onClick={() => setShowUndo((v) => !v)}
            className={`${btnSmall} border-border text-foreground border`}
          >
            Undo
          </button>
        )}
        {slot.status === 'verified' && !slot.hasProof && (
          <button
            type="button"
            onClick={() => setShowUndoCash((v) => !v)}
            className={`${btnSmall} border-border text-foreground border`}
          >
            Undo
          </button>
        )}
        {slot.status === 'rejected' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => restorePayment(slot.id, tournamentId, 'slot'))}
            className={`${btnSmall} border-border text-foreground border`}
          >
            Restore
          </button>
        )}
      </div>
      {showUndo && (
        <InlineReasonPrompt
          placeholder="Reason for undoing this verification (required)"
          pending={pending}
          confirmLabel="Confirm undo"
          onConfirm={(r) =>
            run(async () => {
              const res = await unverifyPayment(slot.id, tournamentId, 'slot', r);
              if (res.ok) setShowUndo(false);
              return res;
            })
          }
          onCancel={() => setShowUndo(false)}
        />
      )}
      {showUndoCash && (
        <InlineConfirm
          prompt={`Undo ${firstName}'s cash payment?`}
          confirmLabel="Yes, undo"
          pending={pending}
          onConfirm={() =>
            run(async () => {
              const res = await undoSeatPaid(slot.id, tournamentId);
              if (res.ok) setShowUndoCash(false);
              return res;
            })
          }
          onCancel={() => setShowUndoCash(false)}
        />
      )}
    </li>
  );
}

export function PaymentSection({
  reg,
  tournamentId,
  isFree,
  pending,
  start,
  run,
  setMsg,
  nameById,
}: {
  reg: OrganizerRegistration;
  tournamentId: string;
  isFree: boolean;
  pending: boolean;
  start: StartTransition;
  run: RunFn;
  setMsg: (m: string | null) => void;
  nameById: Map<string, string>;
}) {
  const summary = reg.paymentSummary;
  const firstReceipt = firstSubmittedReceipt(reg);
  const slotByPlayer = new Map((reg.slots ?? []).map((s) => [s.playerId, s]));
  const teamReceiptCoversAll =
    summary && (summary.teamReceipt === 'verified' || summary.teamReceipt === 'submitted');
  const hasSeatSlots = (reg.slots ?? []).length > 0;
  // master_plan §2BH Decision F: a team receipt that covers every seat, with no seat ever carrying its
  // own receipt, collapses to ONE row - no "MOH · Covered by team receipt" / "Open · Covered by team
  // receipt" noise underneath it. Mixed payment (some seats paid individually) still lists seats.
  const collapseToTeamOnly = !!reg.paymentId && !!teamReceiptCoversAll && !hasSeatSlots;
  // Overpayment (master_plan §2AP C6, kept in §2BH): the team receipt already covers every seat but a
  // seat also carries its own receipt - a likely duplicate payment. One quiet line, never absorbed.
  const hasOverpayment = !!teamReceiptCoversAll && hasSeatSlots;

  return (
    <section className="px-4 sm:px-5">
      <h3 className="text-foreground-muted text-[11px] font-semibold tracking-wide uppercase">
        Payment
      </h3>
      {isFree ? (
        <p className="text-foreground-muted mt-1.5 text-sm">Free entry</p>
      ) : (
        <div className="border-border mt-1.5 space-y-2.5 rounded-xl border p-3">
          {hasOverpayment && (
            <p className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              Extra receipt on file — the team receipt already covers every seat.
            </p>
          )}
          {reg.paymentId && (
            <>
              <TeamReceiptLine
                reg={reg}
                tournamentId={tournamentId}
                pending={pending}
                start={start}
                run={run}
                setMsg={setMsg}
              />
              {collapseToTeamOnly && (
                <p className="text-foreground-muted px-0.5 text-xs">
                  {reg.teamSize > 1 ? 'Covers both seats' : 'Covers the entry'}
                </p>
              )}
            </>
          )}
          {!collapseToTeamOnly && summary && (
            <ul className="divide-border divide-y">
              {summary.seats
                // Never a seat line for an open seat with no slot (master_plan §2BH Decision F) - a
                // seat only ever has a slot when it has a playerId, so this is exactly "skip empty
                // seats".
                .filter((seat) => seat.playerId != null)
                .map((seat) => {
                  const slot = slotByPlayer.get(seat.playerId as string);
                  const isFirst =
                    firstReceipt?.kind === 'slot' && !!slot && firstReceipt.id === slot.id;
                  return (
                    <SeatLine
                      key={seat.playerId}
                      seat={seat}
                      slot={slot}
                      nameById={nameById}
                      currency={reg.currency}
                      coveredByTeamReceipt={!!teamReceiptCoversAll && !slot}
                      teamPaymentId={reg.paymentId}
                      isFirstReceipt={isFirst}
                      registrationId={reg.id}
                      tournamentId={tournamentId}
                      pending={pending}
                      start={start}
                      run={run}
                      setMsg={setMsg}
                    />
                  );
                })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// More sheet - list + step views
// ---------------------------------------------------------------------------

export interface MoreListItem {
  key: string;
  label: string;
  icon: LucideIcon;
  tone?: 'danger';
  onSelect: () => void;
}

export function MoreList({ items, onBack }: { items: MoreListItem[]; onBack: () => void }) {
  return (
    <div className="px-2 pb-2 sm:px-3">
      {items.length === 0 && (
        <p className="text-foreground-muted px-3 py-6 text-center text-sm">
          Nothing else to do here.
        </p>
      )}
      <ul>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={item.onSelect}
                className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium ${
                  item.tone === 'danger'
                    ? 'text-danger hover:bg-danger/10'
                    : 'text-foreground hover:bg-surface-muted'
                }`}
              >
                <Icon size={18} aria-hidden />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onBack}
        className="text-foreground-muted hover:text-foreground mt-1 min-h-11 px-3 text-sm font-medium"
      >
        Back
      </button>
    </div>
  );
}

/** A generic focused step: title, optional reason input, one primary button, Back. Fits Move back to
 *  review / Reject / Restore / Refund / Skill review - the five step kinds whose shape is "reason,
 *  then one decision" (master_plan §2BG Decision E "⋯ More sheet"). */
export function ReasonStepView({
  title,
  description,
  placeholder,
  minLen,
  primaryLabel,
  primaryTone = 'default',
  pending,
  onSubmit,
  onBack,
}: {
  title: string;
  description?: string;
  placeholder: string;
  /** 0 = optional. */
  minLen: number;
  primaryLabel: string;
  primaryTone?: 'default' | 'danger';
  pending: boolean;
  onSubmit: (reason: string) => void;
  onBack: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="space-y-3 px-4 pb-2 sm:px-5">
      <h3 className="text-foreground text-base font-semibold">{title}</h3>
      {description && <p className="text-foreground-muted text-sm">{description}</p>}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="border-border bg-background min-h-11 w-full rounded-xl border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || value.trim().length < minLen}
          onClick={() => onSubmit(value.trim())}
          className={`${btn} text-white ${primaryTone === 'danger' ? 'bg-danger/90' : 'vp-gradient'}`}
        >
          {primaryLabel}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-foreground-muted hover:text-foreground min-h-11 px-3 text-sm font-medium"
        >
          Back
        </button>
      </div>
    </div>
  );
}

export function ReclassifyStepView({
  targets,
  pending,
  onSubmit,
  onBack,
}: {
  targets: (EligibilityDivisionOption & { registered?: number; capacity?: number })[];
  pending: boolean;
  onSubmit: (divisionId: string, reason: string) => void;
  onBack: () => void;
}) {
  const [chosen, setChosen] = useState('');
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-3 px-4 pb-2 sm:px-5">
      <h3 className="text-foreground text-base font-semibold">Reclassify division</h3>
      {targets.length === 0 ? (
        <p className="text-foreground-muted text-sm">
          No other division shares this format and team size.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Move to division" className="space-y-1.5">
          {targets.map((d) => {
            const active = chosen === d.id;
            const hasCapacity = typeof d.registered === 'number' && typeof d.capacity === 'number';
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setChosen(d.id)}
                className={`flex min-h-11 w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-foreground-muted hover:border-primary/40 hover:text-foreground'
                }`}
              >
                <span>{d.name}</span>
                {hasCapacity && (
                  <span className="tabular-nums">
                    {d.registered}/{d.capacity}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="border-border bg-background min-h-11 w-full rounded-xl border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !chosen}
          onClick={() => onSubmit(chosen, reason.trim())}
          className={`${btn} vp-gradient text-white`}
        >
          Move
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-foreground-muted hover:text-foreground min-h-11 px-3 text-sm font-medium"
        >
          Back
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Award picker (§9.4) - unchanged behaviour, compact, bottom of the card.
// ---------------------------------------------------------------------------

export function AwardPicker({
  tournamentId,
  teamId,
  pending,
  run,
}: {
  tournamentId: string;
  teamId: string;
  pending: boolean;
  run: RunFn;
}) {
  const [award, setAward] = useState<string>(OFFICIAL_ACHIEVEMENTS[0].key);
  return (
    <section className="px-4 sm:px-5">
      <div className="border-border flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3">
        <span className="text-foreground-muted text-xs font-semibold">Award:</span>
        <select
          value={award}
          onChange={(e) => setAward(e.target.value)}
          className="border-border bg-background min-h-9 rounded-lg border px-2 text-xs"
        >
          {OFFICIAL_ACHIEVEMENTS.map((a) => (
            <option key={a.key} value={a.key}>
              {a.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => issueOfficialAchievement(tournamentId, teamId, award))}
          className={`${btnSmall} vp-gradient text-white`}
        >
          Issue
        </button>
      </div>
    </section>
  );
}
