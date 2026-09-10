/**
 * Shared STS_V2 fact-gathering for the §2AF shadow report and backfill scripts. Batch-gathers V2
 * engine inputs for EVERY rated player (every row in `player_skill_profiles`) with bounded, paginated
 * queries - no `select('*')`, no unbounded `.limit()`. Semantics here MUST agree with the app's
 * per-player gatherer (§2AF E3, `lib/vouches/v2-facts.ts`): same anchors, same standing rule, same
 * reciprocity exclusion, same account-age formula. This module does NOT reimplement the STS_V2 math
 * itself (trust/independence/aggregation) - it only assembles the raw `V2Voucher`/`V2Vouch` facts that
 * `computeSkillV2` and `detectAnomalies` (from `@vouchplay/core`) consume.
 *
 * Env: reads `apps/web/.env.local` the same way as `scripts/audit-eligibility-scan.mjs` and
 * `scripts/verify-rpc-grants.mjs` (repo-root-relative, KEY=VALUE parsing, quotes stripped).
 */
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SYSTEM_SETTINGS, type SystemSettingsKey } from '@vouchplay/config';
import type { AnomalyParams, V2Params, V2Voucher, V2Vouch } from '@vouchplay/core';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Bounded page size for every paginated table scan - keeps each request well under PostgREST caps. */
const PAGE_SIZE = 1000;

/** Registration statuses that count as a real-world "this is a paying human" anchor (§2AF.1). */
const ANCHOR_REGISTRATION_STATUSES = ['confirmed', 'payment_submitted', 'payment_pending'] as const;

// ---------------------------------------------------------------------------------------------
// Env + client (mirrors scripts/audit-eligibility-scan.mjs and scripts/verify-rpc-grants.mjs).
// ---------------------------------------------------------------------------------------------

/** Parses `apps/web/.env.local` (repo-root-relative) the same way the existing .mjs scripts do. */
export function loadWebEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync('apps/web/.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m?.[1] !== undefined && m[2] !== undefined) {
      env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

/** Service-role client (bypasses RLS) - read/write scripts only, never shipped to the browser. */
export function createServiceRoleClient(): SupabaseClient {
  const env = loadWebEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local',
    );
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Generic bounded pagination helper (range-based, `PAGE_SIZE` rows per page). `fetchPage` must apply
 * `.range(from, to)` itself (and its own `.order()` for a stable page boundary) and return the raw
 * PostgREST result; this loops until a short page proves there is no more data. Throws on any page
 * error rather than silently truncating results.
 */
async function fetchAllPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Row shapes (only the columns the §2AF fact-gatherer needs from each table).
// ---------------------------------------------------------------------------------------------

interface VouchRow {
  id: string;
  voucher_id: string;
  target_id: string;
  skill_level: number;
  effective_weight: number | string;
  created_at: string;
}

interface ProfileRow {
  id: string;
  self_rated_skill: number | null;
  onboarded_at: string | null;
  created_at: string;
  slug: string | null;
  nickname: string | null;
}

interface SkillProfileRow {
  player_id: string;
  community_skill_level: number | null;
  sts: number | string;
  unique_voucher_count: number;
}

interface ClubMembershipRow {
  club_id: string;
  user_id: string;
}

interface TeamMemberRow {
  team_id: string;
  player_id: string;
}

interface RegistrationRow {
  team_id: string;
  status: string;
}

interface IdentityVerificationRow {
  user_id: string;
}

interface UserRoleRow {
  user_id: string;
}

/** Per-target facts the shadow report / backfill need, plus the V1 snapshot to diff against. */
export interface TargetFacts {
  selfRating: number | null;
  cslV1: number | null;
  stsV1: number;
  uniqueV1: number;
  vouches: V2Vouch[];
  vouchers: Map<string, V2Voucher>;
}

export interface AllFacts {
  /** Keyed by target (rated player) id - every row currently in `player_skill_profiles`. */
  byTarget: Map<string, TargetFacts>;
  /** Slug/nickname for report attribution, keyed by profile id (every profile loaded). */
  profiles: Map<string, { slug: string | null; nickname: string | null }>;
}

/**
 * Gathers §2AF V2 facts for every rated player (every `player_skill_profiles` row) in bounded,
 * paginated queries. Pure I/O assembly - no STS_V2 math happens here (see `@vouchplay/core`).
 */
export async function buildAllFacts(sb: SupabaseClient, now: Date): Promise<AllFacts> {
  const [
    vouchRows,
    profileRows,
    skillProfileRows,
    clubMembershipRows,
    teamMemberRows,
    registrationRows,
    identityRows,
    coachRoleRows,
  ] = await Promise.all([
    fetchAllPages<VouchRow>((from, to) =>
      sb
        .from('vouches')
        .select('id, voucher_id, target_id, skill_level, effective_weight, created_at')
        .eq('status', 'active')
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<ProfileRow>((from, to) =>
      sb
        .from('profiles')
        .select('id, self_rated_skill, onboarded_at, created_at, slug, nickname')
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<SkillProfileRow>((from, to) =>
      sb
        .from('player_skill_profiles')
        .select('player_id, community_skill_level, sts, unique_voucher_count')
        .order('player_id', { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<ClubMembershipRow>((from, to) =>
      sb
        .from('club_memberships')
        .select('club_id, user_id')
        .eq('status', 'active')
        .order('club_id', { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<TeamMemberRow>((from, to) =>
      sb
        .from('team_members')
        .select('team_id, player_id')
        .order('team_id', { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<RegistrationRow>((from, to) =>
      sb
        .from('registrations')
        .select('team_id, status')
        .in('status', [...ANCHOR_REGISTRATION_STATUSES])
        .order('team_id', { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<IdentityVerificationRow>((from, to) =>
      sb
        .from('identity_verifications')
        .select('user_id')
        .eq('status', 'approved')
        .order('user_id', { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<UserRoleRow>((from, to) =>
      sb
        .from('user_roles')
        .select('user_id')
        .eq('role', 'coach')
        .eq('status', 'active')
        .order('user_id', { ascending: true })
        .range(from, to),
    ),
  ]);

  // ---- profiles map (attribution + self-rating + account-age inputs) ----
  const profilesById = new Map<string, ProfileRow>();
  const profiles = new Map<string, { slug: string | null; nickname: string | null }>();
  for (const p of profileRows) {
    profilesById.set(p.id, p);
    profiles.set(p.id, { slug: p.slug, nickname: p.nickname });
  }

  // ---- anchors: paid/confirmed registrant (via team_members) UNION approved identity UNION active coach ----
  const anchoredTeamIds = new Set(registrationRows.map((r) => r.team_id));
  const anchored = new Set<string>();
  for (const tm of teamMemberRows) {
    if (anchoredTeamIds.has(tm.team_id)) anchored.add(tm.player_id);
  }
  for (const iv of identityRows) anchored.add(iv.user_id);
  for (const ur of coachRoleRows) anchored.add(ur.user_id);

  // ---- active club memberships per user ----
  const clubIdsByUser = new Map<string, string[]>();
  for (const cm of clubMembershipRows) {
    const list = clubIdsByUser.get(cm.user_id);
    if (list) {
      list.push(cm.club_id);
    } else {
      clubIdsByUser.set(cm.user_id, [cm.club_id]);
    }
  }

  // ---- vouch graph: outgoing (voucher -> targets) and received (target -> vouches) ----
  const outgoing = new Map<string, Set<string>>();
  const received = new Map<string, VouchRow[]>();
  for (const v of vouchRows) {
    const out = outgoing.get(v.voucher_id);
    if (out) {
      out.add(v.target_id);
    } else {
      outgoing.set(v.voucher_id, new Set([v.target_id]));
    }
    const recv = received.get(v.target_id);
    if (recv) {
      recv.push(v);
    } else {
      received.set(v.target_id, [v]);
    }
  }

  const nowMs = now.getTime();
  function accountAgeDays(profile: ProfileRow | undefined): number {
    if (!profile) return 0;
    const anchorIso = profile.onboarded_at ?? profile.created_at;
    const anchorMs = Date.parse(anchorIso);
    if (!Number.isFinite(anchorMs)) return 0;
    return Math.max(0, (nowMs - anchorMs) / MS_PER_DAY);
  }

  /**
   * `standingRaw` for user `u`: vouches u has RECEIVED from others, excluding reciprocal pairs (u also
   * actively vouches that giver), counting an anchored giver as 1.0 and an unanchored giver as 0.5
   * (§2AF.1). Memoized per voucher id since many targets share the same voucher.
   */
  const standingCache = new Map<string, number>();
  function standingRawFor(u: string): number {
    const cached = standingCache.get(u);
    if (cached !== undefined) return cached;
    const uOutgoing = outgoing.get(u);
    let standing = 0;
    for (const vouch of received.get(u) ?? []) {
      if (uOutgoing?.has(vouch.voucher_id)) continue; // reciprocal pair - excluded from standing
      standing += anchored.has(vouch.voucher_id) ? 1.0 : 0.5;
    }
    standingCache.set(u, standing);
    return standing;
  }

  const voucherFactsCache = new Map<string, V2Voucher>();
  function voucherFactsFor(id: string): V2Voucher {
    const cached = voucherFactsCache.get(id);
    if (cached) return cached;
    const facts: V2Voucher = {
      id,
      anchored: anchored.has(id),
      standingRaw: standingRawFor(id),
      accountAgeDays: accountAgeDays(profilesById.get(id)),
      clubIds: clubIdsByUser.get(id) ?? [],
    };
    voucherFactsCache.set(id, facts);
    return facts;
  }

  // ---- assemble per-target facts for every rated player (every player_skill_profiles row) ----
  const byTarget = new Map<string, TargetFacts>();
  for (const sp of skillProfileRows) {
    const targetId = sp.player_id;
    const profile = profilesById.get(targetId);
    const targetOutgoing = outgoing.get(targetId);
    const receivedVouches = received.get(targetId) ?? [];

    const vouches: V2Vouch[] = receivedVouches.map((v) => ({
      id: v.id,
      voucherId: v.voucher_id,
      level: v.skill_level,
      credentialWeight: Number(v.effective_weight),
      reciprocal: targetOutgoing?.has(v.voucher_id) ?? false,
      createdAt: v.created_at,
    }));

    const vouchers = new Map<string, V2Voucher>();
    for (const v of receivedVouches) {
      if (!vouchers.has(v.voucher_id)) vouchers.set(v.voucher_id, voucherFactsFor(v.voucher_id));
    }

    byTarget.set(targetId, {
      selfRating: profile?.self_rated_skill ?? null,
      cslV1: sp.community_skill_level,
      stsV1: Number(sp.sts),
      uniqueV1: sp.unique_voucher_count,
      vouches,
      vouchers,
    });
  }

  return { byTarget, profiles };
}

// ---------------------------------------------------------------------------------------------
// system_settings overlay -> engine params (§2AF trust/independence/prior/velocity/anomaly keys).
// ---------------------------------------------------------------------------------------------

export interface SettingsRow {
  key: string;
  value: unknown;
}

function numSetting(overlay: Map<string, unknown>, key: SystemSettingsKey): number {
  const v = overlay.get(key);
  return typeof v === 'number' ? v : Number(DEFAULT_SYSTEM_SETTINGS[key]);
}

/**
 * Overlays live `system_settings` rows on top of `DEFAULT_SYSTEM_SETTINGS` and resolves the `V2Params`
 * / `AnomalyParams` the engine needs - so the report/backfill reflect any admin-tuned values, exactly
 * as the app's live settings loader (`apps/web/src/lib/settings.ts`) does for V1.
 */
export function paramsFromSettings(rows: SettingsRow[]): {
  params: V2Params;
  anomaly: AnomalyParams;
} {
  const overlay = new Map<string, unknown>();
  for (const row of rows) overlay.set(row.key, row.value);

  const params: V2Params = {
    trustUnknownFactor: numSetting(overlay, 'skill_v2_trust_unknown_factor'),
    trustUnanchoredFactor: numSetting(overlay, 'skill_v2_trust_unanchored_factor'),
    trustStandingSaturation: numSetting(overlay, 'skill_v2_trust_standing_saturation'),
    trustMaturityDays: numSetting(overlay, 'skill_v2_trust_maturity_days'),
    reciprocalMultiplier: numSetting(overlay, 'skill_v2_reciprocal_multiplier'),
    blocDecay: numSetting(overlay, 'skill_v2_bloc_decay'),
    priorWeight: numSetting(overlay, 'skill_v2_prior_weight'),
    minIndependentVouchers: numSetting(overlay, 'skill_v2_min_independent_vouchers'),
    // Reused from V1 (not duplicated), per settings.ts comment on skill_v2_min_independent_vouchers.
    skillVerifiedMinSts: numSetting(overlay, 'skill_verified_min_sts'),
  };

  const anomaly: AnomalyParams = {
    velocityWindowHours: numSetting(overlay, 'skill_v2_velocity_window_hours'),
    velocityBurstMin: numSetting(overlay, 'skill_v2_velocity_burst_min'),
    velocityLowTrustShare: numSetting(overlay, 'skill_v2_velocity_low_trust_share'),
    velocityLowTrustVt: numSetting(overlay, 'skill_v2_velocity_low_trust_vt'),
    swarmMin: numSetting(overlay, 'skill_v2_swarm_min'),
    ringReciprocalShare: numSetting(overlay, 'skill_v2_ring_reciprocal_share'),
    blocShare: numSetting(overlay, 'skill_v2_bloc_share'),
    spikeBands: numSetting(overlay, 'skill_v2_spike_bands'),
  };

  return { params, anomaly };
}

/** V1 Skill-Verified threshold, also read live (skill_verified_min_unique_vouchers is V1-only). */
export function v1SkillVerifiedThresholds(rows: SettingsRow[]): {
  minSts: number;
  minUniqueVouchers: number;
} {
  const overlay = new Map<string, unknown>();
  for (const row of rows) overlay.set(row.key, row.value);
  return {
    minSts: numSetting(overlay, 'skill_verified_min_sts'),
    minUniqueVouchers: numSetting(overlay, 'skill_verified_min_unique_vouchers'),
  };
}
