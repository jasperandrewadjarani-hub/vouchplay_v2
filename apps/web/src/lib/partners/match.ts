import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { notify } from '@/lib/notifications/create';
import { getActorMini } from '@/lib/notifications/recipients';
import { writeAudit } from '@/lib/moderation/audit';
import { doInvitePartner } from '@/lib/registrations/invite-core';
import { computeCommonDivisions, loadLiveSoloTeams, type StoredMatchDoor } from './deck';

/**
 * Match creation (master_plan §2AV F), pulled out of `actions/partners.ts` so it has exactly one
 * caller-independent definition of "these two players are mutually right-swiped, so create the
 * match" - re-verified fresh on every call rather than trusted from an earlier read. Two callers:
 *  - `swipePartner` (`actions/partners.ts`), right after the swiper's own row lands, in case their
 *    swipe is the one that completes the pair;
 *  - `runPartnerMaintenance` (`lib/partners/maintenance.ts`)'s reconciliation sweep, for the pair a
 *    genuinely simultaneous double swipe can strand: two players swiping right at the same instant can
 *    each read the other's row before it is written, so NEITHER request sees a reciprocal swipe and
 *    the match is never created by either side. Re-checking both directions here, fresh, on every call
 *    (rather than trusting whatever the caller already read) is what makes it safe to call from that
 *    sweep too - and the `ignoreDuplicates` upsert makes a second, later call for an already-matched
 *    pair a silent no-op, not a double notification.
 */

export interface CreatedPartnerMatch {
  id: string;
  playerA: string;
  playerB: string;
  /** Common divisions at match time, with names - the same list stored on the row. */
  divisions: { id: string; name: string }[];
  door: StoredMatchDoor;
  matchedAt: string;
}

function sortPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Decide the door for a brand-new match (master_plan §2AV F) - who has a seat, if either, and who
 *  therefore sends the invitation (the actual invite/notification side effects live here too, since
 *  deciding and acting are the same step - there is nothing useful to do with a decision that was not
 *  also carried out). Falls back to `enter_together` when the automatic invite is refused (rules
 *  changed since the deck loaded), recording why. */
async function decideDoor(
  tournamentId: string,
  aId: string,
  bId: string,
  commonDivisionIds: string[],
  firstDivisionId: string,
  noteById: Map<string, string | null>,
): Promise<StoredMatchDoor> {
  const seatMap = await loadLiveSoloTeams(tournamentId, commonDivisionIds, [aId, bId]);
  const aSeats = seatMap.get(aId);
  const bSeats = seatMap.get(bId);
  const aHasSeat = !!aSeats && aSeats.size > 0;
  const bHasSeat = !!bSeats && bSeats.size > 0;

  let inviterId: string | null = null;
  let inviteeId: string | null = null;
  let seatDivisionId: string | null = null;

  if (aHasSeat && !bHasSeat) {
    inviterId = aId;
    inviteeId = bId;
    seatDivisionId = Array.from(aSeats!.keys())[0] ?? null;
  } else if (bHasSeat && !aHasSeat) {
    inviterId = bId;
    inviteeId = aId;
    seatDivisionId = Array.from(bSeats!.keys())[0] ?? null;
  } else if (aHasSeat && bHasSeat) {
    // Both hold seats - the OLDER entry invites (merge happens on accept, §2AT A).
    const svc = createServiceClient();
    const aRegId = Array.from(aSeats!.values())[0]?.registrationId;
    const bRegId = Array.from(bSeats!.values())[0]?.registrationId;
    const [aReg, bReg] = await Promise.all([
      aRegId
        ? svc.from('registrations').select('id, created_at').eq('id', aRegId).maybeSingle()
        : Promise.resolve({ data: null }),
      bRegId
        ? svc.from('registrations').select('id, created_at').eq('id', bRegId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const aCreatedAt = (aReg.data as { created_at: string } | null)?.created_at ?? null;
    const bCreatedAt = (bReg.data as { created_at: string } | null)?.created_at ?? null;
    const aOlder = aCreatedAt && (!bCreatedAt || aCreatedAt <= bCreatedAt);
    if (aOlder) {
      inviterId = aId;
      inviteeId = bId;
      seatDivisionId = Array.from(aSeats!.keys())[0] ?? null;
    } else {
      inviterId = bId;
      inviteeId = aId;
      seatDivisionId = Array.from(bSeats!.keys())[0] ?? null;
    }
  }

  if (inviterId && inviteeId && seatDivisionId) {
    const outcome = await doInvitePartner(inviterId, {
      tournamentId,
      divisionId: seatDivisionId,
      inviteeId,
      message: noteById.get(inviterId) ?? null,
    });
    if (outcome.ok) {
      return {
        kind: 'invited',
        inviterId,
        registrationId: seatMap.get(inviterId)?.get(seatDivisionId)?.registrationId ?? null,
        divisionId: seatDivisionId,
        invitationId: outcome.invitationId,
      };
    }
    return {
      kind: 'enter_together',
      divisionId: seatDivisionId ?? firstDivisionId,
      fallbackReason: outcome.error ?? 'That invitation could not be sent automatically.',
    };
  }

  return { kind: 'enter_together', divisionId: firstDivisionId };
}

/**
 * Create the match between `viewerId` and `targetId` in this tournament IF - checked fresh, right
 * here, not trusted from any earlier read - both directions are currently a right swipe and no match
 * exists yet. Returns the created match, or null when nothing was created: not mutual, no common
 * division survives (rules changed since either swiped), or a match already exists (the upsert's
 * `ignoreDuplicates` makes that a silent no-op rather than a second set of notifications).
 */
export async function createMatchIfMutual(
  tournamentId: string,
  viewerId: string,
  targetId: string,
): Promise<CreatedPartnerMatch | null> {
  if (viewerId === targetId) return null;
  const svc = createServiceClient();

  const [
    { data: toTarget },
    { data: toViewer },
    { data: tournamentRow },
    { data: viewerSearchRow },
    { data: targetSearchRow },
  ] = await Promise.all([
    svc
      .from('partner_swipes')
      .select('direction')
      .eq('tournament_id', tournamentId)
      .eq('swiper_id', viewerId)
      .eq('target_id', targetId)
      .maybeSingle(),
    svc
      .from('partner_swipes')
      .select('direction')
      .eq('tournament_id', tournamentId)
      .eq('swiper_id', targetId)
      .eq('target_id', viewerId)
      .maybeSingle(),
    svc.from('tournaments').select('slug, name').eq('id', tournamentId).maybeSingle(),
    svc
      .from('partner_searches')
      .select('note')
      .eq('tournament_id', tournamentId)
      .eq('player_id', viewerId)
      .maybeSingle(),
    svc
      .from('partner_searches')
      .select('note')
      .eq('tournament_id', tournamentId)
      .eq('player_id', targetId)
      .maybeSingle(),
  ]);
  const mutual =
    (toTarget as { direction: string } | null)?.direction === 'right' &&
    (toViewer as { direction: string } | null)?.direction === 'right';
  if (!mutual) return null;

  const tournament = tournamentRow as { slug: string | null; name: string } | null;
  if (!tournament) return null;

  const [aId, bId] = sortPair(viewerId, targetId);
  const common = await computeCommonDivisions(tournamentId, aId, bId);
  const firstCommon = common[0];
  if (!firstCommon) return null;

  const noteById = new Map<string, string | null>([
    [viewerId, (viewerSearchRow as { note: string | null } | null)?.note ?? null],
    [targetId, (targetSearchRow as { note: string | null } | null)?.note ?? null],
  ]);
  const door = await decideDoor(
    tournamentId,
    aId,
    bId,
    common.map((c) => c.id),
    firstCommon.id,
    noteById,
  );

  const nowIso = new Date().toISOString();
  const { data: matchRow, error } = await svc
    .from('partner_matches')
    .upsert(
      {
        tournament_id: tournamentId,
        player_a: aId,
        player_b: bId,
        division_ids: common.map((c) => c.id),
        status: 'open',
        door,
        matched_at: nowIso,
      },
      { onConflict: 'tournament_id,player_a,player_b', ignoreDuplicates: true },
    )
    .select('id, player_a, player_b, division_ids, status, door, matched_at')
    .maybeSingle();
  if (error || !matchRow) return null;

  const row = matchRow as {
    id: string;
    player_a: string;
    player_b: string;
    division_ids: string[];
    status: string;
    door: unknown;
    matched_at: string;
  };

  const [aMini, bMini] = await Promise.all([getActorMini(aId), getActorMini(bId)]);
  const link = tournament.slug ? `/tournaments/${tournament.slug}/partners` : '/tournaments';
  await Promise.all([
    notify({
      recipientId: aId,
      type: 'partner_match',
      actorId: bId,
      params: {
        actorName: bMini.name,
        divisionName: firstCommon.name,
        tournamentName: tournament.name,
      },
      link,
      entityType: 'partner_match',
      entityId: row.id,
    }),
    notify({
      recipientId: bId,
      type: 'partner_match',
      actorId: aId,
      params: {
        actorName: aMini.name,
        divisionName: firstCommon.name,
        tournamentName: tournament.name,
      },
      link,
      entityType: 'partner_match',
      entityId: row.id,
    }),
  ]);
  await writeAudit({
    actorId: viewerId,
    action: 'partner.match',
    entityType: 'partner_match',
    entityId: row.id,
    after: { tournamentId, playerA: aId, playerB: bId, divisionIds: row.division_ids, door },
  });

  return {
    id: row.id,
    playerA: aId,
    playerB: bId,
    divisions: common.map((c) => ({ id: c.id, name: c.name })),
    door,
    matchedAt: row.matched_at,
  };
}
