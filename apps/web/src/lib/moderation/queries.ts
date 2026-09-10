import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { assertStaffActor } from '@/lib/moderation/staff';
import { selectSkillProfiles, type SkillProfileRow } from '@/lib/vouches/active-skill';
import type {
  ReportRow,
  SkillReviewRow,
  SupportTicketRow,
  FraudFlagRow,
  FraudStatus,
} from '@vouchplay/db';

/**
 * Staff-side moderation reads (handover §30.6). All of these run behind the /staff page guard
 * (requireStaffPage) AND re-verify staff at the action layer for anything sensitive. The service
 * client is used because staff must see rows that RLS would otherwise scope to the owner - this is the
 * ONLY place anonymous voucher identity is resolvable, and getVouchAuthorForModeration guards it
 * again (handover §37, §4.5 "See anonymous voucher identity: Moderation need only").
 */

interface MiniProfile {
  id: string;
  name: string;
  slug: string | null;
}

async function resolveProfiles(ids: string[]): Promise<Map<string, MiniProfile>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, MiniProfile>();
  if (unique.length === 0) return map;
  const svc = createServiceClient();
  const { data } = await svc
    .from('profiles')
    .select('id, first_name, last_name, nickname, slug')
    .in('id', unique);
  for (const r of data ?? []) {
    const row = r as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      nickname: string | null;
      slug: string | null;
    };
    const name =
      [row.first_name, row.last_name].filter(Boolean).join(' ').trim() ||
      row.nickname ||
      'VouchPlay player';
    map.set(row.id, { id: row.id, name, slug: row.slug });
  }
  return map;
}

export interface ReportItem {
  row: ReportRow;
  reporter: MiniProfile | null;
  targetPlayer: MiniProfile | null;
}
export interface SkillReviewItem {
  row: SkillReviewRow;
  requester: MiniProfile | null;
  target: MiniProfile | null;
}
export interface FraudFlagItem {
  row: FraudFlagRow;
  subject: MiniProfile | null;
}
export interface SupportTicketItem {
  row: SupportTicketRow;
  user: MiniProfile | null;
}

const OPEN_REPORT = ['open', 'reviewing'];
const OPEN_REVIEW = ['open', 'under_review'];
const OPEN_FLAG = ['open', 'reviewing'];
const OPEN_TICKET = ['open', 'pending_user', 'pending_staff'];

// Explicit column lists (handover: no select('*') in list endpoints, even staff-only ones).
const REPORT_COLS =
  'id, reporter_id, target_type, target_id, reason_code, details, evidence, status, assigned_to, resolution, created_at, updated_at';
const SKILL_REVIEW_COLS =
  'id, requester_id, target_player_id, tournament_id, division_id, reason, evidence, status, reviewed_by, resolution, created_at, updated_at';
const FRAUD_FLAG_COLS =
  'id, subject_type, subject_id, flag_type, severity, evidence, status, reviewed_by, resolution, created_at, updated_at';
const SUPPORT_TICKET_COLS =
  'id, user_id, category, subject, body, status, assigned_to, created_at, updated_at';

export async function listReports(includeResolved = false): Promise<ReportItem[]> {
  const svc = createServiceClient();
  let q = svc
    .from('reports')
    .select(REPORT_COLS)
    .order('created_at', { ascending: false })
    .limit(200);
  if (!includeResolved) q = q.in('status', OPEN_REPORT);
  const { data } = await q;
  const rows = (data ?? []) as ReportRow[];
  const profiles = await resolveProfiles([
    ...rows.map((r) => r.reporter_id),
    ...rows.filter((r) => r.target_type === 'player').map((r) => r.target_id),
  ]);
  return rows.map((row) => ({
    row,
    reporter: profiles.get(row.reporter_id) ?? null,
    targetPlayer: row.target_type === 'player' ? (profiles.get(row.target_id) ?? null) : null,
  }));
}

export async function listSkillReviews(includeResolved = false): Promise<SkillReviewItem[]> {
  const svc = createServiceClient();
  let q = svc
    .from('skill_reviews')
    .select(SKILL_REVIEW_COLS)
    .order('created_at', { ascending: false })
    .limit(200);
  if (!includeResolved) q = q.in('status', OPEN_REVIEW);
  const { data } = await q;
  const rows = (data ?? []) as SkillReviewRow[];
  const profiles = await resolveProfiles([
    ...rows.map((r) => r.requester_id),
    ...rows.map((r) => r.target_player_id),
  ]);
  return rows.map((row) => ({
    row,
    requester: profiles.get(row.requester_id) ?? null,
    target: profiles.get(row.target_player_id) ?? null,
  }));
}

export async function listFraudFlags(includeResolved = false): Promise<FraudFlagItem[]> {
  const svc = createServiceClient();
  let q = svc
    .from('fraud_flags')
    .select(FRAUD_FLAG_COLS)
    .order('created_at', { ascending: false })
    .limit(200);
  if (!includeResolved) q = q.in('status', OPEN_FLAG);
  const { data } = await q;
  const rows = (data ?? []) as FraudFlagRow[];
  const userIds = rows
    .filter((r) => r.subject_type === 'user' || r.subject_type === 'coach')
    .map((r) => r.subject_id);
  const profiles = await resolveProfiles(userIds);
  return rows.map((row) => ({
    row,
    subject:
      row.subject_type === 'user' || row.subject_type === 'coach'
        ? (profiles.get(row.subject_id) ?? null)
        : null,
  }));
}

// ---------------------------------------------------------------------------
// Vouch integrity queue (§2AF "Staff -> Moderation -> Vouch integrity"). Deliberately its own read,
// not a filter on listFraudFlags: the card needs CSL V1 vs V2 side by side plus N_eff, which the
// generic fraud-flag list has no reason to carry. NEVER returns a voucher's identity - only vouch ids
// inside `evidence` (staff-only under existing RLS, same as the rest of this file).
// ---------------------------------------------------------------------------

const INTEGRITY_FLAG_TYPES = [
  'VELOCITY_BURST',
  'LOW_TRUST_SWARM',
  'RECIPROCAL_RING',
  'CLUB_BLOC',
  'SPIKE',
] as const;

export interface IntegrityQueueItem {
  id: string;
  flagType: string;
  severity: string | null;
  status: FraudStatus;
  /** Plain-language reason (§2AF "8 vouches in 6 hours, 6 from brand-new accounts") - never a narrative
   *  naming a voucher. */
  reason: string;
  createdAt: string;
  subject: { id: string; slug: string | null; name: string };
  skill: {
    self: number | null;
    v1: { csl: number | null; sts: number | null };
    /** Null when STS_V2 has not been computed for this player yet (migration 0034 not applied, or no
     *  recompute has run since) - the card shows "not yet computed" rather than a misleading 0. */
    v2: { csl: number | null; sts: number | null } | null;
    /** V2's independent-equivalent evidence count - "Based on N independent players" (§2AF UX). */
    nEff: number | null;
  };
  /** How many of this flag's held vouches are STILL invalidated under a velocity hold right now. */
  heldCount: number;
  evidence: Record<string, unknown>;
}

export async function loadIntegrityQueue(): Promise<IntegrityQueueItem[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('fraud_flags')
    .select('id, subject_type, subject_id, flag_type, severity, evidence, status, created_at')
    .in('flag_type', INTEGRITY_FLAG_TYPES)
    .in('status', ['open', 'reviewing'])
    .order('created_at', { ascending: false })
    .limit(100);
  const rows = (data ?? []) as {
    id: string;
    subject_type: string;
    subject_id: string;
    flag_type: string;
    severity: string | null;
    evidence: Record<string, unknown> | null;
    status: FraudStatus;
    created_at: string;
  }[];
  if (rows.length === 0) return [];

  const subjectIds = Array.from(new Set(rows.map((r) => r.subject_id)));

  // Subject display name/slug (reuses the same resolver as every other moderation list) + self-rating.
  const [profiles, selfRatedRes] = await Promise.all([
    resolveProfiles(subjectIds),
    svc.from('profiles').select('id, self_rated_skill').in('id', subjectIds).limit(1000),
  ]);
  const selfRatedById = new Map(
    ((selfRatedRes.data ?? []) as { id: string; self_rated_skill: number | null }[]).map((r) => [
      r.id,
      r.self_rated_skill,
    ]),
  );

  // CSL V1 vs V2 side by side (§2AF card spec) - deliberately requests V2 regardless of the site-wide
  // `skill_algorithm_active_version` switch (staff needs to compare both, not just "the active one"),
  // failing open to V1-only columns when migration 0034 is not applied yet (§2R).
  const { rows: skillRows } = await selectSkillProfiles<SkillProfileRow & { player_id: string }>(
    'STS_V2',
    (columns) =>
      svc.from('player_skill_profiles').select(columns).in('player_id', subjectIds).limit(1000),
    'player_id',
  );
  const skillByPlayer = new Map(skillRows.map((r) => [r.player_id, r]));

  // Held-vouch status, batched across every flag's evidence.heldVouchIds in one query.
  const allHeldIds = Array.from(
    new Set(
      rows.flatMap((r) =>
        Array.isArray(r.evidence?.heldVouchIds)
          ? (r.evidence?.heldVouchIds as unknown[]).filter(
              (v): v is string => typeof v === 'string',
            )
          : [],
      ),
    ),
  );
  const { data: heldVouchRows } =
    allHeldIds.length > 0
      ? await svc
          .from('vouches')
          .select('id, status, invalidation_reason')
          .in('id', allHeldIds)
          .limit(1000)
      : { data: [] as { id: string; status: string; invalidation_reason: string | null }[] };
  const heldStatusById = new Map(
    (
      (heldVouchRows ?? []) as { id: string; status: string; invalidation_reason: string | null }[]
    ).map((r) => [r.id, r]),
  );

  return rows.map((row) => {
    const heldIds = Array.isArray(row.evidence?.heldVouchIds)
      ? (row.evidence?.heldVouchIds as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    const heldCount = heldIds.filter((id) => {
      const v = heldStatusById.get(id);
      return (
        v?.status === 'invalidated' && (v.invalidation_reason ?? '').startsWith('velocity_hold:')
      );
    }).length;

    const skillRow = skillByPlayer.get(row.subject_id);
    const v1 = {
      csl: skillRow?.community_skill_level ?? null,
      sts: skillRow?.sts != null ? Number(skillRow.sts) : null,
    };
    const hasV2 =
      skillRow?.community_skill_level_v2 != null ||
      skillRow?.sts_v2 != null ||
      skillRow?.n_eff_v2 != null;
    const v2 = hasV2
      ? {
          csl: skillRow?.community_skill_level_v2 ?? null,
          sts: skillRow?.sts_v2 != null ? Number(skillRow.sts_v2) : null,
        }
      : null;
    const nEff = skillRow?.n_eff_v2 != null ? Number(skillRow.n_eff_v2) : null;

    const profile = profiles.get(row.subject_id);
    return {
      id: row.id,
      flagType: row.flag_type,
      severity: row.severity,
      status: row.status,
      reason: typeof row.evidence?.reason === 'string' ? (row.evidence.reason as string) : '',
      createdAt: row.created_at,
      subject: {
        id: row.subject_id,
        slug: profile?.slug ?? null,
        name: profile?.name ?? 'VouchPlay player',
      },
      skill: { self: selfRatedById.get(row.subject_id) ?? null, v1, v2, nEff },
      heldCount,
      evidence: row.evidence ?? {},
    };
  });
}

export async function listSupportTickets(includeResolved = false): Promise<SupportTicketItem[]> {
  const svc = createServiceClient();
  let q = svc
    .from('support_tickets')
    .select(SUPPORT_TICKET_COLS)
    .order('created_at', { ascending: false })
    .limit(200);
  if (!includeResolved) q = q.in('status', OPEN_TICKET);
  const { data } = await q;
  const rows = (data ?? []) as SupportTicketRow[];
  const profiles = await resolveProfiles(rows.map((r) => r.user_id ?? '').filter(Boolean));
  return rows.map((row) => ({
    row,
    user: row.user_id ? (profiles.get(row.user_id) ?? null) : null,
  }));
}

export interface ModerationCounts {
  reports: number;
  skillReviews: number;
  fraudFlags: number;
  supportTickets: number;
  clubs: number;
  roleApps: number;
}

export async function getModerationCounts(): Promise<ModerationCounts> {
  const svc = createServiceClient();
  const [reports, skillReviews, fraudFlags, supportTickets, clubs, roleApps] = await Promise.all([
    svc.from('reports').select('id', { count: 'exact', head: true }).in('status', OPEN_REPORT),
    svc
      .from('skill_reviews')
      .select('id', { count: 'exact', head: true })
      .in('status', OPEN_REVIEW),
    svc.from('fraud_flags').select('id', { count: 'exact', head: true }).in('status', OPEN_FLAG),
    svc
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', OPEN_TICKET),
    svc
      .from('clubs')
      .select('id', { count: 'exact', head: true })
      .eq('verification_status', 'pending')
      .neq('activity_status', 'deleted'),
    svc
      .from('role_applications')
      .select('id', { count: 'exact', head: true })
      .eq('role_requested', 'organizer')
      .in('status', ['pending', 'reviewing']),
  ]);
  return {
    reports: reports.count ?? 0,
    skillReviews: skillReviews.count ?? 0,
    fraudFlags: fraudFlags.count ?? 0,
    supportTickets: supportTickets.count ?? 0,
    clubs: clubs.count ?? 0,
    roleApps: roleApps.count ?? 0,
  };
}

export interface RoleAppItem {
  id: string;
  role: string;
  motivation: string | null;
  createdAt: string;
  applicantName: string | null;
  applicantSlug: string | null;
}

/** Open role applications for the admin queue (§30.2). Staff-only (page-guarded). */
export async function listRoleApplications(): Promise<RoleAppItem[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('role_applications')
    .select('id, user_id, role_requested, answers, status, created_at')
    .eq('role_requested', 'organizer')
    .in('status', ['pending', 'reviewing'])
    .order('created_at', { ascending: true })
    .limit(200);
  const rows = (data ?? []) as Array<{
    id: string;
    user_id: string;
    role_requested: string;
    answers: Record<string, unknown> | null;
    created_at: string;
  }>;
  const names = await resolveProfiles(rows.map((r) => r.user_id));
  return rows.map((r) => ({
    id: r.id,
    role: r.role_requested,
    motivation: typeof r.answers?.motivation === 'string' ? (r.answers.motivation as string) : null,
    createdAt: r.created_at,
    applicantName: names.get(r.user_id)?.name ?? null,
    applicantSlug: names.get(r.user_id)?.slug ?? null,
  }));
}

export interface ClubModerationItem {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  verificationStatus: string;
  activityStatus: string;
  createdAt: string;
  ownerName: string | null;
}

/** Clubs needing verification review (§15.2). Staff-only (page-guarded). */
export async function listClubsForModeration(): Promise<ClubModerationItem[]> {
  return listClubsForAdministration(false);
}

/** All non-deleted clubs for the AAL2 Admin control centre; Staff keeps the focused queue. */
export async function listClubsForAdministration(includeAll = true): Promise<ClubModerationItem[]> {
  const svc = createServiceClient();
  let query = svc
    .from('clubs')
    .select('id, slug, name, city, verification_status, activity_status, created_by, created_at')
    .neq('activity_status', 'deleted')
    .order('created_at', { ascending: false })
    .limit(200);
  if (!includeAll) query = query.or('verification_status.eq.pending,activity_status.eq.suspended');
  const { data } = await query;
  const rows = (data ?? []) as Array<{
    id: string;
    slug: string;
    name: string;
    city: string | null;
    verification_status: string;
    activity_status: string;
    created_by: string;
    created_at: string;
  }>;
  const owners = await resolveProfiles(rows.map((r) => r.created_by));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    city: r.city,
    verificationStatus: r.verification_status,
    activityStatus: r.activity_status,
    createdAt: r.created_at,
    ownerName: owners.get(r.created_by)?.name ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Anonymous voucher identity - staff-gated ONLY (§37, §4.5). Never call from a public path.
// ---------------------------------------------------------------------------
export interface VouchAuthorForModeration {
  voucherId: string;
  voucherName: string;
  voucherSlug: string | null;
  wasAnonymous: boolean;
  skillLevel: number;
  targetId: string;
  status: string;
}

/**
 * Reveal the real author of a vouch for moderation purposes. Re-verifies a stepped-up staff session
 * (assertStaffActor) before returning identity - this is the single authorized path that pierces the
 * anonymity the public UI guarantees. Returns null when unauthorized or not found.
 */
export async function getVouchAuthorForModeration(
  vouchId: string,
): Promise<VouchAuthorForModeration | null> {
  const actor = await assertStaffActor();
  if (!actor) return null;
  const svc = createServiceClient();
  const { data } = await svc
    .from('vouches')
    .select('voucher_id, visibility, skill_level, target_id, status')
    .eq('id', vouchId)
    .maybeSingle();
  if (!data) return null;
  const v = data as {
    voucher_id: string;
    visibility: string;
    skill_level: number;
    target_id: string;
    status: string;
  };
  const profiles = await resolveProfiles([v.voucher_id]);
  const p = profiles.get(v.voucher_id);
  return {
    voucherId: v.voucher_id,
    voucherName: p?.name ?? 'Unknown',
    voucherSlug: p?.slug ?? null,
    wasAnonymous: v.visibility === 'anonymous',
    skillLevel: v.skill_level,
    targetId: v.target_id,
    status: v.status,
  };
}

/** Active vouches for a target, for the moderation vouch-invalidation panel (staff-gated). */
export interface ModerationVouch {
  id: string;
  voucherName: string;
  voucherSlug: string | null;
  wasAnonymous: boolean;
  skillLevel: number;
  interactionType: string;
  usedCoachWeight: boolean;
  createdAt: string;
}

export async function listActiveVouchesForModeration(targetId: string): Promise<ModerationVouch[]> {
  const actor = await assertStaffActor();
  if (!actor) return [];
  const svc = createServiceClient();
  const { data } = await svc
    .from('vouches')
    .select(
      'id, voucher_id, visibility, skill_level, interaction_type, used_coach_weight, created_at',
    )
    .eq('target_id', targetId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as Array<{
    id: string;
    voucher_id: string;
    visibility: string;
    skill_level: number;
    interaction_type: string;
    used_coach_weight: boolean;
    created_at: string;
  }>;
  const profiles = await resolveProfiles(rows.map((r) => r.voucher_id));
  return rows.map((r) => ({
    id: r.id,
    voucherName: profiles.get(r.voucher_id)?.name ?? 'Unknown',
    voucherSlug: profiles.get(r.voucher_id)?.slug ?? null,
    wasAnonymous: r.visibility === 'anonymous',
    skillLevel: r.skill_level,
    interactionType: r.interaction_type,
    usedCoachWeight: r.used_coach_weight,
    createdAt: r.created_at,
  }));
}
