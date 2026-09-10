'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Clock, Receipt, Search, TriangleAlert } from 'lucide-react';
import { skillByOrdinal, OFFICIAL_ACHIEVEMENTS } from '@vouchplay/config';
import { formatDate } from '@/lib/format-date';
import {
  ELIGIBILITY_RESULT_LABELS,
  ELIGIBILITY_RESULT_DESCRIPTIONS,
  HARD_RULE_LABELS,
  REASON_LABELS,
  FLAG_LABELS,
} from '@vouchplay/core';
import { confirmRegistration, rejectRegistration } from '@/lib/actions/registration';
import {
  approveEligibility,
  reclassifyRegistration,
  requestSkillReviewForRegistration,
} from '@/lib/actions/eligibility';
import { issueOfficialAchievement } from '@/lib/actions/achievements';
import {
  verifyPayment,
  rejectPayment,
  markRefunded,
  getProofSignedUrl,
} from '@/lib/actions/payment';
import type { OrganizerRegistration } from '@/lib/tournaments/registration-queries';
import {
  amountLabel,
  countEntries,
  DEFAULT_FILTERS,
  filterEntries,
  hasUnconfirmedPartner,
  sortEntries,
  statusChip,
  teamLabel,
  type EntryFilters,
  type StatusChip,
} from '@/lib/tournaments/entry-view';
import { Modal } from '@/components/ui/modal';

export interface EligibilityDivisionOption {
  id: string;
  name: string;
  format: string;
  teamSize: number;
}

type ActionResult = { ok?: boolean; error?: string; message?: string };

/**
 * Organizer registrations (handover §26.4, master_plan §1Z).
 *
 * Rebuilt as a list of rows plus a detail sheet, the shape a form-response tool uses, because the
 * previous screen expanded every entry inline: withdrawn entries filled the page by default, the
 * people in a team were buried under controls, and there was no way to see the applicants at a
 * glance or to find the ones that needed a decision.
 *
 * The organising principle is: the list answers "who is here and what needs me?", and the sheet
 * answers "everything about this one entry". Nothing that needs a decision is more than two taps
 * away, and nothing that does not need a decision takes up space.
 */
export function OrganizerRegistrations({
  tournamentId,
  registrations,
  divisions,
}: {
  tournamentId: string;
  registrations: OrganizerRegistration[];
  divisions: EligibilityDivisionOption[];
}) {
  const [filters, setFilters] = useState<EntryFilters>(DEFAULT_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);

  if (registrations.length === 0) {
    return <p className="text-foreground-muted text-sm">No registrations yet.</p>;
  }

  const counts = countEntries(registrations);
  const visible = sortEntries(filterEntries(registrations, filters));
  const selected = registrations.find((r) => r.id === openId) ?? null;

  // Queues, not statuses. A status list makes an organizer translate database words into decisions;
  // these are the decisions, each with a live count so an empty queue is visibly empty.
  const queues: { key: EntryFilters['queue']; label: string; count: number }[] = [
    { key: 'all', label: 'All open', count: counts.open },
    { key: 'needs_payment_review', label: 'Check payment', count: counts.needsPaymentReview },
    { key: 'cancellation_requested', label: 'Cancellations', count: counts.cancellationRequested },
    { key: 'needs_eligibility_review', label: 'Eligibility', count: counts.needsEligibilityReview },
  ];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={15}
          className="text-foreground-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          aria-hidden
        />
        <input
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          placeholder="Search a player or team"
          aria-label="Search registrations by player name"
          className="border-border bg-background text-foreground placeholder:text-foreground-muted min-h-[44px] w-full rounded-xl border pr-3 pl-9 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {queues.map((q) => {
          const active = filters.queue === q.key;
          const urgent = q.key !== 'all' && q.count > 0;
          return (
            <button
              key={q.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilters({ ...filters, queue: q.key })}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${
                active
                  ? 'vp-gradient border-transparent text-white'
                  : urgent
                    ? 'border-warning/40 bg-warning/10 text-foreground'
                    : 'border-border text-foreground-muted'
              }`}
            >
              {q.label}
              <span className={active ? 'text-white/80' : 'text-foreground-muted'}>{q.count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.divisionName}
          onChange={(e) => setFilters({ ...filters, divisionName: e.target.value })}
          className="border-border bg-background text-foreground min-h-[44px] rounded-xl border px-3 text-xs"
        >
          <option value="all">All divisions</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
        {/* Closed entries are history, not work, so they are out of the way until asked for. */}
        <label className="text-foreground-muted flex min-h-[44px] cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={filters.includeClosed}
            onChange={(e) => setFilters({ ...filters, includeClosed: e.target.checked })}
            className="h-4 w-4"
          />
          Show cancelled and withdrawn ({counts.closed})
        </label>
        <span className="text-foreground-muted ml-auto text-xs">{visible.length} shown</span>
      </div>

      {visible.length === 0 ? (
        <p className="text-foreground-muted text-sm">
          Nothing here.{' '}
          {filters.queue !== 'all' ? 'That queue is clear.' : 'Try a different filter.'}
        </p>
      ) : (
        <ul className="border-border divide-border divide-y overflow-hidden rounded-2xl border">
          {visible.map((r) => (
            <EntryRow key={r.id} entry={r} onOpen={() => setOpenId(r.id)} />
          ))}
        </ul>
      )}

      {selected && (
        <Modal
          title={teamLabel(selected)}
          subtitle={selected.divisionName}
          onClose={() => setOpenId(null)}
          align="center"
        >
          <RegRow tournamentId={tournamentId} reg={selected} divisions={divisions} />
        </Modal>
      )}
    </div>
  );
}

const TONE_STYLES: Record<StatusChip['tone'], string> = {
  action: 'border-warning/40 bg-warning/10 text-warning',
  waiting: 'border-border text-foreground-muted',
  done: 'border-success/30 bg-success/10 text-success',
  closed: 'border-border text-foreground-muted opacity-70',
};

/**
 * One entry, scannable in a glance: who, which division, what it needs, how much. The whole row is
 * the control - a small "Manage" link beside a tall row is a smaller target than the row itself.
 */
function EntryRow({ entry, onOpen }: { entry: OrganizerRegistration; onOpen: () => void }) {
  const chip = statusChip(entry);
  const amount = amountLabel(entry);
  const unconfirmed = hasUnconfirmedPartner(entry);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="hover:bg-surface-muted flex w-full items-center gap-3 px-3 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="text-foreground block truncate text-sm font-semibold">
            {teamLabel(entry)}
          </span>
          <span className="text-foreground-muted mt-0.5 block truncate text-xs">
            {entry.divisionName}
            {amount ? ` · ${amount}` : ''}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_STYLES[chip.tone]}`}
            >
              {chip.label}
            </span>
            {unconfirmed && (
              <span className="border-border text-foreground-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
                <Clock size={10} aria-hidden />
                Partner not confirmed
              </span>
            )}
            {entry.eligibilityStatus !== 'eligible' && (
              <span className="border-warning/40 bg-warning/10 text-warning inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                <TriangleAlert size={10} aria-hidden />
                {statusToLabel(entry.eligibilityStatus)}
              </span>
            )}
            {entry.hasProof && (
              <span className="border-border text-foreground-muted inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
                <Receipt size={10} aria-hidden />
                Receipt
              </span>
            )}
          </span>
        </span>
        <ChevronRight size={16} className="text-foreground-muted shrink-0" aria-hidden />
      </button>
    </li>
  );
}

const ELIG_STYLES: Record<string, string> = {
  eligible: 'bg-success/10 text-success border-success/30',
  review: 'bg-warning/10 text-warning border-warning/30',
  skill_mismatch: 'bg-warning/10 text-warning border-warning/30',
  ineligible_hard_rule: 'bg-danger/10 text-danger border-danger/30',
};

interface SnapshotPlayer {
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
interface Snapshot {
  result?: string;
  hardRuleCodes?: string[];
  reasonCodes?: string[];
  flags?: string[];
  players?: SnapshotPlayer[];
  override?: { by: string; at: string; reason: string | null } | null;
}

function RegRow({
  tournamentId,
  reg,
  divisions,
}: {
  tournamentId: string;
  reg: OrganizerRegistration;
  divisions: EligibilityDivisionOption[];
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [award, setAward] = useState<string>(OFFICIAL_ACHIEVEMENTS[0].key);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<ActionResult>) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      setMsg(res.error ?? res.message ?? null);
      if (res.ok) router.refresh();
    });
  }

  const terminal = ['confirmed', 'withdrawn', 'cancelled', 'rejected'].includes(reg.status);
  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50';
  const nameById = new Map(reg.members.map((m) => [m.id, m.name]));

  return (
    <div>
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

      {/* Eligibility decision-support (§25.5) - neutral, evidence-based. */}
      <EligibilityPanel
        reg={reg}
        tournamentId={tournamentId}
        divisions={divisions}
        nameById={nameById}
        pending={pending}
        run={run}
      />

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

      {/* Cancellation request (§1Y, §2L) - the reason was fetched but never shown, so the organizer
          could see "Cancellation asked" without knowing why. Now the player's own words are here. */}
      {reg.cancellationRequest && (
        <div className="border-warning/40 bg-warning/10 mt-2 rounded-lg border p-2.5">
          <p className="text-warning flex items-center gap-1.5 text-xs font-semibold">
            <TriangleAlert size={13} aria-hidden />
            Cancellation requested
          </p>
          <p className="text-foreground mt-1 text-sm whitespace-pre-wrap">
            &ldquo;{reg.cancellationRequest.reason}&rdquo;
          </p>
          <p className="text-foreground-muted mt-1 text-xs">
            Asked {formatDate(reg.cancellationRequest.requestedAt)}. To cancel this entry, use
            Reject above; anything about the payment is settled with the player directly.
          </p>
        </div>
      )}

      {/* Awards (§9.4) - issue an official achievement to a confirmed team. */}
      {reg.status === 'confirmed' && (
        <div className="border-border mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed p-2">
          <span className="text-foreground-muted text-xs">Award:</span>
          <select
            value={award}
            onChange={(e) => setAward(e.target.value)}
            className="border-border bg-background rounded-lg border px-2 py-1 text-xs"
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
            onClick={() => run(() => issueOfficialAchievement(tournamentId, reg.teamId, award))}
            className={`${btn} vp-gradient text-white`}
          >
            Issue
          </button>
        </div>
      )}

      {msg && <p className="text-foreground-muted mt-1 text-xs">{msg}</p>}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="border-border text-foreground-muted rounded-full border px-2 py-0.5 text-[11px]">
      {children}
    </span>
  );
}

function EligibilityPanel({
  reg,
  tournamentId,
  divisions,
  nameById,
  pending,
  run,
}: {
  reg: OrganizerRegistration;
  tournamentId: string;
  divisions: EligibilityDivisionOption[];
  nameById: Map<string, string>;
  pending: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
}) {
  const snap = (reg.eligibilitySnapshot ?? {}) as Snapshot;
  const status = reg.eligibilityStatus;
  const isEligible = status === 'eligible';
  const isHardRule = status === 'ineligible_hard_rule';

  const [open, setOpen] = useState(!isEligible);
  const [approveReason, setApproveReason] = useState('');
  const [showApprove, setShowApprove] = useState(false);
  const [showReclass, setShowReclass] = useState(false);
  const [reclassDiv, setReclassDiv] = useState('');
  const [reclassReason, setReclassReason] = useState('');
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('');

  const resultKey = snap.result as keyof typeof ELIGIBILITY_RESULT_LABELS | undefined;
  const label =
    resultKey && ELIGIBILITY_RESULT_LABELS[resultKey]
      ? ELIGIBILITY_RESULT_LABELS[resultKey]
      : statusToLabel(status);
  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50';
  const sameDivisionTargets = divisions.filter((d) => d.id !== reg.divisionId);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
          ELIG_STYLES[status] ?? 'border-border text-foreground-muted'
        }`}
      >
        {label}
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="border-border mt-2 rounded-lg border border-dashed p-2.5">
          <p className="text-foreground-muted text-[11px]">
            {ELIGIBILITY_RESULT_DESCRIPTIONS[
              (snap.result as keyof typeof ELIGIBILITY_RESULT_DESCRIPTIONS) ?? 'ELIGIBLE'
            ] ?? 'Decision support - your call.'}
          </p>

          {/* Per-player neutral evidence */}
          <div className="mt-2 space-y-1.5">
            {(snap.players ?? []).map((p) => {
              const csl =
                p.communitySkillLevel != null ? skillByOrdinal(p.communitySkillLevel) : null;
              return (
                <div key={p.playerId} className="text-xs">
                  <div className="text-foreground font-medium">
                    {nameById.get(p.playerId) ?? 'Player'}
                  </div>
                  <div className="text-foreground-muted mt-0.5 flex flex-wrap gap-1.5">
                    <Chip>Community skill: {csl ? csl.label : 'Unrated'}</Chip>
                    <Chip>STS: {p.sts.toFixed(1)} / 5</Chip>
                    <Chip>Active vouches: {p.uniqueVoucherCount}</Chip>
                    {p.skillVerified && <Chip>Skill-Verified</Chip>}
                  </div>
                  {(p.hardRuleCodes.length > 0 ||
                    p.reasonCodes.length > 0 ||
                    p.flags.length > 0) && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {p.hardRuleCodes.map((c) => (
                        <span key={c} className="text-danger text-[11px]">
                          • {HARD_RULE_LABELS[c as keyof typeof HARD_RULE_LABELS] ?? c}
                        </span>
                      ))}
                      {p.reasonCodes.map((c) => (
                        <span key={c} className="text-warning text-[11px]">
                          • {REASON_LABELS[c as keyof typeof REASON_LABELS] ?? c}
                        </span>
                      ))}
                      {p.flags.map((c) => (
                        <span key={c} className="text-foreground-muted text-[11px]">
                          • {FLAG_LABELS[c as keyof typeof FLAG_LABELS] ?? c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {snap.override && (
            <p className="text-foreground-muted mt-2 text-[11px]">
              Overridden by an organizer{snap.override.reason ? ` - "${snap.override.reason}"` : ''}
              .
            </p>
          )}

          {/* Actions (§25.5) */}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {!isEligible && (
              <button
                type="button"
                onClick={() => setShowApprove((v) => !v)}
                className={`${btn} vp-gradient text-white`}
              >
                Approve
              </button>
            )}
            {sameDivisionTargets.length > 0 && (
              <button
                type="button"
                onClick={() => setShowReclass((v) => !v)}
                className={`${btn} border-border text-foreground border`}
              >
                Reclassify
              </button>
            )}
          </div>

          {showApprove && (
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={approveReason}
                onChange={(e) => setApproveReason(e.target.value)}
                placeholder={
                  isHardRule ? 'Reason (required to override a rule)' : 'Reason (optional)'
                }
                className="border-border bg-background min-w-[12rem] flex-1 rounded-lg border px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              <button
                type="button"
                disabled={pending || (isHardRule && !approveReason.trim())}
                onClick={() => run(() => approveEligibility(reg.id, tournamentId, approveReason))}
                className={`${btn} vp-gradient text-white`}
              >
                Confirm approve
              </button>
            </div>
          )}

          {showReclass && (
            <div className="mt-2 flex flex-wrap gap-2">
              <select
                value={reclassDiv}
                onChange={(e) => setReclassDiv(e.target.value)}
                className="border-border bg-background rounded-lg border px-2.5 py-1.5 text-xs"
              >
                <option value="">Move to division…</option>
                {sameDivisionTargets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <input
                value={reclassReason}
                onChange={(e) => setReclassReason(e.target.value)}
                placeholder="Reason (optional)"
                className="border-border bg-background min-w-[10rem] flex-1 rounded-lg border px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              <button
                type="button"
                disabled={pending || !reclassDiv}
                onClick={() =>
                  run(() => reclassifyRegistration(reg.id, tournamentId, reclassDiv, reclassReason))
                }
                className={`${btn} border-border text-foreground border`}
              >
                Move
              </button>
            </div>
          )}

          {/* Request skill review per member (§25.5) */}
          <div className="mt-2.5">
            <p className="text-foreground-muted text-[11px]">Request a skill review:</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(snap.players ?? []).map((p) => (
                <button
                  key={p.playerId}
                  type="button"
                  onClick={() => {
                    setReviewFor((cur) => (cur === p.playerId ? null : p.playerId));
                    setReviewReason('');
                  }}
                  className={`${btn} border-border text-foreground border`}
                >
                  {nameById.get(p.playerId) ?? 'Player'}
                </button>
              ))}
            </div>
            {reviewFor && (
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  placeholder="Why this review? (required)"
                  className="border-border bg-background min-w-[12rem] flex-1 rounded-lg border px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
                />
                <button
                  type="button"
                  disabled={pending || !reviewReason.trim()}
                  onClick={() =>
                    run(() =>
                      requestSkillReviewForRegistration(
                        reg.id,
                        tournamentId,
                        reviewFor,
                        reviewReason,
                      ),
                    )
                  }
                  className={`${btn} vp-gradient text-white`}
                >
                  Submit review
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function statusToLabel(status: string): string {
  const map: Record<string, string> = {
    eligible: 'Eligible',
    review: 'Needs review',
    skill_mismatch: 'Potential skill mismatch',
    ineligible_hard_rule: 'Does not meet a division rule',
  };
  return map[status] ?? status.replace(/_/g, ' ');
}
