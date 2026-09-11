import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import type { V2Vouch, V2Voucher } from '@vouchplay/core';

/**
 * Gathers the raw ingredients the STS_V2 engine needs for one target (master_plan §2AF.1-4): who
 * vouched them, what those vouchers look like as witnesses (anchored, standing, age, clubs), and the
 * target's own self-rating / V1 community skill level (the prior + the SPIKE comparison). Every list
 * read is bounded (`.limit(1000)`) and column-explicit - never `select('*')` (handover §34A, §35).
 *
 * These are the SAME semantics the standalone shadow-report and backfill scripts (§2AF E5) must use,
 * so precision here matters more than brevity - each step is commented with the exact §2AF rule it
 * implements.
 */
export interface V2Facts {
  targetId: string;
  selfRating: number | null;
  /** The target's CURRENT V1 community skill level (`player_skill_profiles.community_skill_level`) -
   *  used both as the SPIKE comparison baseline and, before a V2 write exists, as `cslV1` in
   *  `detectAnomalies`. */
  cslV1: number | null;
  vouches: V2Vouch[];
  vouchers: Map<string, V2Voucher>;
}

type Svc = ReturnType<typeof createServiceClient>;

/** PostgREST caps a single response well under this; every list query here is a small graph slice
 *  around one target, so one page is always enough while staying an explicit, defensive bound. */
const BOUND = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** §2AF.1 "a confirmed/paid registration" - the statuses that count as a real-money commitment. */
const ANCHOR_REGISTRATION_STATUSES = ['confirmed', 'payment_submitted', 'payment_pending'];

/**
 * §2AF.1 standing for one user from raw received/given edges (anchored giver 1.0, unanchored 0.5,
 * mutual pairs excluded). Pure and exported so `gatherV2Facts` and `lib/vouches/newcomer.ts` (§2AJ
 * newcomer-graduation check) compute standing with byte-identical logic from the same edge lists.
 */
export function standingFromEdges(
  userId: string,
  received: { voucher_id: string; target_id: string }[],
  givenPairs: Set<string>,
  anchoredGivers: Set<string>,
): number {
  let standing = 0;
  for (const r of received) {
    if (r.target_id !== userId) continue;
    const giver = r.voucher_id;
    const isReciprocalPair = givenPairs.has(`${userId}:${giver}`); // user also actively vouches this giver back
    if (isReciprocalPair) continue; // §2AF.1: "mutual vouches cannot manufacture standing"
    standing += anchoredGivers.has(giver) ? 1.0 : 0.5;
  }
  return standing;
}

function accountAgeDays(
  onboardedAt: string | null,
  createdAt: string | null,
  nowMs: number,
): number {
  const iso = onboardedAt ?? createdAt; // §2AF: "profiles.onboarded_at ?? created_at"
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (nowMs - t) / DAY_MS); // §2AF: "(>=0)"
}

/**
 * anchored(u) (§2AF.1): a confirmed/paid tournament registration (via `team_members` -> `registrations`,
 * a two-hop fact and so two of the queries below), OR an approved identity verification, OR an active
 * coach role. One helper so both the target's own voucher set (U) and, for standing, THEIR givers'
 * givers (G) share byte-identical anchor logic. Exported: shared with `lib/vouches/newcomer.ts`, which
 * needs the same anchor check for the newcomer tier (§2AJ).
 *
 * Runs 4 bounded queries (registration anchoring needs `team_members` then `registrations`, since
 * PostgREST cannot embed those two tables directly - neither has a foreign key to the other, both only
 * reference `teams`; identity + coach are one query each, run in parallel with the registration lookup).
 */
export async function anchoredSet(svc: Svc, ids: string[]): Promise<Set<string>> {
  const anchored = new Set<string>();
  if (ids.length === 0) return anchored;

  const { data: memberRows } = await svc
    .from('team_members')
    .select('player_id, team_id')
    .in('player_id', ids)
    .limit(BOUND);
  const members = (memberRows ?? []) as { player_id: string; team_id: string }[];
  const teamIds = Array.from(new Set(members.map((m) => m.team_id)));

  const [regRes, idvRes, coachRes] = await Promise.all([
    teamIds.length > 0
      ? svc
          .from('registrations')
          .select('team_id')
          .in('team_id', teamIds)
          .in('status', ANCHOR_REGISTRATION_STATUSES)
          .limit(BOUND)
      : Promise.resolve({ data: [] as { team_id: string }[] | null }),
    svc
      .from('identity_verifications')
      .select('user_id')
      .in('user_id', ids)
      .eq('status', 'approved')
      .limit(BOUND),
    svc
      .from('user_roles')
      .select('user_id')
      .in('user_id', ids)
      .eq('role', 'coach')
      .eq('status', 'active')
      .limit(BOUND),
  ]);

  const anchoredTeamIds = new Set(
    ((regRes.data ?? []) as { team_id: string }[]).map((r) => r.team_id),
  );
  for (const m of members) if (anchoredTeamIds.has(m.team_id)) anchored.add(m.player_id);
  for (const r of (idvRes.data ?? []) as { user_id: string }[]) anchored.add(r.user_id);
  for (const r of (coachRes.data ?? []) as { user_id: string }[]) anchored.add(r.user_id);

  return anchored;
}

export async function gatherV2Facts(targetId: string): Promise<V2Facts> {
  const svc = createServiceClient();
  const nowMs = Date.now();

  // 1) V: the target's own active vouches (§2AF "For a target T with active vouches V").
  const { data: vouchRows } = await svc
    .from('vouches')
    .select('id, voucher_id, skill_level, effective_weight, created_at')
    .eq('target_id', targetId)
    .eq('status', 'active')
    .limit(BOUND);
  const activeVouches = (vouchRows ?? []) as {
    id: string;
    voucher_id: string;
    skill_level: number;
    effective_weight: number | string;
    created_at: string;
  }[];

  // 2) Reciprocity for V (§2AF.2 "Reciprocity: if T has an active vouch for u_i"): the target's own
  // outgoing active vouches, as a set of who-T-vouches-for.
  const { data: outgoingRows } = await svc
    .from('vouches')
    .select('target_id')
    .eq('voucher_id', targetId)
    .eq('status', 'active')
    .limit(BOUND);
  const targetVouchesFor = new Set(
    ((outgoingRows ?? []) as { target_id: string }[]).map((r) => r.target_id),
  );

  const U = Array.from(new Set(activeVouches.map((v) => v.voucher_id)));

  // 3) cslV1 + selfRating (§2AF.4 prior, and the SPIKE baseline): one profiles read covering the
  // target AND every voucher in U (U needs onboarded_at/created_at for accountAgeDays anyway).
  const idsForProfiles = Array.from(new Set([targetId, ...U]));
  const [{ data: profileRows }, { data: cslRow }] = await Promise.all([
    idsForProfiles.length > 0
      ? svc
          .from('profiles')
          .select('id, self_rated_skill, onboarded_at, created_at')
          .in('id', idsForProfiles)
          .limit(BOUND)
      : Promise.resolve({ data: [] as unknown[] | null }),
    svc
      .from('player_skill_profiles')
      .select('community_skill_level')
      .eq('player_id', targetId)
      .maybeSingle(),
  ]);
  const profileById = new Map(
    (
      (profileRows ?? []) as {
        id: string;
        self_rated_skill: number | null;
        onboarded_at: string | null;
        created_at: string | null;
      }[]
    ).map((p) => [p.id, p]),
  );
  const selfRating = profileById.get(targetId)?.self_rated_skill ?? null;
  const cslV1 =
    (cslRow as { community_skill_level: number | null } | null)?.community_skill_level ?? null;

  if (U.length === 0) {
    // No active vouches at all - nothing to score independence over; the prior alone still lets
    // computeSkillV2 anchor CSL_V2 at the self-rating.
    return { targetId, selfRating, cslV1, vouches: [], vouchers: new Map() };
  }

  // 4) clubIds (§2AF.2 "Club bloc decay ... shared active club membership"): active memberships for
  // every voucher in U.
  const { data: clubRows } = await svc
    .from('club_memberships')
    .select('user_id, club_id')
    .in('user_id', U)
    .eq('status', 'active')
    .limit(BOUND);
  const clubsByUser = new Map<string, string[]>();
  for (const r of (clubRows ?? []) as { user_id: string; club_id: string }[]) {
    const list = clubsByUser.get(r.user_id) ?? [];
    list.push(r.club_id);
    clubsByUser.set(r.user_id, list);
  }

  // 5) anchored(u) for U (§2AF.1).
  const anchoredU = await anchoredSet(svc, U);

  // 6) standing(u) for u in U (§2AF.1): vouches u has RECEIVED from OTHER accounts, anchored giver =
  // 1.0, unanchored giver = 0.5, EXCLUDING reciprocal pairs.
  //  - received: active vouches whose TARGET is in U (giver -> u edges).
  //  - givenPairs: U's own active outgoing vouches, used ONLY to detect "u also vouches that giver".
  const [{ data: receivedRows }, { data: givenRows }] = await Promise.all([
    svc
      .from('vouches')
      .select('voucher_id, target_id')
      .in('target_id', U)
      .eq('status', 'active')
      .limit(BOUND),
    svc
      .from('vouches')
      .select('voucher_id, target_id')
      .in('voucher_id', U)
      .eq('status', 'active')
      .limit(BOUND),
  ]);
  const received = (receivedRows ?? []) as { voucher_id: string; target_id: string }[];
  const given = (givenRows ?? []) as { voucher_id: string; target_id: string }[];
  const givenPairs = new Set(given.map((r) => `${r.voucher_id}:${r.target_id}`));

  // §2AJ: outgoingCount(u) - active vouches u has GIVEN (to anyone), from the same `given` rows used
  // for reciprocity above. Feeds the SINGLE_PURPOSE_CLUSTER detector's "exists only to vouch one
  // target" test.
  const outgoingCountByUser = new Map<string, number>();
  for (const r of given) {
    outgoingCountByUser.set(r.voucher_id, (outgoingCountByUser.get(r.voucher_id) ?? 0) + 1);
  }

  // G: the distinct givers behind U's standing, so THEIR anchored status (not U's) decides the 1.0 /
  // 0.5 each contributes (§2AF.1 "counting an anchored giver as 1.0 and an unanchored giver as 0.5").
  const G = Array.from(new Set(received.map((r) => r.voucher_id)));
  const anchoredG = await anchoredSet(svc, G);

  const vouchers = new Map<string, V2Voucher>();
  for (const u of U) {
    const prof = profileById.get(u);
    vouchers.set(u, {
      id: u,
      anchored: anchoredU.has(u),
      standingRaw: standingFromEdges(u, received, givenPairs, anchoredG),
      accountAgeDays: accountAgeDays(prof?.onboarded_at ?? null, prof?.created_at ?? null, nowMs),
      clubIds: clubsByUser.get(u) ?? [],
      outgoingCount: outgoingCountByUser.get(u) ?? 0,
    });
  }

  const vouches: V2Vouch[] = activeVouches.map((v) => ({
    id: v.id,
    voucherId: v.voucher_id,
    level: v.skill_level,
    credentialWeight: Number(v.effective_weight),
    reciprocal: targetVouchesFor.has(v.voucher_id), // §2AF.2: T also has an active vouch for this voucher
    createdAt: v.created_at,
  }));

  return { targetId, selfRating, cslV1, vouches, vouchers };
}
