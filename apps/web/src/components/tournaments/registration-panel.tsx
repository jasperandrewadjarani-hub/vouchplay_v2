import Link from 'next/link';
import { AlertCircle, Info } from 'lucide-react';
import { evaluateRegistrationSkillPrompt, type EligibilityThresholds } from '@vouchplay/core';
import { skillByOrdinal } from '@vouchplay/config';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { publicEnv } from '@/lib/env';
import { ButtonLink } from '@/components/ui/button';
import { ShareButton } from '@/components/players/share-button';
import { RegisterActions } from './register-actions';
import { PartnerInviteForm } from './partner-invite-form';
import { InvitationActions } from './invitation-actions';
import { ClubRepSelector } from './club-rep-selector';
import { PaymentForm } from './payment-form';
import { PartnerChangeActions } from './partner-change-actions';

/**
 * Signed-in registration panel on a tournament page (handover §20–§23). Rendered only when the
 * tournament is registration_open. Per open division: register/withdraw, and for doubles the team or
 * a partner invite. Plus pending invitations and club representation.
 */
export function RegistrationPanel({
  tournamentId,
  maxClubsPerPlayer,
  paymentInstructions,
  paymentMethods,
  divisions,
  state,
  eligibilityThresholds,
  registrationOpen,
  playerChangesConfigured,
}: {
  tournamentId: string;
  maxClubsPerPlayer: number;
  paymentInstructions: string | null;
  paymentMethods: string | null;
  divisions: DivisionDTO[];
  state: ViewerRegistrationState;
  eligibilityThresholds: EligibilityThresholds;
  registrationOpen: boolean;
  playerChangesConfigured: boolean;
}) {
  const openDivisions = divisions.filter((d) => d.status === 'open');
  const registeredDivisionIds = new Set(Object.keys(state.registrationsByDivision));
  const registeredDivisions = divisions.filter((division) =>
    registeredDivisionIds.has(division.id),
  );
  const visibleDivisions = Array.from(
    new Map(
      (registrationOpen ? [...registeredDivisions, ...openDivisions] : registeredDivisions).map(
        (division) => [division.id, division],
      ),
    ).values(),
  ).sort((a, b) => {
    const aRegistered = registeredDivisionIds.has(a.id) ? 0 : 1;
    const bRegistered = registeredDivisionIds.has(b.id) ? 0 : 1;
    return aRegistered - bRegistered;
  });
  const hasRegistration = registeredDivisionIds.size > 0;

  return (
    <section className="border-primary/30 bg-primary/5 rounded-2xl border p-4">
      <h2 className="text-foreground mb-1 text-base font-semibold">
        {hasRegistration ? 'Your entries and divisions' : 'Register'}
      </h2>
      {hasRegistration && (
        <p className="text-foreground-muted mb-3 text-xs">
          Your active entries are first. You can enter more than one division. Other divisions stay
          collapsed until you open them.
        </p>
      )}

      {visibleDivisions.length === 0 ? (
        <p className="text-foreground-muted text-sm">No divisions are open for registration yet.</p>
      ) : (
        <ul className="space-y-3">
          {visibleDivisions.map((d) => {
            const team = state.teamsByDivision[d.id];
            const reg = state.registrationsByDivision[d.id];
            const skillPrompt = evaluateRegistrationSkillPrompt(
              state.viewerSkill,
              {
                minimumSts: d.minimumSts,
                skillVerifiedRequired: d.skillVerifiedRequired,
              },
              eligibilityThresholds,
            );
            const communitySkill =
              state.viewerSkill.communitySkillLevel == null
                ? null
                : skillByOrdinal(state.viewerSkill.communitySkillLevel);
            const displayedSkill =
              communitySkill ??
              (state.viewerSkill.selfRatedSkillLevel == null
                ? null
                : skillByOrdinal(state.viewerSkill.selfRatedSkillLevel));
            const skillSource = communitySkill
              ? state.viewerSkill.skillVerified
                ? 'Community Skill Verified'
                : 'Community Skill'
              : displayedSkill
                ? 'Self-rated skill'
                : 'No skill rating';
            const skillMismatch =
              displayedSkill != null &&
              ((d.minimumSkill != null && displayedSkill.ordinal < d.minimumSkill) ||
                (d.maximumSkill != null && displayedSkill.ordinal > d.maximumSkill));
            const registrationPercent =
              d.capacityTeams > 0
                ? Math.min(100, Math.round((d.registeredTeams / d.capacityTeams) * 100))
                : 0;
            const perPlayerFee = d.feeAmount / Math.max(1, d.teamSize);
            const profileUrl = state.viewerSkill.profileSlug
              ? `${publicEnv.siteUrl}/players/${state.viewerSkill.profileSlug}`
              : null;
            return (
              <li key={d.id} className="border-border bg-surface rounded-xl border">
                <details open={!!reg}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3">
                    <span>
                      <span className="text-foreground block text-sm font-semibold">{d.name}</span>
                      {reg && (
                        <span className="text-foreground-muted block text-xs capitalize">
                          Your {reg.status.replace(/_/g, ' ')}
                        </span>
                      )}
                    </span>
                    <span className="text-foreground-muted text-xs">Details</span>
                  </summary>
                  <div className="border-border border-t p-3">
                    <div className="text-foreground-muted flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <span>
                        {d.feeAmount > 0
                          ? `${d.currency} ${perPlayerFee.toLocaleString(undefined, { maximumFractionDigits: 2 })} / player`
                          : 'Free'}
                      </span>
                      {d.capacityTeams > 0 && (
                        <span>
                          {d.registeredTeams} / {d.capacityTeams} teams
                        </span>
                      )}
                      <span>
                        {skillSource}
                        {displayedSkill ? `: ${displayedSkill.label}` : ''}
                      </span>
                    </div>
                    {d.capacityTeams > 0 && (
                      <div
                        className="bg-surface-muted mt-2 h-1.5 overflow-hidden rounded-full"
                        aria-label={`${d.registeredTeams} of ${d.capacityTeams} teams registered`}
                      >
                        <div
                          className="bg-primary h-full rounded-full"
                          style={{ width: `${registrationPercent}%` }}
                        />
                      </div>
                    )}
                    {skillMismatch && (
                      <p role="note" className="text-warning mt-2 flex items-center gap-1 text-xs">
                        <AlertCircle size={14} aria-hidden />
                        Your {skillSource.toLowerCase()} may not align with this division. The
                        organizer will review eligibility.
                      </p>
                    )}
                    {team && (
                      <p className="text-foreground-muted mt-1 text-xs">
                        Team: {team.members.map((m) => m.name).join(' & ')}
                      </p>
                    )}
                    {!reg && skillPrompt.showPrompt && (
                      <details className="border-warning/40 bg-warning/10 mt-3 rounded-xl border p-2.5">
                        <summary className="text-foreground flex cursor-pointer items-center gap-1.5 text-xs font-semibold">
                          <Info size={15} className="text-warning" aria-hidden />
                          Skill evidence guidance
                        </summary>
                        <div className="text-foreground-muted mt-2 space-y-2 text-xs">
                          <p>You can register, but the organizer may review your entry.</p>
                          <p>
                            STS {state.viewerSkill.sts.toFixed(1)} / 5 ·{' '}
                            {state.viewerSkill.uniqueVoucherCount} vouchers
                            {d.minimumSts != null ? ` · Division STS ${d.minimumSts}` : ''}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {profileUrl && (
                              <ShareButton
                                url={profileUrl}
                                title="My VouchPlay profile"
                                text="Please vouch for my pickleball skill on VouchPlay if you know my game."
                                size="sm"
                                label="Share profile"
                              />
                            )}
                            <ButtonLink
                              href="/players"
                              variant="secondary"
                              className="rounded-xl px-3 py-1.5 text-xs"
                            >
                              Request a vouch
                            </ButtonLink>
                          </div>
                        </div>
                      </details>
                    )}
                    <div className="mt-2">
                      <RegisterActions
                        tournamentId={tournamentId}
                        divisionId={d.id}
                        teamId={team?.teamId}
                        format={d.format as 'singles' | 'doubles'}
                        teamSize={d.teamSize}
                        registrationOpen={registrationOpen}
                        playerChangesConfigured={playerChangesConfigured}
                        registration={reg ? { id: reg.id, status: reg.status } : null}
                        divisions={divisions.map((division) => ({
                          id: division.id,
                          name: division.name,
                          format: division.format,
                          teamSize: division.teamSize,
                          status: division.status,
                        }))}
                      />
                    </div>
                    {reg &&
                      d.feeAmount > 0 &&
                      (reg.status === 'payment_pending' || reg.status === 'payment_submitted') && (
                        <PaymentForm
                          registrationId={reg.id}
                          tournamentId={tournamentId}
                          amountDue={d.feeAmount}
                          currency={d.currency}
                          instructions={paymentInstructions}
                          methods={paymentMethods}
                          paymentQrUrl={state.paymentQrUrl}
                          paymentStatus={reg.paymentStatus}
                          rejectionReason={reg.paymentRejectionReason}
                        />
                      )}
                    {reg && d.format === 'doubles' && playerChangesConfigured && (
                      <p className="text-foreground-muted mt-3 text-xs">
                        Change partner: cancel before payment, then leave your team and invite a new
                        partner. After payment or the change lock, contact the organizer.
                      </p>
                    )}
                    {team &&
                      !reg &&
                      d.format === 'doubles' &&
                      registrationOpen &&
                      playerChangesConfigured && (
                        <PartnerChangeActions teamId={team.teamId} tournamentId={tournamentId} />
                      )}
                    {d.format === 'doubles' && !team && !reg && registrationOpen && (
                      <div className="mt-2">
                        <p className="text-foreground-muted mb-1 text-xs">
                          Invite a partner to form your team:
                        </p>
                        <PartnerInviteForm tournamentId={tournamentId} divisionId={d.id} />
                      </div>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      {state.invitations.length > 0 && (
        <div className="mt-4">
          <h3 className="text-foreground mb-2 text-sm font-semibold">Partner invitations</h3>
          <ul className="space-y-2">
            {state.invitations.map((i) => (
              <li
                key={i.id}
                className="border-border bg-surface flex items-center justify-between gap-2 rounded-xl border p-2.5"
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
                <InvitationActions invitationId={i.id} direction={i.direction} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <h3 className="text-foreground mb-2 text-sm font-semibold">Clubs you represent</h3>
        <ClubRepSelector
          tournamentId={tournamentId}
          eligibleClubs={state.eligibleClubs}
          selected={state.clubReps.map((r) => r.clubId)}
          max={maxClubsPerPlayer}
        />
      </div>
    </section>
  );
}
