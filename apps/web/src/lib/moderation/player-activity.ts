import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { assertStaffActor } from '@/lib/moderation/staff';
import { writeAudit } from '@/lib/moderation/audit';
import {
  ACCOUNT_DISABLED_PREFIX,
  HOLD_REASON_PREFIXES,
  isAccountDisabledReason,
  isHoldReason,
} from '@/lib/vouches/hold-reasons';
import { avatarUrl } from '@/lib/storage';
import type { AccountStatus } from '@vouchplay/db';

/**
 * Staff per-player activity reads (master_plan §2AN decision 6, handover v1.67 §30.6-adjacent).
 * Every read here runs behind the `/staff/players/[slug]` page guard (requireStaffPage) AND
 * re-verifies staff at this layer (assertStaffActor) - the same defense-in-depth as the rest of
 * `lib/moderation/*`. This module is the SECOND sanctioned place (after `getVouchAuthorForModeration`
 * / `listActiveVouchesForModeration`) that de-anonymises vouch authorship, and it goes further: unlike
 * the moderation queue's "active vouches only" panel, `listVouchesReceived` shows EVERY status,
 * including withdrawn and invalidated ones, for full account review. That is deliberate and audited -
 * see `auditActivityView`.
 */

type IdentityStatusSummary = 'approved' | 'pending' | 'rejected' | 'none';

interface MiniProfile {
  id: string;
  name: string;
  slug: string | null;
}

function displayName(row: {
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
}): string {
  return (
    [row.first_name, row.last_name].filter(Boolean).join(' ').trim() ||
    row.nickname ||
    'VouchPlay player'
  );
}

/** Bulk profile resolver, local to this module (mirrors `lib/moderation/queries.ts`'s private
 *  resolver - not exported there, so it is not shared, only patterned after). */
async function resolveProfiles(ids: string[]): Promise<Map<string, MiniProfile>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, MiniProfile>();
  if (unique.length === 0) return map;
  const svc = createServiceClient();
  const { data } = await svc
    .from('profiles')
    .select('id, first_name, last_name, nickname, slug')
    .in('id', unique);
  for (const r of (data ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
    slug: string | null;
  }>) {
    map.set(r.id, { id: r.id, name: displayName(r), slug: r.slug });
  }
  return map;
}

/** Turns an `invalidation_reason` into the short, calm phrase the activity view shows next to a
 *  status (handover UX: "held: velocity" / "retracted: account disabled" rather than raw internal
 *  strings). Anything else (a moderator's free-text reason) passes through unchanged. */
function describeInvalidation(reason: string | null): string | null {
  if (!reason) return null;
  if (isHoldReason(reason)) {
    const flagType = reason.startsWith(HOLD_REASON_PREFIXES.VELOCITY_BURST)
      ? 'velocity'
      : 'cluster';
    return `held: ${flagType}`;
  }
  // §2AN decision 4's reversible retraction prefix - vouches retracted because the VOUCHER's account
  // was suspended/banned/deactivated, not a per-vouch moderator action.
  if (isAccountDisabledReason(reason)) {
    const status = reason.slice(ACCOUNT_DISABLED_PREFIX.length);
    return status ? `retracted: account disabled (${status})` : 'retracted: account disabled';
  }
  return reason;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export interface StaffPlayerHeader {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  accountStatus: AccountStatus;
  statusReason: string | null;
  identityStatus: IdentityStatusSummary;
  onboardedAt: string | null;
  createdAt: string;
  vouchesGivenActive: number;
  vouchesReceivedActive: number;
}

export async function getStaffPlayerHeader(slug: string): Promise<StaffPlayerHeader | null> {
  const actor = await assertStaffActor();
  if (!actor) return null;

  const svc = createServiceClient();
  const { data } = await svc
    .from('profiles')
    .select(
      'id, first_name, last_name, nickname, slug, avatar_path, account_status, status_reason, onboarded_at, created_at',
    )
    .eq('slug', slug)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
    slug: string | null;
    avatar_path: string | null;
    account_status: AccountStatus;
    status_reason: string | null;
    onboarded_at: string | null;
    created_at: string;
  };

  const [identityRes, givenRes, receivedRes] = await Promise.all([
    svc
      .from('identity_verifications')
      .select('status')
      .eq('user_id', row.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    svc
      .from('vouches')
      .select('id', { count: 'exact', head: true })
      .eq('voucher_id', row.id)
      .eq('status', 'active'),
    svc
      .from('vouches')
      .select('id', { count: 'exact', head: true })
      .eq('target_id', row.id)
      .eq('status', 'active'),
  ]);

  const latestIdentityStatus = (identityRes.data as { status: string } | null)?.status ?? null;
  const identityStatus: IdentityStatusSummary =
    latestIdentityStatus === 'approved'
      ? 'approved'
      : latestIdentityStatus === 'rejected'
        ? 'rejected'
        : latestIdentityStatus
          ? 'pending' // reviewing / resubmit_required / pending all read as "pending" here
          : 'none';

  return {
    id: row.id,
    name: displayName(row),
    slug: row.slug ?? slug,
    avatarUrl: avatarUrl(row.avatar_path),
    accountStatus: row.account_status,
    statusReason: row.status_reason,
    identityStatus,
    onboardedAt: row.onboarded_at,
    createdAt: row.created_at,
    vouchesGivenActive: givenRes.count ?? 0,
    vouchesReceivedActive: receivedRes.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Vouches (ALL statuses - full-history staff review, not just the active moderation panel)
// ---------------------------------------------------------------------------

export interface StaffVouchGiven {
  id: string;
  targetId: string;
  targetName: string;
  targetSlug: string | null;
  skillLevel: number;
  effectiveWeight: number;
  usedCoachWeight: boolean;
  anonymous: boolean;
  status: string;
  invalidationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listVouchesGiven(playerId: string): Promise<StaffVouchGiven[]> {
  const actor = await assertStaffActor();
  if (!actor) return [];
  const svc = createServiceClient();
  const { data } = await svc
    .from('vouches')
    .select(
      'id, target_id, skill_level, effective_weight, used_coach_weight, visibility, status, invalidation_reason, created_at, updated_at',
    )
    .eq('voucher_id', playerId)
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Array<{
    id: string;
    target_id: string;
    skill_level: number;
    effective_weight: number;
    used_coach_weight: boolean;
    visibility: string;
    status: string;
    invalidation_reason: string | null;
    created_at: string;
    updated_at: string;
  }>;
  const profiles = await resolveProfiles(rows.map((r) => r.target_id));
  return rows.map((r) => ({
    id: r.id,
    targetId: r.target_id,
    targetName: profiles.get(r.target_id)?.name ?? 'Unknown',
    targetSlug: profiles.get(r.target_id)?.slug ?? null,
    skillLevel: r.skill_level,
    effectiveWeight: Number(r.effective_weight),
    usedCoachWeight: r.used_coach_weight,
    anonymous: r.visibility === 'anonymous',
    status: r.status,
    invalidationReason: describeInvalidation(r.invalidation_reason),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export interface StaffVouchReceived {
  id: string;
  voucherId: string;
  voucherName: string;
  voucherSlug: string | null;
  skillLevel: number;
  effectiveWeight: number;
  usedCoachWeight: boolean;
  anonymous: boolean;
  status: string;
  invalidationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * ALL statuses, voucher identity revealed - the sanctioned de-anonymised view (handover §37, §4.5:
 * "See anonymous voucher identity: Moderation need only"). Reuses the same profile-resolution
 * approach as `listActiveVouchesForModeration`, extended to every status for full account review.
 */
export async function listVouchesReceived(playerId: string): Promise<StaffVouchReceived[]> {
  const actor = await assertStaffActor();
  if (!actor) return [];
  const svc = createServiceClient();
  const { data } = await svc
    .from('vouches')
    .select(
      'id, voucher_id, skill_level, effective_weight, used_coach_weight, visibility, status, invalidation_reason, created_at, updated_at',
    )
    .eq('target_id', playerId)
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Array<{
    id: string;
    voucher_id: string;
    skill_level: number;
    effective_weight: number;
    used_coach_weight: boolean;
    visibility: string;
    status: string;
    invalidation_reason: string | null;
    created_at: string;
    updated_at: string;
  }>;
  const profiles = await resolveProfiles(rows.map((r) => r.voucher_id));
  return rows.map((r) => ({
    id: r.id,
    voucherId: r.voucher_id,
    voucherName: profiles.get(r.voucher_id)?.name ?? 'Unknown',
    voucherSlug: profiles.get(r.voucher_id)?.slug ?? null,
    skillLevel: r.skill_level,
    effectiveWeight: Number(r.effective_weight),
    usedCoachWeight: r.used_coach_weight,
    anonymous: r.visibility === 'anonymous',
    status: r.status,
    invalidationReason: describeInvalidation(r.invalidation_reason),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// ---------------------------------------------------------------------------
// Comments (always attributed - §10.1 - so "revealing" them is not a privacy concern; this is just
// the staff-side full list, mirroring the vouches split of given vs received).
// ---------------------------------------------------------------------------

export interface StaffComment {
  id: string;
  otherName: string;
  otherSlug: string | null;
  body: string;
  status: string;
  vouchId: string;
  createdAt: string;
}

export async function listCommentsGiven(playerId: string): Promise<StaffComment[]> {
  const actor = await assertStaffActor();
  if (!actor) return [];
  const svc = createServiceClient();
  const { data } = await svc
    .from('vouch_comments')
    .select('id, vouch_id, target_id, body, status, created_at')
    .eq('author_id', playerId)
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Array<{
    id: string;
    vouch_id: string;
    target_id: string;
    body: string;
    status: string;
    created_at: string;
  }>;
  const profiles = await resolveProfiles(rows.map((r) => r.target_id));
  return rows.map((r) => ({
    id: r.id,
    otherName: profiles.get(r.target_id)?.name ?? 'Unknown',
    otherSlug: profiles.get(r.target_id)?.slug ?? null,
    body: r.body,
    status: r.status,
    vouchId: r.vouch_id,
    createdAt: r.created_at,
  }));
}

export async function listCommentsReceived(playerId: string): Promise<StaffComment[]> {
  const actor = await assertStaffActor();
  if (!actor) return [];
  const svc = createServiceClient();
  const { data } = await svc
    .from('vouch_comments')
    .select('id, vouch_id, author_id, body, status, created_at')
    .eq('target_id', playerId)
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Array<{
    id: string;
    vouch_id: string;
    author_id: string;
    body: string;
    status: string;
    created_at: string;
  }>;
  const profiles = await resolveProfiles(rows.map((r) => r.author_id));
  return rows.map((r) => ({
    id: r.id,
    otherName: profiles.get(r.author_id)?.name ?? 'Unknown',
    otherSlug: profiles.get(r.author_id)?.slug ?? null,
    body: r.body,
    status: r.status,
    vouchId: r.vouch_id,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Integrity flags on this player (subject_type='user')
// ---------------------------------------------------------------------------

export interface StaffIntegrityFlag {
  id: string;
  flagType: string;
  severity: string | null;
  status: string;
  reason: string;
  createdAt: string;
}

export async function listIntegrityFlags(playerId: string): Promise<StaffIntegrityFlag[]> {
  const actor = await assertStaffActor();
  if (!actor) return [];
  const svc = createServiceClient();
  const { data } = await svc
    .from('fraud_flags')
    .select('id, flag_type, severity, status, evidence, created_at')
    .eq('subject_type', 'user')
    .eq('subject_id', playerId)
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Array<{
    id: string;
    flag_type: string;
    severity: string | null;
    status: string;
    evidence: Record<string, unknown> | null;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    flagType: r.flag_type,
    severity: r.severity,
    status: r.status,
    reason: typeof r.evidence?.reason === 'string' ? (r.evidence.reason as string) : '',
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Account history - audit_logs where the player is actor or entity, merged
// ---------------------------------------------------------------------------

export interface StaffAccountHistoryItem {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string;
  entityType: string | null;
  reason: string | null;
  createdAt: string;
}

export async function listAccountHistory(playerId: string): Promise<StaffAccountHistoryItem[]> {
  const actor = await assertStaffActor();
  if (!actor) return [];
  const svc = createServiceClient();
  const COLS = 'id, actor_id, action, entity_type, entity_id, reason, created_at';
  const [asEntity, asActor] = await Promise.all([
    svc
      .from('audit_logs')
      .select(COLS)
      .eq('entity_id', playerId)
      .order('created_at', { ascending: false })
      .limit(200),
    svc
      .from('audit_logs')
      .select(COLS)
      .eq('actor_id', playerId)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  type Row = {
    id: string;
    actor_id: string | null;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    reason: string | null;
    created_at: string;
  };
  const byId = new Map<string, Row>();
  for (const r of [...((asEntity.data ?? []) as Row[]), ...((asActor.data ?? []) as Row[])]) {
    byId.set(r.id, r);
  }
  const rows = Array.from(byId.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 200);

  const profiles = await resolveProfiles(
    rows.map((r) => r.actor_id).filter((id): id is string => !!id),
  );
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorId: r.actor_id,
    actorName: r.actor_id ? (profiles.get(r.actor_id)?.name ?? 'Unknown') : 'System',
    entityType: r.entity_type,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// The audited open itself - this view de-anonymises voucher identity, so every open is logged
// (master_plan §2AN decision 6).
// ---------------------------------------------------------------------------

export async function auditActivityView(
  playerId: string,
  actorId: string,
  actorRole: string,
): Promise<void> {
  await writeAudit({
    actorId,
    actorRole,
    action: 'staff.player_activity.view',
    entityType: 'user',
    entityId: playerId,
  });
}
