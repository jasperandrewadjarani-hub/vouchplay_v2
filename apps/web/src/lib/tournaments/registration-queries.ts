import 'server-only';
import {
  partnerLockEffectiveAt,
  isPartnerLockPassed,
  quoteSlotPrice,
  summarizeEntryPayment,
  type SlotPriceQuote,
  type EntryPaymentSummary,
  type SeatState,
} from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';
import { avatarUrl, PAYMENT_PROOFS_BUCKET } from '@/lib/storage';
import { isSlotReservationsEnabled } from '@/lib/settings';
import {
  summarizeRegistration,
  getSlotsByRegistration,
  getLatestBareSlot,
  getOrganizerSlots,
} from '@/lib/payments/slots';
import { divisionName } from './dto';
import { getPartnerLockAt } from './queries';

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

export interface ReleaseRequestView {
  id: string;
  status: 'sent';
  leavingName: string;
  /** True when the viewer is the one who must answer this request. */
  iAmApprover: boolean;
  /** True when the viewer is the one who started this request. */
  iRequested: boolean;
  /** True when the viewer themselves is the player who would leave. */
  iAmLeaving: boolean;
}

export interface ViewerTeam {
  teamId: string;
  status: string;
  members: Mini[];
  /** A named partner who has not answered yet, or null. */
  pendingPartner: Mini | null;
  /** The id of that pending (`sent`) invitation, for a Withdraw-invite control. Null when there is
   *  no pending invitation. */
  pendingInvitationId: string | null;
  /** True when the seat is empty because the last named partner said no (§1U). Kept for
   *  compatibility; `seatOpen` below is the general truth (never named, declined, expired, or the
   *  invite cancelled - master_plan §2AM). */
  seatVacantAfterDecline: boolean;
  /** The team is short a player, for any reason (§2AM decision 2/3): never named, declined, expired,
   *  or the invite cancelled. The general truth `seatVacantAfterDecline` used to approximate. */
  seatOpen: boolean;
  /** The other member who has confirmed, or null (nobody confirmed yet, or the viewer plays solo). */
  confirmedPartner: Mini | null;
  /** The team's open (`sent`) partner-release request, or null. Read defensively - null before
   *  migration 0040 is applied. */
  releaseRequest: ReleaseRequestView | null;
}
export interface ViewerRegistration {
  id: string;
  status: string;
  slotHoldExpiresAt: string | null;
  paymentId: string | null;
  paymentStatus: string | null;
  paymentRejectionReason: string | null;
  /** The shared money-state verdict for this entry (master_plan §2AO A2). Null only when the
   *  registration itself could not be read back (should not happen for a row already in hand). */
  paymentSummary: EntryPaymentSummary | null;
  /** This viewer's own seat state within `paymentSummary`, or null when they hold no seat in it. */
  mySeat: SeatState | null;
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
  /** Needed to apply the division sex rule in the browser, the same way the server does (§2D). */
  sex: string | null;
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
  /** The viewer's availability flags, for the inline toggle and the tournament card (§2M/§2N). */
  viewerLookingForPartner: boolean;
  viewerOpenForSponsorship: boolean;
  /** Whether the viewer has finished onboarding, so the availability card only shows if usable. */
  viewerOnboarded: boolean;
  /** Effective partner lock-in (`coalesce(partner_lock_at, start_at - 7 days)`), or null when there
   *  is neither an explicit lock nor a start date (master_plan §2AM). Read defensively. */
  partnerLockAt: string | null;
  /** Whether the effective lock has already passed (time only, no tournament-status factor). */
  partnerLockPassed: boolean;
  /** Tournament status in (registration_open, registration_closed) AND now < the effective lock.
   *  Registration close does NOT gate partner actions - only this flag does. */
  partnerChangesOpen: boolean;
  /** `tournament_slot_reservations_enabled` (master_plan §2AO A1). */
  slotsEnabled: boolean;
  /** The viewer's own bare (no-division-yet) reservation: live first, else the newest rejected one -
   *  so a declined reservation can still say "Declined - pay again". Null when they have none, or
   *  when `slotsEnabled` is false. */
  bareSlot: {
    id: string;
    status: string;
    amountDue: number;
    amountSubmitted: number | null;
    currency: string;
    rejectionReason: string | null;
    submittedAt: string | null;
  } | null;
  /** The cheapest per-player quote among the tournament's open, fee-charging divisions - what a bare
   *  reservation costs right now. Null when no open division charges a fee, or `slotsEnabled` is
   *  false. */
  slotPrice: SlotPriceQuote | null;
}

export async function getViewerRegistrationState(
  tournamentId: string,
  userId: string,
): Promise<ViewerRegistrationState> {
  const svc = createServiceClient();

  // Tight, viewer-scoped projection for the §19.4 pre-registration prompt. The aggregate contains
  // no voucher identities; a missing row means the player has no community vouches yet.
  const [{ data: viewerProfileRow }, { data: viewerSkillRow }] = await Promise.all([
    svc
      .from('profiles')
      .select(
        'slug, self_rated_skill, sex, looking_for_partner, open_for_sponsorship, onboarded_at',
      )
      .eq('id', userId)
      .maybeSingle(),
    svc
      .from('player_skill_profiles')
      .select('community_skill_level, sts, unique_voucher_count, skill_verified')
      .eq('player_id', userId)
      .maybeSingle(),
  ]);
  const viewerProfile = viewerProfileRow as {
    slug: string | null;
    self_rated_skill: number | null;
    sex: string | null;
    looking_for_partner: boolean | null;
    open_for_sponsorship: boolean | null;
    onboarded_at: string | null;
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
    sex: viewerProfile?.sex ?? null,
  };

  // Teams I'm on in this tournament.
  const { data: myMemberRows } = await svc
    .from('team_members')
    .select('team_id')
    .eq('player_id', userId);
  const myTeamIds = ((myMemberRows ?? []) as { team_id: string }[]).map((r) => r.team_id);

  const teamsByDivision: Record<string, ViewerTeam> = {};
  const registrationsByDivision: Record<string, ViewerRegistration> = {};
  /** Teams whose every registration is closed. They are history, and nothing may act on them. */
  const retiredTeamIds = new Set<string>();

  if (myTeamIds.length > 0) {
    const { data: teams } = await svc
      .from('teams')
      .select('id, division_id, status')
      .in('id', myTeamIds)
      .eq('tournament_id', tournamentId)
      .in('status', ['forming', 'formed', 'locked']);
    const teamRows = (teams ?? []) as { id: string; division_id: string; status: string }[];
    const activeTeamIds = teamRows.map((t) => t.id);

    // Every registration these teams have ever had, closed ones included (§2C).
    //
    // A team outlives its entry. `withdrawRegistration` disbands the team it cancels, but the
    // organizer's reject path only released the slot, so a rejected entry left a `formed` team
    // behind. The team then read as live while its registration read as gone, and the division
    // offered "Register team" next to "Waiting for your partner to confirm" - a button that could
    // only fail, because the team it would register was already spoken for.
    //
    // So the rule is read here, not inferred from the team row: a team is live unless it HAS
    // registrations and every one of them is closed. A team with no registration at all is the
    // ordinary doubles case - formed, not yet entered - and stays live.
    const { data: allRegs } = activeTeamIds.length
      ? await svc
          .from('registrations')
          .select('id, division_id, status, slot_hold_expires_at, team_id')
          .in('team_id', activeTeamIds)
      : { data: [] };
    const allRegList = (allRegs ?? []) as {
      id: string;
      division_id: string;
      status: string;
      slot_hold_expires_at: string | null;
      team_id: string;
    }[];
    const CLOSED_REG = new Set(['withdrawn', 'cancelled', 'rejected']);
    for (const id of activeTeamIds) {
      const mine = allRegList.filter((r) => r.team_id === id);
      if (mine.length > 0 && mine.every((r) => CLOSED_REG.has(r.status))) retiredTeamIds.add(id);
    }

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

    // The team's current pending ('sent') invitation id, if any - so the entry card can offer a
    // Withdraw-invite control without a second round trip per team.
    const pendingInvitationByTeam = new Map<string, string>();
    if (activeTeamIds.length) {
      const { data: pendingRows } = await svc
        .from('partner_invitations')
        .select('id, team_id')
        .in('team_id', activeTeamIds)
        .eq('status', 'sent');
      for (const r of (pendingRows ?? []) as { id: string; team_id: string | null }[])
        if (r.team_id) pendingInvitationByTeam.set(r.team_id, r.id);
    }

    // The team's open (`sent`) partner-release request, if any (master_plan §2AM decision 4). Read
    // defensively - table arrives with migration 0040, and null degrades to no request rather than
    // failing the whole registration state.
    const releaseByTeam = new Map<
      string,
      { id: string; requested_by: string; leaving_player: string; approver: string }
    >();
    if (activeTeamIds.length) {
      try {
        const { data: relRows, error } = await svc
          .from('partner_release_requests')
          .select('id, team_id, requested_by, leaving_player, approver, status')
          .in('team_id', activeTeamIds)
          .eq('status', 'sent');
        if (error) throw error;
        for (const r of (relRows ?? []) as {
          id: string;
          team_id: string;
          requested_by: string;
          leaving_player: string;
          approver: string;
        }[]) {
          releaseByTeam.set(r.team_id, r);
        }
      } catch {
        // Table not present yet (migration 0040 pending) - no open requests.
      }
    }

    for (const t of teamRows) {
      if (retiredTeamIds.has(t.id)) continue;
      const teamMembers = members.filter((m) => m.team_id === t.id);
      const pending = teamMembers.find((m) => !m.confirmed_at && m.player_id !== userId);
      const confirmedOther = teamMembers.find((m) => m.confirmed_at && m.player_id !== userId);
      // General truth: this team is short a player, for whatever reason (never named, declined,
      // expired, or the invite cancelled) - a first-class state since §2AM decision 2.
      const seatOpen = teamMembers.length < 2;
      const hasOpenSeat = seatOpen && declinedTeamIds.has(t.id);
      const rel = releaseByTeam.get(t.id);
      teamsByDivision[t.division_id] = {
        teamId: t.id,
        status: t.status,
        pendingPartner: pending ? (profiles.get(pending.player_id) ?? null) : null,
        pendingInvitationId: pendingInvitationByTeam.get(t.id) ?? null,
        seatVacantAfterDecline: hasOpenSeat,
        seatOpen,
        confirmedPartner: confirmedOther ? (profiles.get(confirmedOther.player_id) ?? null) : null,
        releaseRequest: rel
          ? {
              id: rel.id,
              status: 'sent',
              leavingName: profiles.get(rel.leaving_player)?.name ?? 'player',
              iAmApprover: rel.approver === userId,
              iRequested: rel.requested_by === userId,
              iAmLeaving: rel.leaving_player === userId,
            }
          : null,
        members: members
          .filter((m) => m.team_id === t.id)
          .sort((a, b) => a.member_order - b.member_order)
          .map((m) => profiles.get(m.player_id))
          .filter((x): x is Mini => !!x),
      };
    }

    // The open registrations, filtered from the set already fetched above rather than queried
    // again - two round trips could disagree with each other about the same rows.
    const regList = allRegList.filter((r) => !CLOSED_REG.has(r.status));
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
        paymentSummary: null,
        mySeat: null,
      };
    }

    // §2AO A2: one shared money-state verdict per registration, and this viewer's own seat within it.
    // Bounded by the number of divisions this viewer has entered - never a tournament-wide scan.
    await Promise.all(
      Object.values(registrationsByDivision).map(async (r) => {
        const summary = await summarizeRegistration(r.id);
        r.paymentSummary = summary;
        r.mySeat = summary?.seats.find((s) => s.playerId === userId)?.state ?? null;
      }),
    );
  }

  // §2AO A1/A5: read once, reused by the QR-eligibility check below and the bare-slot/price fields
  // returned at the end of this function.
  const slotsEnabled = await isSlotReservationsEnabled();
  const { data: tournStatusRow } = await svc
    .from('tournaments')
    .select('status, start_at, early_bird_starts_at, early_bird_ends_at')
    .eq('id', tournamentId)
    .maybeSingle();
  const tournStatus = tournStatusRow as {
    status: string;
    start_at: string | null;
    early_bird_starts_at: string | null;
    early_bird_ends_at: string | null;
  } | null;

  // A player is at the pay step whenever a registration is awaiting payment or resubmission, even
  // before any payment row exists. Basing this on the registration status (not a payment row) is what
  // makes the organizer QR visible during a fresh payment_pending entry. §2AO A1: a viewer with no
  // registration yet but who could start a bare reservation is ALSO at a pay step - simplest rule:
  // whenever slots are enabled and the tournament is open, resolve the QR for any signed-in onboarded
  // viewer (a 5-minute signed URL is an acceptable cost for that simplicity).
  const paymentEligible =
    Object.values(registrationsByDivision).some(
      (registration) =>
        registration.status === 'payment_pending' ||
        registration.status === 'payment_submitted' ||
        registration.paymentStatus === 'rejected',
    ) ||
    (slotsEnabled &&
      tournStatus?.status === 'registration_open' &&
      Boolean(viewerProfile?.onboarded_at));
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

  // §2AO A5/A7: the viewer's own bare reservation and the tournament's current slot price. Both read
  // only when the feature is live, and defensively (a missing table degrades to null/no-slot).
  let bareSlot: ViewerRegistrationState['bareSlot'] = null;
  let slotPrice: SlotPriceQuote | null = null;
  if (slotsEnabled) {
    const [slotRow, divRes] = await Promise.all([
      getLatestBareSlot(tournamentId, userId),
      svc
        .from('divisions')
        .select('status, fee_amount, early_bird_fee_amount')
        .eq('tournament_id', tournamentId),
    ]);
    if (slotRow) {
      bareSlot = {
        id: slotRow.id,
        status: slotRow.status,
        amountDue: Number(slotRow.amount_due),
        amountSubmitted: slotRow.amount_submitted != null ? Number(slotRow.amount_submitted) : null,
        currency: slotRow.currency,
        rejectionReason: slotRow.rejection_reason,
        submittedAt: slotRow.submitted_at,
      };
    }
    const divisionsForQuote = (
      (divRes.data ?? []) as {
        status: string;
        fee_amount: number;
        early_bird_fee_amount: number | null;
      }[]
    ).map((d) => ({
      status: d.status,
      feeAmount: Number(d.fee_amount),
      earlyBirdFeeAmount: d.early_bird_fee_amount != null ? Number(d.early_bird_fee_amount) : null,
    }));
    slotPrice = quoteSlotPrice(divisionsForQuote, {
      startsAt: tournStatus?.early_bird_starts_at ?? null,
      endsAt: tournStatus?.early_bird_ends_at ?? null,
    });
  }

  // Pending invitations for this tournament (incoming + outgoing).
  const { data: invRows } = await svc
    .from('partner_invitations')
    .select('id, division_id, inviter_id, invitee_id, message, status, team_id')
    .eq('tournament_id', tournamentId)
    .eq('status', 'sent')
    .or(`inviter_id.eq.${userId},invitee_id.eq.${userId}`);
  const inv = (
    (invRows ?? []) as {
      id: string;
      division_id: string;
      inviter_id: string;
      invitee_id: string;
      message: string | null;
      team_id: string | null;
    }[]
  )
    // An invitation to join a team whose entry is already closed cannot be accepted into anything.
    // Showing it would offer the invitee a decision that no longer exists (§2C).
    .filter((i) => !(i.team_id && retiredTeamIds.has(i.team_id)));

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

  // Partner lock-in + the derived "changes open" gate (master_plan §2AM decision 5). `status` and
  // `start_at` (read once, above, alongside the slot-price fields) always exist; the lock column is
  // read defensively via `getPartnerLockAt` so the app degrades to "partner changes open" until
  // migration 0040 and its helpers land.
  const rawPartnerLockAt = await getPartnerLockAt(tournamentId);
  const partnerLockAt = partnerLockEffectiveAt(tournStatus?.start_at ?? null, rawPartnerLockAt);
  const partnerLockPassed = isPartnerLockPassed(
    new Date().toISOString(),
    tournStatus?.start_at ?? null,
    rawPartnerLockAt,
  );
  const partnerChangesOpen = Boolean(
    tournStatus &&
    ['registration_open', 'registration_closed'].includes(tournStatus.status) &&
    !partnerLockPassed,
  );

  return {
    teamsByDivision,
    registrationsByDivision,
    invitations,
    clubReps,
    eligibleClubs,
    viewerSkill,
    paymentQrUrl,
    viewerId: userId,
    viewerLookingForPartner: Boolean(viewerProfile?.looking_for_partner),
    viewerOpenForSponsorship: Boolean(viewerProfile?.open_for_sponsorship),
    viewerOnboarded: Boolean(viewerProfile?.onboarded_at),
    partnerLockAt,
    partnerLockPassed,
    slotsEnabled,
    bareSlot,
    slotPrice,
    partnerChangesOpen,
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
  /** The division's team size, so `hasOpenSeat` can tell a genuinely empty seat from a full team
   *  (master_plan §2AM). 1 for singles. */
  teamSize: number;
  /** An open player request for the organizer to cancel this entry (§1Y), newest first. */
  cancellationRequest: { reason: string; requestedAt: string } | null;
  paymentId: string | null;
  paymentStatus: string | null;
  amountDue: number | null;
  currency: string | null;
  hasProof: boolean;
  /** The shared money-state verdict for this entry (master_plan §2AO A2/A6) - team receipt combined
   *  with every attached seat. */
  paymentSummary: EntryPaymentSummary;
  /** Every attached slot row (any status) on this entry, one per seat receipt ever submitted -
   *  each with its own Verify/Reject/Refund in the detail sheet. */
  slots: {
    id: string;
    playerId: string;
    playerName: string;
    status: string;
    amountDue: number;
    amountSubmitted: number | null;
    hasProof: boolean;
    rejectionReason: string | null;
    submittedAt: string | null;
  }[];
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
      'id, name_override, skill_policy, minimum_skill, maximum_skill, format, sex_classification, minimum_age, maximum_age, team_size, fee_amount',
    )
    .eq('tournament_id', tournamentId);
  const divName = new Map<string, string>();
  const divTeamSize = new Map<string, number>();
  type DivNameRow = { id: string; team_size: number; fee_amount: number } & Parameters<
    typeof divisionName
  >[0];
  for (const d of (divs ?? []) as DivNameRow[]) {
    divName.set(d.id, divisionName(d));
    divTeamSize.set(d.id, d.team_size);
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

  // §2AO A2/A6: one shared money-state verdict + attached-slot list per registration, from a single
  // bounded `tournament_slots` read (defensive - degrades to "no slots" before migration 0042).
  const slotsByReg = await getSlotsByRegistration(regRows.map((r) => r.id));
  const membersByTeam = new Map<string, string[]>();
  for (const m of members) {
    const list = membersByTeam.get(m.team_id) ?? [];
    list.push(m.player_id);
    membersByTeam.set(m.team_id, list);
  }
  const divisionFeeById = new Map<string, number>();
  for (const d of (divs ?? []) as DivNameRow[]) {
    if (d.fee_amount != null) divisionFeeById.set(d.id, Number(d.fee_amount));
  }

  return regRows.map((r) => {
    const pay = payByReg.get(r.id);
    const teamSize = divTeamSize.get(r.division_id) ?? 2;
    const slots = slotsByReg.get(r.id) ?? [];
    const paymentSummary = summarizeEntryPayment({
      teamSize,
      memberIds: membersByTeam.get(r.team_id) ?? [],
      teamPayment: pay ? { status: pay.status } : null,
      slots: slots.map((s) => ({
        playerId: s.player_id,
        status: s.status,
        amountDue: Number(s.amount_due),
        amountSubmitted: s.amount_submitted != null ? Number(s.amount_submitted) : null,
        createdAt: s.created_at,
      })),
      feeOwed: (divisionFeeById.get(r.division_id) ?? 0) > 0,
    });
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
      teamSize,
      cancellationRequest: cancelByReg.get(r.id) ?? null,
      paymentId: pay?.id ?? null,
      paymentStatus: pay?.status ?? null,
      amountDue: pay ? Number(pay.amount_due) : null,
      currency: pay?.currency ?? null,
      hasProof: !!pay?.proof_storage_path,
      paymentSummary,
      slots: slots.map((s) => ({
        id: s.id,
        playerId: s.player_id,
        playerName: profiles.get(s.player_id)?.name ?? 'VouchPlay player',
        status: s.status,
        amountDue: Number(s.amount_due),
        amountSubmitted: s.amount_submitted != null ? Number(s.amount_submitted) : null,
        hasProof: !!s.proof_storage_path,
        rejectionReason: s.rejection_reason,
        submittedAt: s.submitted_at,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Reserved (bare) slots panel (master_plan §2AO A6) - every bare tournament_slots row, any status.
// ---------------------------------------------------------------------------
export interface OrganizerBareSlot {
  id: string;
  playerId: string;
  playerName: string;
  playerSlug: string | null;
  status: string;
  amountDue: number;
  amountSubmitted: number | null;
  currency: string;
  hasProof: boolean;
  submittedAt: string | null;
  rejectionReason: string | null;
  /** The division chosen at purchase (informational only - a bare slot holds no division capacity),
   *  or null when none was recorded. */
  divisionName: string | null;
}

export async function getOrganizerBareSlots(tournamentId: string): Promise<OrganizerBareSlot[]> {
  const all = await getOrganizerSlots(tournamentId);
  const bare = all.filter((s) => !s.registration_id);
  if (bare.length === 0) return [];

  const [profiles, divisionIdsSet] = [
    await resolve(bare.map((s) => s.player_id)),
    new Set(bare.map((s) => s.division_id).filter((id): id is string => !!id)),
  ];
  const divisionIds = Array.from(divisionIdsSet);
  const divNameById = new Map<string, string>();
  if (divisionIds.length > 0) {
    const svc = createServiceClient();
    const { data: divs } = await svc
      .from('divisions')
      .select(
        'id, name_override, skill_policy, minimum_skill, maximum_skill, format, sex_classification, minimum_age, maximum_age',
      )
      .in('id', divisionIds);
    type DivNameRow = { id: string } & Parameters<typeof divisionName>[0];
    for (const d of (divs ?? []) as DivNameRow[]) divNameById.set(d.id, divisionName(d));
  }

  return bare.map((s) => ({
    id: s.id,
    playerId: s.player_id,
    playerName: profiles.get(s.player_id)?.name ?? 'VouchPlay player',
    playerSlug: profiles.get(s.player_id)?.slug ?? null,
    status: s.status,
    amountDue: Number(s.amount_due),
    amountSubmitted: s.amount_submitted != null ? Number(s.amount_submitted) : null,
    currency: s.currency,
    hasProof: !!s.proof_storage_path,
    submittedAt: s.submitted_at,
    rejectionReason: s.rejection_reason,
    divisionName: s.division_id ? (divNameById.get(s.division_id) ?? 'Division') : null,
  }));
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
