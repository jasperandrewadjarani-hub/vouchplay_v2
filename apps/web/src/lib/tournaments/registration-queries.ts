import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { avatarUrl, PAYMENT_PROOFS_BUCKET } from '@/lib/storage';
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
  /** A named partner who has not answered yet, or null. */
  pendingPartner: Mini | null;
  /** True when the seat is empty because the last named partner said no (§1U). */
  seatVacantAfterDecline: boolean;
}
export interface ViewerRegistration {
  id: string;
  status: string;
  slotHoldExpiresAt: string | null;
  paymentId: string | null;
  paymentStatus: string | null;
  paymentRejectionReason: string | null;
}
export interface ViewerInvitation {
  id: string;
  divisionId: string;
  direction: 'incoming' | 'outgoing';
  otherName: string;
  otherSlug: string | null;
  message: string | null;
  /** The inviter already paid for this entry, so confirming costs the invitee nothing (§1U). */
  prepaid: boolean;
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

export interface ViewerRegistrationSkillProfile {
  playerId: string;
  profileSlug: string | null;
  communitySkillLevel: number | null;
  sts: number;
  uniqueVoucherCount: number;
  skillVerified: boolean;
  selfRatedSkillLevel: number | null;
}

export interface ViewerRegistrationState {
  teamsByDivision: Record<string, ViewerTeam>;
  registrationsByDivision: Record<string, ViewerRegistration>;
  invitations: ViewerInvitation[];
  clubReps: ClubRep[];
  eligibleClubs: EligibleClub[];
  viewerSkill: ViewerRegistrationSkillProfile;
  paymentQrUrl: string | null;
  /** So a team member list can say which of the two players is the OTHER one (§2A). */
  viewerId: string;
}

export async function getViewerRegistrationState(
  tournamentId: string,
  userId: string,
): Promise<ViewerRegistrationState> {
  const svc = createServiceClient();

  // Tight, viewer-scoped projection for the §19.4 pre-registration prompt. The aggregate contains
  // no voucher identities; a missing row means the player has no community vouches yet.
  const [{ data: viewerProfileRow }, { data: viewerSkillRow }] = await Promise.all([
    svc.from('profiles').select('slug, self_rated_skill').eq('id', userId).maybeSingle(),
    svc
      .from('player_skill_profiles')
      .select('community_skill_level, sts, unique_voucher_count, skill_verified')
      .eq('player_id', userId)
      .maybeSingle(),
  ]);
  const viewerProfile = viewerProfileRow as {
    slug: string | null;
    self_rated_skill: number | null;
  } | null;
  const skill = viewerSkillRow as {
    community_skill_level: number | null;
    sts: number | string;
    unique_voucher_count: number;
    skill_verified: boolean;
  } | null;
  const viewerSkill: ViewerRegistrationSkillProfile = {
    playerId: userId,
    profileSlug: viewerProfile?.slug ?? null,
    communitySkillLevel: skill?.community_skill_level ?? null,
    sts: Number(skill?.sts ?? 0),
    uniqueVoucherCount: skill?.unique_voucher_count ?? 0,
    skillVerified: skill?.skill_verified ?? false,
    selfRatedSkillLevel: viewerProfile?.self_rated_skill ?? null,
  };

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
          .select('team_id, player_id, member_order, confirmed_at')
          .in('team_id', activeTeamIds)
      : { data: [] };
    const members = (memberRows ?? []) as {
      team_id: string;
      player_id: string;
      member_order: number;
      confirmed_at: string | null;
    }[];
    const profiles = await resolve(members.map((m) => m.player_id));

    // A seat is vacant-after-decline when the team is short a player AND its last invitation was
    // refused or ran out. That is the only state in which a replacement may be named (§1U).
    const declinedTeamIds = new Set<string>();
    if (activeTeamIds.length) {
      const { data: declRows } = await svc
        .from('partner_invitations')
        .select('team_id, status')
        .in('team_id', activeTeamIds)
        .in('status', ['declined', 'expired']);
      for (const r of (declRows ?? []) as { team_id: string | null }[])
        if (r.team_id) declinedTeamIds.add(r.team_id);
    }
    for (const t of teamRows) {
      const teamMembers = members.filter((m) => m.team_id === t.id);
      const pending = teamMembers.find((m) => !m.confirmed_at && m.player_id !== userId);
      const hasOpenSeat = teamMembers.length < 2 && declinedTeamIds.has(t.id);
      teamsByDivision[t.division_id] = {
        teamId: t.id,
        status: t.status,
        pendingPartner: pending ? (profiles.get(pending.player_id) ?? null) : null,
        seatVacantAfterDecline: hasOpenSeat,
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
    const regList = (regs ?? []) as {
      id: string;
      division_id: string;
      status: string;
      slot_hold_expires_at: string | null;
    }[];
    // Payments for those registrations.
    const paymentByReg = new Map<
      string,
      { id: string; status: string; rejection_reason: string | null }
    >();
    if (regList.length > 0) {
      const { data: pays } = await svc
        .from('payments')
        .select('id, registration_id, status, rejection_reason')
        .in(
          'registration_id',
          regList.map((r) => r.id),
        );
      for (const p of (pays ?? []) as {
        id: string;
        registration_id: string;
        status: string;
        rejection_reason: string | null;
      }[]) {
        paymentByReg.set(p.registration_id, {
          id: p.id,
          status: p.status,
          rejection_reason: p.rejection_reason,
        });
      }
    }
    for (const r of regList) {
      const pay = paymentByReg.get(r.id);
      registrationsByDivision[r.division_id] = {
        id: r.id,
        status: r.status,
        slotHoldExpiresAt: r.slot_hold_expires_at,
        paymentId: pay?.id ?? null,
        paymentStatus: pay?.status ?? null,
        paymentRejectionReason: pay?.rejection_reason ?? null,
      };
    }
  }

  // A player is at the pay step whenever a registration is awaiting payment or resubmission, even
  // before any payment row exists. Basing this on the registration status (not a payment row) is what
  // makes the organizer QR visible during a fresh payment_pending entry.
  const paymentEligible = Object.values(registrationsByDivision).some(
    (registration) =>
      registration.status === 'payment_pending' ||
      registration.status === 'payment_submitted' ||
      registration.paymentStatus === 'rejected',
  );
  let paymentQrUrl: string | null = null;
  if (paymentEligible) {
    // This optional column is read only when a player is at the private payment step. If migration
    // 0020 is not applied yet, the query safely degrades to no QR rather than breaking registration.
    const { data: tournamentRow } = await svc
      .from('tournaments')
      .select('payment_qr_path')
      .eq('id', tournamentId)
      .maybeSingle();
    const paymentQrPath = (tournamentRow as { payment_qr_path: string | null } | null)
      ?.payment_qr_path;
    if (paymentQrPath) {
      paymentQrUrl =
        (await svc.storage.from(PAYMENT_PROOFS_BUCKET).createSignedUrl(paymentQrPath, 300)).data
          ?.signedUrl ?? null;
    }
  }

  // Pending invitations for this tournament (incoming + outgoing).
  const { data: invRows } = await svc
    .from('partner_invitations')
    .select('id, division_id, inviter_id, invitee_id, message, status, team_id')
    .eq('tournament_id', tournamentId)
    .eq('status', 'sent')
    .or(`inviter_id.eq.${userId},invitee_id.eq.${userId}`);
  const inv = (invRows ?? []) as {
    id: string;
    division_id: string;
    inviter_id: string;
    invitee_id: string;
    message: string | null;
    team_id: string | null;
  }[];

  // An invitation whose team already carries a submitted or verified receipt is prepaid: the person
  // being asked to confirm is not being asked for money (§1U).
  const invTeamIds = inv.map((i) => i.team_id).filter((t): t is string => Boolean(t));
  const prepaidTeams = new Set<string>();
  if (invTeamIds.length) {
    const { data: regRows } = await svc
      .from('registrations')
      .select('id, team_id')
      .in('team_id', invTeamIds)
      .not('status', 'in', '(withdrawn,cancelled,rejected)');
    const regs = (regRows ?? []) as { id: string; team_id: string }[];
    if (regs.length) {
      const { data: payRows } = await svc
        .from('payments')
        .select('registration_id, status')
        .in(
          'registration_id',
          regs.map((r) => r.id),
        )
        .in('status', ['submitted', 'verified']);
      const paidRegIds = new Set(
        ((payRows ?? []) as { registration_id: string }[]).map((r) => r.registration_id),
      );
      for (const r of regs) if (paidRegIds.has(r.id)) prepaidTeams.add(r.team_id);
    }
  }
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
      prepaid: Boolean(i.team_id && prepaidTeams.has(i.team_id)),
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

  return {
    teamsByDivision,
    registrationsByDivision,
    invitations,
    clubReps,
    eligibleClubs,
    viewerSkill,
    paymentQrUrl,
    viewerId: userId,
  };
}

// ---------------------------------------------------------------------------
// Organizer registrations dashboard (§26.4)
// ---------------------------------------------------------------------------
export interface OrganizerRegistration {
  id: string;
  teamId: string;
  divisionId: string;
  divisionName: string;
  status: string;
  eligibilityStatus: string;
  eligibilitySnapshot: Record<string, unknown>;
  slotHoldExpiresAt: string | null;
  createdAt: string;
  members: Mini[];
  /** Player ids whose team membership is still unconfirmed (pay-first, §1U). */
  unconfirmedMemberIds: string[];
  /** An open player request for the organizer to cancel this entry (§1Y), newest first. */
  cancellationRequest: { reason: string; requestedAt: string } | null;
  paymentId: string | null;
  paymentStatus: string | null;
  amountDue: number | null;
  currency: string | null;
  hasProof: boolean;
}

export async function getOrganizerRegistrations(
  tournamentId: string,
): Promise<OrganizerRegistration[]> {
  const svc = createServiceClient();
  const { data: regs } = await svc
    .from('registrations')
    .select(
      'id, division_id, team_id, status, eligibility_status, eligibility_snapshot, slot_hold_expires_at, created_at',
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
    eligibility_snapshot: Record<string, unknown> | null;
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
    .select('team_id, player_id, member_order, confirmed_at')
    .in('team_id', teamIds);
  const members = (memberRows ?? []) as {
    team_id: string;
    player_id: string;
    member_order: number;
    confirmed_at: string | null;
  }[];

  // Open cancellation requests, so the organizer can find and answer them (§1Z).
  const { data: cancelRows } = await svc
    .from('registration_events')
    .select('registration_id, metadata, created_at')
    .in(
      'registration_id',
      regRows.map((r) => r.id),
    )
    .eq('event_type', 'cancellation_requested')
    .order('created_at', { ascending: false });
  const cancelByReg = new Map<string, { reason: string; requestedAt: string }>();
  for (const c of (cancelRows ?? []) as {
    registration_id: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }[]) {
    if (cancelByReg.has(c.registration_id)) continue;
    cancelByReg.set(c.registration_id, {
      reason: String(c.metadata?.reason ?? ''),
      requestedAt: c.created_at,
    });
  }
  const profiles = await resolve(members.map((m) => m.player_id));

  // Payments for these registrations.
  const { data: pays } = await svc
    .from('payments')
    .select('id, registration_id, status, amount_due, currency, proof_storage_path')
    .in(
      'registration_id',
      regRows.map((r) => r.id),
    );
  const payByReg = new Map<
    string,
    {
      id: string;
      status: string;
      amount_due: number;
      currency: string;
      proof_storage_path: string | null;
    }
  >();
  for (const p of (pays ?? []) as {
    id: string;
    registration_id: string;
    status: string;
    amount_due: number;
    currency: string;
    proof_storage_path: string | null;
  }[]) {
    payByReg.set(p.registration_id, p);
  }

  return regRows.map((r) => {
    const pay = payByReg.get(r.id);
    return {
      id: r.id,
      teamId: r.team_id,
      divisionId: r.division_id,
      divisionName: divName.get(r.division_id) ?? 'Division',
      status: r.status,
      eligibilityStatus: r.eligibility_status,
      eligibilitySnapshot: r.eligibility_snapshot ?? {},
      slotHoldExpiresAt: r.slot_hold_expires_at,
      createdAt: r.created_at,
      members: members
        .filter((m) => m.team_id === r.team_id)
        .sort((a, b) => a.member_order - b.member_order)
        .map((m) => profiles.get(m.player_id))
        .filter((x): x is Mini => !!x),
      unconfirmedMemberIds: members
        .filter((m) => m.team_id === r.team_id && !m.confirmed_at)
        .map((m) => m.player_id),
      cancellationRequest: cancelByReg.get(r.id) ?? null,
      paymentId: pay?.id ?? null,
      paymentStatus: pay?.status ?? null,
      amountDue: pay ? Number(pay.amount_due) : null,
      currency: pay?.currency ?? null,
      hasProof: !!pay?.proof_storage_path,
    };
  });
}

// ---------------------------------------------------------------------------
// Partner finder (§20.1) - players looking for a partner, for a doubles division.
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

// ---------------------------------------------------------------------------
// Club representation override data (handover Phase 13.5) - organizer/Admin post-lock corrections.
// ---------------------------------------------------------------------------
export interface ClubOverrideParticipant {
  playerId: string;
  name: string;
  currentClubIds: string[];
  selectableClubs: EligibleClub[];
}

/**
 * Bounded per-player club data for the organizer override control. Lists each distinct player with
 * a registration in the tournament, their current representations, and the clubs they may be set to
 * (their active memberships plus any club they currently represent, so the organizer can also remove
 * one). Read-only aggregate; the actual write goes through the audited override action.
 */
export async function getClubOverrideParticipants(
  tournamentId: string,
): Promise<ClubOverrideParticipant[]> {
  const svc = createServiceClient();
  const { data: regs } = await svc
    .from('registrations')
    .select('team_id')
    .eq('tournament_id', tournamentId)
    .not('status', 'in', '(withdrawn,cancelled,rejected)')
    .limit(1000);
  const teamIds = Array.from(
    new Set(((regs ?? []) as { team_id: string }[]).map((r) => r.team_id)),
  );
  if (teamIds.length === 0) return [];

  const { data: memberRows } = await svc
    .from('team_members')
    .select('player_id')
    .in('team_id', teamIds);
  const playerIds = Array.from(
    new Set(((memberRows ?? []) as { player_id: string }[]).map((m) => m.player_id)),
  );
  if (playerIds.length === 0) return [];

  const [{ data: repRows }, { data: memRows }, profiles] = await Promise.all([
    svc
      .from('tournament_player_club_representations')
      .select('player_id, club_id, display_order')
      .eq('tournament_id', tournamentId)
      .in('player_id', playerIds),
    svc
      .from('club_memberships')
      .select('user_id, club_id')
      .eq('status', 'active')
      .in('user_id', playerIds),
    resolve(playerIds),
  ]);

  const reps = (repRows ?? []) as { player_id: string; club_id: string; display_order: number }[];
  const mems = (memRows ?? []) as { user_id: string; club_id: string }[];
  const allClubIds = Array.from(
    new Set([...reps.map((r) => r.club_id), ...mems.map((m) => m.club_id)]),
  );
  const clubNames = new Map<string, string>();
  if (allClubIds.length > 0) {
    const { data: clubs } = await svc.from('clubs').select('id, name').in('id', allClubIds);
    for (const c of (clubs ?? []) as { id: string; name: string }[]) clubNames.set(c.id, c.name);
  }

  return playerIds
    .map((playerId) => {
      const current = reps
        .filter((r) => r.player_id === playerId)
        .sort((a, b) => a.display_order - b.display_order);
      const selectableIds = Array.from(
        new Set([
          ...current.map((r) => r.club_id),
          ...mems.filter((m) => m.user_id === playerId).map((m) => m.club_id),
        ]),
      );
      return {
        playerId,
        name: profiles.get(playerId)?.name ?? 'VouchPlay player',
        currentClubIds: current.map((r) => r.club_id),
        selectableClubs: selectableIds.map((clubId) => ({
          clubId,
          name: clubNames.get(clubId) ?? 'Club',
        })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
