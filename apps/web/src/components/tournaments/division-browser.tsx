'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronDown, Coins, ShieldCheck, Users } from 'lucide-react';
import { describeDivisionFit, effectivePlayerSkill, evaluateDivisionFit } from '@vouchplay/core';
import { SKILL_BANDS } from '@vouchplay/config';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { RegisterActions } from './register-actions';
import { PartnerInviteForm } from './partner-invite-form';
import { quoteFee, formatFee } from '@vouchplay/core';
import { InvitationActions } from './invitation-actions';
import { PartnerChangeActions } from './partner-change-actions';
import { describeRegistrationStatus, type SlotTone } from '@/lib/tournaments/registration-status';

/** Chip colour by tone. Green is reserved for a genuinely secured (confirmed) entry (§2G). */
const TONE_CHIP: Record<SlotTone, string> = {
  action: 'text-warning',
  waiting: 'text-foreground-muted',
  done: 'text-success',
};

export interface EarlyBirdWindow {
  startsAt: string | null;
  endsAt: string | null;
}

/**
 * Collapsed-by-default division browser (handover Phase 13.5, §1D). Public facts for every division;
 * for a signed-in player during open registration each division also offers the right register
 * action, so a player with one entry can still enter other divisions without hunting. Divisions the
 * player already holds link back to My registrations instead of repeating the action.
 */

// fee_amount IS the per-player price since migration 0026 - it is no longer divided by team size
// (§1V). Dividing again would quietly halve every quoted price.
function moneyPerPlayer(d: DivisionDTO, earlyBird: EarlyBirdWindow): string {
  const quote = quoteFee({
    feeAmount: d.feeAmount,
    earlyBirdFeeAmount: d.earlyBirdFeeAmount,
    earlyBirdStartsAt: earlyBird.startsAt,
    earlyBirdEndsAt: earlyBird.endsAt,
    teamSize: d.teamSize,
  });
  if (quote.perPlayer <= 0) return 'Free';
  const base = `${formatFee(d.currency, quote.perPlayer)} / player`;
  return quote.earlyBirdApplied
    ? `${base} (early bird, was ${formatFee(d.currency, quote.standardPerPlayer)})`
    : base;
}

/** The band a division is for, in words - "Beginner", or "Beginner to Novice". Null when open. */
function bandLabelFor(d: {
  skillPolicy: string;
  minimumSkill: number | null;
  maximumSkill: number | null;
}) {
  if (d.skillPolicy === 'open') return null;
  const label = (o: number | null) =>
    o == null ? null : (SKILL_BANDS.find((b) => b.ordinal === o)?.label ?? null);
  const min = label(d.minimumSkill);
  const max = label(d.maximumSkill);
  if (min && max) return min === max ? min : `${min} to ${max}`;
  return min ?? max;
}

function skillLabelFor(ordinal: number | null) {
  if (ordinal == null) return null;
  return SKILL_BANDS.find((b) => b.ordinal === ordinal)?.label ?? null;
}

export function DivisionBrowser({
  tournamentId,
  divisions,
  state,
  registrationOpen,
  authed,
  signInHref,
  requireSkillVerified,
  enforceSkillFloor,
  earlyBird = { startsAt: null, endsAt: null },
}: {
  tournamentId: string;
  divisions: DivisionDTO[];
  state: ViewerRegistrationState | null;
  registrationOpen: boolean;
  authed: boolean;
  signInHref: string;
  /** Tournament-wide early-bird window; every division shares it (§1V). */
  earlyBird?: EarlyBirdWindow;
  requireSkillVerified: boolean;
  /** Organizer setting: players may not enter a division below their own level (§2F). */
  enforceSkillFloor: boolean;
}) {
  const visible = divisions.filter((d) => d.status !== 'draft' && d.status !== 'cancelled');
  const registeredIds = new Set(state ? Object.keys(state.registrationsByDivision) : []);
  const invitations = state?.invitations ?? [];
  const effectiveSkill = state
    ? effectivePlayerSkill(
        state.viewerSkill.communitySkillLevel,
        state.viewerSkill.selfRatedSkillLevel,
      )
    : null;
  const [onlyJoinable, setOnlyJoinable] = useState(false);

  // Fit is computed once for every division, up front, because it is needed twice: to render the
  // reason on a row, and to count and filter the ones this player can actually enter (§2F).
  const rows = visible.map((d) => {
    const fit = state
      ? evaluateDivisionFit({
          playerSex: state.viewerSkill.sex,
          effectiveSkill,
          sexClassification: d.sexClassification,
          skillPolicy: d.skillPolicy,
          divisionMinimumSkill: d.minimumSkill,
          divisionMaximumSkill: d.maximumSkill,
          enforceSkillFloor,
        })
      : { fits: true, reason: null };
    return {
      d,
      fit,
      fitMessage:
        !fit.fits && fit.reason
          ? describeDivisionFit(fit.reason, {
              subject: 'you',
              divisionName: d.name,
              bandLabel: bandLabelFor(d),
              playerLevel: skillLabelFor(effectiveSkill),
            })
          : null,
    };
  });
  const joinable = rows.filter((r) => r.fit.fits).length;
  // Worth offering only when it would actually hide something. A filter that changes nothing is
  // one more control to read past.
  const canFilter = authed && joinable < rows.length;
  const shown = onlyJoinable && canFilter ? rows.filter((r) => r.fit.fits) : rows;

  return (
    <details className="border-border bg-surface rounded-2xl border">
      <summary className="text-foreground flex cursor-pointer list-none items-center gap-2 p-4 text-base font-semibold">
        Divisions ({visible.length})
        <span className="text-foreground-muted ml-auto text-xs font-normal">
          {registrationOpen && authed ? 'Register' : 'Show'}
        </span>
      </summary>

      {requireSkillVerified && (
        <p className="text-foreground-muted border-border flex items-center gap-1.5 border-t px-4 py-3 text-xs">
          <ShieldCheck size={14} aria-hidden />
          This tournament requires Skill Verified players in every division.
        </p>
      )}

      {canFilter && (
        <div className="border-border border-t px-4 py-3">
          {/* A plain labelled switch, not an icon. The whole row is the target and the count is in
              the label, so the control says what it will do before it is touched (§2F). */}
          <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="text-foreground block text-sm font-medium">
                Only show divisions I can join
              </span>
              <span className="text-foreground-muted block text-xs">
                {joinable} of {rows.length} match your profile
              </span>
            </span>
            <span className="relative shrink-0">
              <input
                type="checkbox"
                checked={onlyJoinable}
                onChange={(e) => setOnlyJoinable(e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="border-border bg-surface-muted peer-checked:bg-primary peer-checked:border-primary peer-focus-visible:ring-primary/50 block h-6 w-11 rounded-full border transition-colors peer-focus-visible:ring-2"
              />
              <span
                aria-hidden
                className="absolute top-0.5 left-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
              />
            </span>
          </label>
        </div>
      )}

      {invitations.length > 0 && (
        <div className="border-border border-t px-4 py-3">
          <h3 className="text-foreground mb-2 text-sm font-semibold">Partner invitations</h3>
          <ul className="space-y-2">
            {invitations.map((i) => (
              <li
                key={i.id}
                className={`border-border bg-surface-muted gap-2 rounded-xl border p-2.5 ${
                  i.prepaid && i.direction === 'incoming'
                    ? 'flex flex-col items-start'
                    : 'flex items-center justify-between'
                }`}
              >
                <span className="text-foreground text-sm">
                  {i.direction === 'incoming' ? 'From ' : 'To '}
                  {i.otherSlug ? (
                    <Link href={`/players/${i.otherSlug}`} className="text-primary font-medium">
                      {i.otherName}
                    </Link>
                  ) : (
                    <span className="font-medium">{i.otherName}</span>
                  )}
                </span>
                <InvitationActions
                  invitationId={i.id}
                  direction={i.direction}
                  prepaid={i.prepaid}
                  partnerName={i.otherName}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-foreground-muted border-border border-t p-4 text-sm">
          No divisions published yet.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-foreground-muted border-border border-t p-4 text-sm">
          None of the divisions in this tournament match your profile. Turn the filter off to see
          them all and why.
        </p>
      ) : (
        <ul className="border-border divide-border divide-y border-t">
          {shown.map(({ d, fitMessage }) => {
            const capacity = Math.max(0, d.capacityTeams);
            const isFull = capacity > 0 && d.registeredTeams >= capacity;
            const registered = registeredIds.has(d.id);
            const team = state?.teamsByDivision[d.id];
            // The honest state of the viewer's own entry, if they have one. "Registered" (green) is
            // gone: an entry is only secured once confirmed, and until then this says what is
            // actually true and what is still outstanding (§2G).
            const reg = state?.registrationsByDivision[d.id];
            const status = reg
              ? describeRegistrationStatus({
                  regStatus: reg.status,
                  paymentStatus: reg.paymentStatus,
                  fee: d.feeAmount,
                  partnerUnconfirmed: Boolean(team?.pendingPartner),
                  seatVacantAfterDecline: Boolean(team?.seatVacantAfterDecline),
                })
              : null;
            return (
              <li key={d.id}>
                <details>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4">
                    <span className="text-foreground text-sm font-semibold">{d.name}</span>
                    <span className="text-foreground-muted flex items-center gap-2 text-xs">
                      {status && (
                        <span className={`${TONE_CHIP[status.tone]} font-medium`}>
                          {status.shortLabel}
                        </span>
                      )}
                      <ChevronDown size={16} aria-hidden />
                    </span>
                  </summary>
                  <div className="space-y-2 px-4 pb-4">
                    {/* Remaining slots are deliberately NOT public: an exact count either deflates
                        interest early or removes urgency later. Organizers still see capacity on
                        Manage. A full division is still disclosed, because registering there joins a
                        waitlist rather than taking a slot, and a player must know that up front. */}
                    <div className="text-foreground-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Coins size={12} aria-hidden />
                        {moneyPerPlayer(d, earlyBird)}
                      </span>
                      {isFull && (
                        <span className="text-warning inline-flex items-center gap-1 font-medium">
                          <Users size={12} aria-hidden />
                          Full - joining adds you to the waitlist
                        </span>
                      )}
                    </div>

                    {registered && status ? (
                      // Name the slot's safety directly, not just "you have an entry" (§2G).
                      status.secured ? (
                        <p className="text-foreground-muted text-xs">
                          You&rsquo;re in. Manage your entry in My registrations above.
                        </p>
                      ) : (
                        <p
                          className={`flex items-start gap-1.5 text-xs font-medium ${
                            status.tone === 'action' ? 'text-warning' : 'text-foreground-muted'
                          }`}
                        >
                          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
                          <span>{status.assurance} Manage it in My registrations above.</span>
                        </p>
                      )
                    ) : fitMessage ? (
                      /* One clear sentence and no control. Offering a button that the server will
                         refuse teaches people the app is broken (§2D). */
                      <p
                        role="note"
                        className="text-warning flex items-start gap-1.5 text-xs font-medium"
                      >
                        <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
                        {fitMessage}
                      </p>
                    ) : !authed ? (
                      <Link
                        href={signInHref}
                        className="text-primary inline-block text-sm font-semibold"
                      >
                        Sign in to register
                      </Link>
                    ) : !registrationOpen ? (
                      <p className="text-foreground-muted text-xs">Registration is closed.</p>
                    ) : d.format === 'doubles' && !team ? (
                      <div>
                        <p className="text-foreground-muted mb-1 text-xs">
                          Invite a partner to form your team:
                        </p>
                        <PartnerInviteForm tournamentId={tournamentId} divisionId={d.id} />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <RegisterActions
                          tournamentId={tournamentId}
                          divisionId={d.id}
                          teamId={team?.teamId}
                          format={d.format as 'singles' | 'doubles'}
                          teamSize={d.teamSize}
                          registrationOpen={registrationOpen}
                          playerChangesConfigured={false}
                          registration={null}
                          divisions={[]}
                        />
                        {/* Shown only when there is something to do about the partner: a vacant
                            seat to fill, or a wait to explain. No disclosure to open and no
                            control that cannot succeed (§1U). */}
                        {d.format === 'doubles' && team && (
                          <PartnerChangeActions
                            teamId={team.teamId}
                            tournamentId={tournamentId}
                            divisionId={d.id}
                            pendingPartnerName={team.pendingPartner?.name ?? null}
                            seatVacantAfterDecline={team.seatVacantAfterDecline}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
