import Link from 'next/link';
import { AlertCircle, ChevronDown, Coins, ShieldCheck, Users } from 'lucide-react';
import { skillByOrdinal } from '@vouchplay/config';
import { evaluateSkillFloor, effectivePlayerSkill } from '@vouchplay/core';
import type { DivisionDTO } from '@/lib/tournaments/dto';

/** Skill-band colour for a real division's meter (band divisions only; else the brand primary). */
function divisionColor(d: DivisionDTO): string {
  if (d.skillPolicy === 'band' && d.minimumSkill != null) {
    return skillByOrdinal(d.minimumSkill)?.color ?? 'var(--primary)';
  }
  return 'var(--primary)';
}
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { InfoDisclosure } from '@/components/ui/info-disclosure';
import { RegisterActions } from './register-actions';
import { PartnerInviteForm } from './partner-invite-form';
import { InvitationActions } from './invitation-actions';
import { PartnerChangeActions } from './partner-change-actions';

/**
 * Collapsed-by-default division browser (handover Phase 13.5, §1D). Public facts for every division;
 * for a signed-in player during open registration each division also offers the right register
 * action, so a player with one entry can still enter other divisions without hunting. Divisions the
 * player already holds link back to My registrations instead of repeating the action.
 */

function moneyPerPlayer(d: DivisionDTO): string {
  if (d.feeAmount <= 0) return 'Free';
  const amount = d.feeAmount / Math.max(1, d.teamSize);
  return `${d.currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} / player`;
}

export function DivisionBrowser({
  tournamentId,
  divisions,
  state,
  registrationOpen,
  authed,
  signInHref,
  enforceSkillFloor,
  requireSkillVerified,
}: {
  tournamentId: string;
  divisions: DivisionDTO[];
  state: ViewerRegistrationState | null;
  registrationOpen: boolean;
  authed: boolean;
  signInHref: string;
  enforceSkillFloor: boolean;
  requireSkillVerified: boolean;
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

      {invitations.length > 0 && (
        <div className="border-border border-t px-4 py-3">
          <h3 className="text-foreground mb-2 text-sm font-semibold">Partner invitations</h3>
          <ul className="space-y-2">
            {invitations.map((i) => (
              <li
                key={i.id}
                className="border-border bg-surface-muted flex items-center justify-between gap-2 rounded-xl border p-2.5"
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

      {visible.length === 0 ? (
        <p className="text-foreground-muted border-border border-t p-4 text-sm">
          No divisions published yet.
        </p>
      ) : (
        <ul className="border-border divide-border divide-y border-t">
          {visible.map((d) => {
            const capacity = Math.max(0, d.capacityTeams);
            const percent =
              capacity > 0 ? Math.min(100, Math.round((d.registeredTeams / capacity) * 100)) : 0;
            const registered = registeredIds.has(d.id);
            const team = state?.teamsByDivision[d.id];
            const floor = evaluateSkillFloor({
              effectiveSkill,
              skillPolicy: d.skillPolicy as 'band' | 'open' | 'custom',
              divisionMinimumSkill: d.minimumSkill,
              divisionMaximumSkill: d.maximumSkill,
              enforce: enforceSkillFloor,
            });
            return (
              <li key={d.id}>
                <details>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4">
                    <span className="text-foreground text-sm font-semibold">{d.name}</span>
                    <span className="text-foreground-muted flex items-center gap-2 text-xs">
                      {registered && <span className="text-success font-medium">Registered</span>}
                      <ChevronDown size={16} aria-hidden />
                    </span>
                  </summary>
                  <div className="space-y-2 px-4 pb-4">
                    <div className="text-foreground-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      {capacity > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Users size={12} aria-hidden />
                          {d.registeredTeams} / {capacity} teams
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Coins size={12} aria-hidden />
                        {moneyPerPlayer(d)}
                      </span>
                    </div>
                    {capacity > 0 && (
                      <div
                        aria-label={`${d.registeredTeams} of ${capacity} teams registered`}
                        className="bg-surface-muted h-1.5 overflow-hidden rounded-full"
                      >
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${percent}%`, backgroundColor: divisionColor(d) }}
                        />
                      </div>
                    )}
                    {!registered && floor.above && (
                      <p
                        role="note"
                        className="text-warning flex items-center gap-1.5 text-xs font-medium"
                      >
                        <AlertCircle size={14} aria-hidden />
                        Is this the right division for me? It targets a higher skill level than
                        yours. You can still register.
                      </p>
                    )}

                    {registered ? (
                      <p className="text-foreground-muted text-xs">
                        You have an entry here. Manage it in My registrations above.
                      </p>
                    ) : floor.blocked ? (
                      <p
                        role="note"
                        className="text-danger flex items-center gap-1.5 text-xs font-medium"
                      >
                        <AlertCircle size={14} aria-hidden />
                        You cannot join this division because it is below your skill level.
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
                        {d.format === 'doubles' && team && (
                          <InfoDisclosure label="Change partner?">
                            <PartnerChangeActions
                              teamId={team.teamId}
                              tournamentId={tournamentId}
                            />
                          </InfoDisclosure>
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
