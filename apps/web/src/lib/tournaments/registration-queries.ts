import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { avatarUrl } from '@/lib/storage';
import { divisionName } from './dto';

/**
 * Viewer-specific + organizer registration reads (handover §20–§23, §26.4). Not cached (per-viewer).
 * Uses the service client with explicit id filters after the caller is authenticated.
 */

interface Mini {
  id: string;
  name: string;
  slug: string | null;
  avatarUrl: string | null;
}
async function resolve(ids: string[]): Promise<Map<string, Mini>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, Mini>();
  if (unique.length === 0) return map;
  const svc = createServiceClient();
  const { data } = await svc
    .from('profiles')
    .select('id, first_name, last_name, nickname, slug, avatar_path')
    .in('id', unique);
  for (const r of data ?? []) {
    const row = r as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      nickname: string | null;
      slug: string | null;
      avatar_path: string | null;
    };
    map.set(row.id, {
      id: row.id,
      name:
        [row.first_name, row.last_name].filter(Boolean).join(' ').trim() ||
        row.nickname ||
        'VouchPlay player',
      slug: row.slug,
      avatarUrl: avatarUrl(row.avatar_path),
    });
  }
  return map;
}

export interface ViewerTeam {
  teamId: string;
  status: string;
  members: Mini[];
}
export interface ViewerRegistration {
  id: string;
  status: string;
  slotHoldExpiresAt: string | null;
}
export interface ViewerInvitation {
  id: string;
  divisionId: string;
  direction: 'incoming' | 'outgoing';
  otherName: string;
  otherSlug: string | null;
  message: string | null;
}
export interface ClubRep {
  clubId: string;
  name: string;
  order: number;
}
export interface EligibleClub {
  clubId: string;
  name: string;
}

export interface ViewerRegistrationState {
  teamsByDivision: Record<string, ViewerTeam>;
  registrationsByDivision: Record<string, ViewerRegistration>;
  invitations: ViewerInvitation[];
  clubReps: ClubRep[];
  eligibleClubs: EligibleClub[];
}

export async function getViewerRegistrationState(
  tournamentId: string,
  userId: string,
): Promise<ViewerRegistrationState> {
  const svc = createServiceClient();

  // Teams I'm on in this tournament.
  const { data: myMemberRows } = await svc
    .from('team_members')
    .select('team_id')
    .eq('player_id', userId);
  const myTeamIds = ((myMemberRows ?? []) as { team_id: string }[]).map((r) => r.team_id);

  const teamsByDivision: Record<string, ViewerTeam> = {};
  const registrationsByDivision: Record<string, ViewerRegistration> = {};

  if (myTeamIds.length > 0) {
    const { data: teams } = await svc
      .from('teams')
      .select('id, division_id, status')
      .in('id', myTeamIds)
      .eq('tournament_id', tournamentId)
      .in('status', ['forming', 'formed', 'locked']);
    const teamRows = (teams ?? []) as { id: string; division_id: string; status: string }[];
    const activeTeamIds = teamRows.map((t) => t.id);

    // Members of those teams.
    const { data: memberRows } = activeTeamIds.length
      ? await svc
          .from('team_members')
          .select('team_id, player_id, member_order')
          .in('team_id', activeTeamIds)
      : { data: [] };
    const members = (memberRows ?? []) as {
      team_id: string;
      player_id: string;
      member_order: number;
    }[];
    const profiles = await resolve(members.map((m) => m.player_id));
    for (const t of teamRows) {
      teamsByDivision[t.division_id] = {
        teamId: t.id,
        status: t.status,
        members: members
          .filter((m) => m.team_id === t.id)
          .sort((a, b) => a.member_order - b.member_order)
          .map((m) => profiles.get(m.player_id))
          .filter((x): x is Mini => !!x),
      };
    }

    // Registrations for those teams.
    const { data: regs } = activeTeamIds.length
      ? await svc
          .from('registrations')
          .select('id, division_id, status, slot_hold_expires_at, team_id')
          .in('team_id', activeTeamIds)
          .not('status', 'in', '(withdrawn,cancelled,rejected)')
      : { data: [] };
    for (const r of (regs ?? []) as {
      id: string;
      division_id: string;
      status: string;
      slot_hold_expires_at: string | null;
    }[]) {
      registrationsByDivision[r.division_id] = {
        id: r.id,
        status: r.status,
        slotHoldExpiresAt: r.slot_hold_expires_at,
      };
    }
  }

  // Pending invitations for this tournament (incoming + outgoing).
  const { data: invRows } = await svc
    .from('partner_invitations')
    .select('id, division_id, inviter_id, invitee_id, message, status')
    .eq('tournament_id', tournamentId)
    .eq('status', 'sent')
    .or(`inviter_id.eq.${userId},invitee_id.eq.${userId}`);
  const inv = (invRows ?? []) as {
    id: string;
    division_id: string;
    inviter_id: string;
    invitee_id: string;
    message: string | null;
  }[];
  const otherIds = inv.map((i) => (i.inviter_id === userId ? i.invitee_id : i.inviter_id));
  const otherProfiles = await resolve(otherIds);
  const invitations: ViewerInvitation[] = inv.map((i) => {
    const incoming = i.invitee_id === userId;
    const otherId = incoming ? i.inviter_id : i.invitee_id;
    const p = otherProfiles.get(otherId);
    return {
      id: i.id,
      divisionId: i.division_id,
      direction: incoming ? 'incoming' : 'outgoing',
      otherName: p?.name ?? 'player',
      otherSlug: p?.slug ?? null,
      message: i.message,
    };
  });

  // Club representations + eligible clubs.
  const { data: repRows } = await svc
    .from('tournament_player_club_representations')
    .select('club_id, display_order')
    .eq('tournament_id', tournamentId)
    .eq('player_id', userId)
    .order('display_order');
  const repClubIds = ((repRows ?? []) as { club_id: string; display_order: number }[]).map(
    (r) => r.club_id,
  );

  const { data: memRows } = await svc
    .from('club_memberships')
    .select('club_id')
    .eq('user_id', userId)
    .eq('status', 'active');
  const eligibleIds = ((memRows ?? []) as { club_id: string }[]).map((m) => m.club_id);

  const allClubIds = Array.from(new Set([...repClubIds, ...eligibleIds]));
  const clubNames = new Map<string, string>();
  if (allClubIds.length > 0) {
    const { data: clubs } = await svc.from('clubs').select('id, name').in('id', allClubIds);
    for (const c of (clubs ?? []) as { id: string; name: string }[]) clubNames.set(c.id, c.name);
  }
  const clubReps: ClubRep[] = ((repRows ?? []) as { club_id: string; display_order: number }[]).map(
    (r) => ({
      clubId: r.club_id,
      name: clubNames.get(r.club_id) ?? 'Club',
      order: r.display_order,
    }),
  );
  const eligibleClubs: EligibleClub[] = eligibleIds.map((id) => ({
    clubId: id,
    name: clubNames.get(id) ?? 'Club',
  }));

  return { teamsByDivision, registrationsByDivision, invitations, clubReps, eligibleClubs };
}

// ---------------------------------------------------------------------------
// Organizer registrations dashboard (§26.4)
// ---------------------------------------------------------------------------
export interface OrganizerRegistration {
  id: string;
  divisionId: string;
  divisionName: string;
  status: string;
  eligibilityStatus: string;
  slotHoldExpiresAt: string | null;
  createdAt: string;
  members: Mini[];
}

export async function getOrganizerRegistrations(
  tournamentId: string,
): Promise<OrganizerRegistration[]> {
  const svc = createServiceClient();
  const { data: regs } = await svc
    .from('registrations')
    .select(
      'id, division_id, team_id, status, eligibility_status, slot_hold_expires_at, created_at',
    )
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true })
    .limit(1000);
  const regRows = (regs ?? []) as {
    id: string;
    division_id: string;
    team_id: string;
    status: string;
    eligibility_status: string;
    slot_hold_expires_at: string | null;
    created_at: string;
  }[];
  if (regRows.length === 0) return [];

  const { data: divs } = await svc
    .from('divisions')
    .select(
      'id, name_override, skill_policy, minimum_skill, maximum_skill, format, sex_classification, minimum_age, maximum_age',
    )
    .eq('tournament_id', tournamentId);
  const divName = new Map<string, string>();
  type DivNameRow = { id: string } & Parameters<typeof divisionName>[0];
  for (const d of (divs ?? []) as DivNameRow[]) {
    divName.set(d.id, divisionName(d));
  }

  const teamIds = regRows.map((r) => r.team_id);
  const { data: memberRows } = await svc
    .from('team_members')
    .select('team_id, player_id, member_order')
    .in('team_id', teamIds);
  const members = (memberRows ?? []) as {
    team_id: string;
    player_id: string;
    member_order: number;
  }[];
  const profiles = await resolve(members.map((m) => m.player_id));

  return regRows.map((r) => ({
    id: r.id,
    divisionId: r.division_id,
    divisionName: divName.get(r.division_id) ?? 'Division',
    status: r.status,
    eligibilityStatus: r.eligibility_status,
    slotHoldExpiresAt: r.slot_hold_expires_at,
    createdAt: r.created_at,
    members: members
      .filter((m) => m.team_id === r.team_id)
      .sort((a, b) => a.member_order - b.member_order)
      .map((m) => profiles.get(m.player_id))
      .filter((x): x is Mini => !!x),
  }));
}

// ---------------------------------------------------------------------------
// Partner finder (§20.1) — players looking for a partner, for a doubles division.
// ---------------------------------------------------------------------------
export interface PartnerCandidate {
  slug: string;
  name: string;
  city: string | null;
  avatarUrl: string | null;
}

export async function getPartnerCandidates(
  tournamentId: string,
  excludeUserId: string,
): Promise<PartnerCandidate[]> {
  const svc = createServiceClient();
  void tournamentId;
  const { data } = await svc
    .from('profiles')
    .select('slug, first_name, last_name, nickname, city, avatar_path')
    .eq('looking_for_partner', true)
    .eq('account_status', 'active')
    .not('onboarded_at', 'is', null)
    .neq('id', excludeUserId)
    .limit(50);
  return (
    (data ?? []) as {
      slug: string | null;
      first_name: string | null;
      last_name: string | null;
      nickname: string | null;
      city: string | null;
      avatar_path: string | null;
    }[]
  )
    .filter((p) => p.slug)
    .map((p) => ({
      slug: p.slug as string,
      name:
        [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
        p.nickname ||
        'VouchPlay player',
      city: p.city,
      avatarUrl: avatarUrl(p.avatar_path),
    }));
}
