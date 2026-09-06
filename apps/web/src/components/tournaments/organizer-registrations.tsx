'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { skillByOrdinal, OFFICIAL_ACHIEVEMENTS } from '@vouchplay/config';
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

export interface EligibilityDivisionOption {
  id: string;
  name: string;
  format: string;
  teamSize: number;
}

type ActionResult = { ok?: boolean; error?: string; message?: string };

const ELIG_FILTER_LABELS: Record<string, string> = {
  eligible: 'Eligible',
  review: 'Needs review',
  skill_mismatch: 'Potential skill mismatch',
  ineligible_hard_rule: 'Does not meet a rule',
};

/** Organizer registrations dashboard (handover §26.4) with filters + the §25.5 eligibility support. */
export function OrganizerRegistrations({
  tournamentId,
  registrations,
  divisions,
}: {
  tournamentId: string;
  registrations: OrganizerRegistration[];
  divisions: EligibilityDivisionOption[];
}) {
  const [division, setDivision] = useState('all');
  const [status, setStatus] = useState('all');
  const [eligibility, setEligibility] = useState('all');
  const [payment, setPayment] = useState('all');

  if (registrations.length === 0) {
    return <p className="text-foreground-muted text-sm">No registrations yet.</p>;
  }

  const statusOptions = Array.from(new Set(registrations.map((r) => r.status))).sort();
  const paymentOptions = Array.from(
    new Set(registrations.map((r) => r.paymentStatus).filter((p): p is string => !!p)),
  ).sort();
  const eligibilityOptions = Array.from(new Set(registrations.map((r) => r.eligibilityStatus)));

  const filtered = registrations.filter(
    (r) =>
      (division === 'all' || r.divisionName === division) &&
      (status === 'all' || r.status === status) &&
      (eligibility === 'all' || r.eligibilityStatus === eligibility) &&
      (payment === 'all' || (r.paymentStatus ?? '') === payment),
  );

  const byDivision = new Map<string, OrganizerRegistration[]>();
  for (const r of filtered) {
    const arr = byDivision.get(r.divisionName) ?? [];
    arr.push(r);
    byDivision.set(r.divisionName, arr);
  }

  const sel =
    'border-border bg-background rounded-lg border px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <div className="space-y-4">
      {/* Filters (§26.4) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={division} onChange={(e) => setDivision(e.target.value)} className={sel}>
          <option value="all">All divisions</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
          <option value="all">Any status</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <select
          value={eligibility}
          onChange={(e) => setEligibility(e.target.value)}
          className={sel}
        >
          <option value="all">Any eligibility</option>
          {eligibilityOptions.map((s) => (
            <option key={s} value={s}>
              {ELIG_FILTER_LABELS[s] ?? s}
            </option>
          ))}
        </select>
        {paymentOptions.length > 0 && (
          <select value={payment} onChange={(e) => setPayment(e.target.value)} className={sel}>
            <option value="all">Any payment</option>
            {paymentOptions.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        )}
        <span className="text-foreground-muted text-xs">
          {filtered.length} of {registrations.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-foreground-muted text-sm">No registrations match these filters.</p>
      ) : (
        [...byDivision.entries()].map(([divisionName, regs]) => (
          <div key={divisionName}>
            <h3 className="text-foreground mb-2 text-sm font-semibold">{divisionName}</h3>
            <ul className="space-y-2">
              {regs.map((r) => (
                <RegRow key={r.id} tournamentId={tournamentId} reg={r} divisions={divisions} />
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
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
    </li>
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
