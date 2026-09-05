import Link from 'next/link';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { RegisterActions } from './register-actions';
import { PartnerInviteForm } from './partner-invite-form';
import { InvitationActions } from './invitation-actions';
import { ClubRepSelector } from './club-rep-selector';

/**
 * Signed-in registration panel on a tournament page (handover §20–§23). Rendered only when the
 * tournament is registration_open. Per open division: register/withdraw, and for doubles the team or
 * a partner invite. Plus pending invitations and club representation.
 */
export function RegistrationPanel({
  tournamentId,
  maxClubsPerPlayer,
  divisions,
  state,
}: {
  tournamentId: string;
  maxClubsPerPlayer: number;
  divisions: DivisionDTO[];
  state: ViewerRegistrationState;
}) {
  const openDivisions = divisions.filter((d) => d.status === 'open');

  return (
    <section className="border-primary/30 bg-primary/5 rounded-2xl border p-4">
      <h2 className="text-foreground mb-3 text-base font-semibold">Register</h2>

      {openDivisions.length === 0 ? (
        <p className="text-foreground-muted text-sm">No divisions are open for registration yet.</p>
      ) : (
        <ul className="space-y-3">
          {openDivisions.map((d) => {
            const team = state.teamsByDivision[d.id];
            const reg = state.registrationsByDivision[d.id];
            return (
              <li key={d.id} className="border-border bg-surface rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground text-sm font-semibold">{d.name}</span>
                  <span className="text-foreground-muted text-xs capitalize">{d.format}</span>
                </div>
                {team && (
                  <p className="text-foreground-muted mt-1 text-xs">
                    Team: {team.members.map((m) => m.name).join(' & ')}
                  </p>
                )}
                <div className="mt-2">
                  <RegisterActions
                    tournamentId={tournamentId}
                    divisionId={d.id}
                    teamId={team?.teamId}
                    format={d.format as 'singles' | 'doubles'}
                    registration={reg ? { id: reg.id, status: reg.status } : null}
                  />
                </div>
                {d.format === 'doubles' && !team && !reg && (
                  <div className="mt-2">
                    <p className="text-foreground-muted mb-1 text-xs">
                      Invite a partner to form your team:
                    </p>
                    <PartnerInviteForm tournamentId={tournamentId} divisionId={d.id} />
                  </div>
                )}
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
