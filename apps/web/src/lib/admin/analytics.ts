import 'server-only';
import { computeAnalyticsSummary, type AnalyticsRaw, type AnalyticsSummary } from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';
import { getModerationCounts } from '@/lib/moderation/queries';

/**
 * Admin analytics data gathering (handover §31). Cheap `head: true` COUNT queries (no rows fetched)
 * for every metric; two small capped scans for the distinct-voucher count and verified revenue sum
 * (adequate at pilot volume - revisit with a materialized rollup or RPC before scale). The pure
 * metric math lives in @vouchplay/core (computeAnalyticsSummary), unit-tested there. Authorization
 * is enforced by the page guard (requireAdminPage).
 */

type Svc = ReturnType<typeof createServiceClient>;

// Typed count helper (supabase-js head count).
function baseCount(svc: Svc, table: string) {
  return svc.from(table).select('id', { count: 'exact', head: true });
}

async function headCount(
  svc: Svc,
  table: string,
  apply?: (q: ReturnType<typeof baseCount>) => ReturnType<typeof baseCount>,
): Promise<number> {
  try {
    const q0 = baseCount(svc, table);
    const q = apply ? apply(q0) : q0;
    const { count: c } = await q;
    return c ?? 0;
  } catch {
    return 0;
  }
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const svc = createServiceClient();
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const DAY = 24 * 60 * 60 * 1000;
  const since7 = iso(7 * DAY);
  const since30 = iso(30 * DAY);

  const [
    totalUsers,
    onboardedUsers,
    activeProfiles,
    newUsers7d,
    newUsers30d,
    identityVerifiedUsers,
    skillVerifiedProfiles,
    ratedPlayers,
    activeVouches,
    coachVouches,
    vouchRequests,
    vouches7d,
    vouches30d,
    tournamentsCreated,
    tournamentsPublished,
    interestedCount,
    registrationsTotal,
    confirmedTeams,
    waitlisted,
    withdrawn,
    eligibilityReview,
    eligibilityMismatch,
    paymentsVerified,
    activeClubs,
    verifiedClubs,
    clubMemberships,
    moderation,
    accountActions,
    uniqueVouchers,
    revenueCents,
  ] = await Promise.all([
    headCount(svc, 'profiles'),
    headCount(svc, 'profiles', (q) => q.not('onboarded_at', 'is', null)),
    headCount(svc, 'profiles', (q) => q.eq('account_status', 'active')),
    headCount(svc, 'profiles', (q) => q.gte('created_at', since7)),
    headCount(svc, 'profiles', (q) => q.gte('created_at', since30)),
    headCount(svc, 'identity_verifications', (q) => q.eq('status', 'approved')),
    headCount(svc, 'player_skill_profiles', (q) => q.eq('skill_verified', true)),
    headCount(svc, 'player_skill_profiles', (q) => q.not('community_skill_level', 'is', null)),
    headCount(svc, 'vouches', (q) => q.eq('status', 'active')),
    headCount(svc, 'vouches', (q) => q.eq('status', 'active').eq('used_coach_weight', true)),
    headCount(svc, 'vouch_requests'),
    headCount(svc, 'vouches', (q) => q.gte('created_at', since7)),
    headCount(svc, 'vouches', (q) => q.gte('created_at', since30)),
    headCount(svc, 'tournaments'),
    headCount(svc, 'tournaments', (q) => q.neq('status', 'draft')),
    headCount(svc, 'tournament_interests'),
    headCount(svc, 'registrations'),
    headCount(svc, 'registrations', (q) => q.eq('status', 'confirmed')),
    headCount(svc, 'registrations', (q) => q.eq('status', 'waitlisted')),
    headCount(svc, 'registrations', (q) => q.eq('status', 'withdrawn')),
    headCount(svc, 'registrations', (q) => q.eq('eligibility_status', 'review')),
    headCount(svc, 'registrations', (q) => q.eq('eligibility_status', 'skill_mismatch')),
    headCount(svc, 'payments', (q) => q.eq('status', 'verified')),
    headCount(svc, 'clubs', (q) => q.eq('activity_status', 'active')),
    headCount(svc, 'clubs', (q) => q.eq('verification_status', 'verified')),
    headCount(svc, 'club_memberships', (q) => q.eq('status', 'active')),
    getModerationCounts(),
    headCount(svc, 'audit_logs', (q) => q.ilike('action', 'moderation.account.%')),
    distinctActiveVouchers(svc),
    verifiedRevenueCents(svc),
  ]);

  const raw: AnalyticsRaw = {
    totalUsers,
    onboardedUsers,
    newUsers7d,
    newUsers30d,
    identityVerifiedUsers,
    skillVerifiedProfiles,
    activeProfiles,
    activeVouches,
    uniqueVouchers,
    ratedPlayers,
    vouchRequests,
    coachVouches,
    vouches7d,
    vouches30d,
    tournamentsCreated,
    tournamentsPublished,
    interestedCount,
    registrationsTotal,
    confirmedTeams,
    waitlisted,
    withdrawn,
    eligibilityReview,
    eligibilityMismatch,
    paymentsVerified,
    revenueCents,
    activeClubs,
    verifiedClubs,
    clubMemberships,
    openReports: moderation.reports,
    openSkillReviews: moderation.skillReviews,
    openFraudFlags: moderation.fraudFlags,
    accountActions,
  };
  return computeAnalyticsSummary(raw);
}

/** Distinct active vouchers (capped scan; pilot-scale). */
async function distinctActiveVouchers(svc: Svc): Promise<number> {
  try {
    const { data } = await svc
      .from('vouches')
      .select('voucher_id')
      .eq('status', 'active')
      .limit(10000);
    const set = new Set<string>();
    for (const r of (data ?? []) as { voucher_id: string }[]) set.add(r.voucher_id);
    return set.size;
  } catch {
    return 0;
  }
}

/** Sum of submitted amounts on verified payments, in cents (capped scan; pilot-scale). */
async function verifiedRevenueCents(svc: Svc): Promise<number> {
  try {
    const { data } = await svc
      .from('payments')
      .select('amount_submitted')
      .eq('status', 'verified')
      .limit(10000);
    let cents = 0;
    for (const r of (data ?? []) as { amount_submitted: number | string | null }[]) {
      const n = Number(r.amount_submitted ?? 0);
      if (Number.isFinite(n)) cents += Math.round(n * 100);
    }
    return cents;
  } catch {
    return 0;
  }
}
