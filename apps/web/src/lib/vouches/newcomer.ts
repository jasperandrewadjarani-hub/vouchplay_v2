import 'server-only';
import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { anchoredSet, standingFromEdges } from '@/lib/vouches/v2-facts';
import { getNewcomerVouchSettings } from '@/lib/settings';

/**
 * Newcomer tier for the person GIVING a vouch (master_plan §2AJ). Deliberately NOT age-based: on a
 * platform where everyone joined this week and honest people vouch minutes after signing up, account
 * age separates nothing. What a throwaway account cannot cheaply fake is an ANCHOR (a confirmed/paid
 * registration, an approved ID, a coach role) or STANDING (being vouched for by other accounts, mutual
 * pairs excluded - so puppets cannot graduate each other). A voucher is a newcomer while it has
 * neither; newcomers get the stricter rolling caps in `submitVouch` / `requestVouch`.
 *
 * Reuses the exact §2AF.1 anchor + standing definitions from `v2-facts.ts` (one source of truth), so
 * "established" here means the same thing STS_V2's trust model means by it.
 */
export interface VoucherTier {
  tier: 'newcomer' | 'established';
  anchored: boolean;
  /** §2AF.1 standing; null when not computed because the account is anchored (already established). */
  standing: number | null;
  /** The newcomer caps in force (0 = no cap), so callers do not re-read settings. */
  newcomerCaps: { per24h: number; requestsPer24h: number };
}

const BOUND = 1000;

export async function getVoucherTier(userId: string): Promise<VoucherTier> {
  const settings = await getNewcomerVouchSettings();
  const newcomerCaps = { per24h: settings.per24h, requestsPer24h: settings.requestsPer24h };
  const svc = createServiceClient();

  const anchored = (await anchoredSet(svc, [userId])).has(userId);
  if (anchored) return { tier: 'established', anchored: true, standing: null, newcomerCaps };

  // standing(u): received active vouches (giver -> u) minus mutual pairs; the GIVER's anchor status
  // decides 1.0 vs 0.5 (§2AF.1) - so one anchored voucher, or two unanchored ones, graduates by default.
  const [{ data: receivedRows }, { data: givenRows }] = await Promise.all([
    svc
      .from('vouches')
      .select('voucher_id, target_id')
      .eq('target_id', userId)
      .eq('status', 'active')
      .limit(BOUND),
    svc
      .from('vouches')
      .select('voucher_id, target_id')
      .eq('voucher_id', userId)
      .eq('status', 'active')
      .limit(BOUND),
  ]);
  const received = (receivedRows ?? []) as { voucher_id: string; target_id: string }[];
  const givenPairs = new Set(
    ((givenRows ?? []) as { voucher_id: string; target_id: string }[]).map(
      (r) => `${r.voucher_id}:${r.target_id}`,
    ),
  );
  const givers = Array.from(new Set(received.map((r) => r.voucher_id)));
  const anchoredGivers = await anchoredSet(svc, givers);
  const standing = standingFromEdges(userId, received, givenPairs, anchoredGivers);

  // A graduation threshold of 0 (or less) switches the tier off: nobody is a newcomer.
  const tier =
    settings.graduateStanding > 0 && standing < settings.graduateStanding
      ? 'newcomer'
      : 'established';
  return { tier, anchored: false, standing, newcomerCaps };
}

/**
 * Display-only variant for pages (the profile's vouch form note): cached 60s per viewer so a hot
 * profile page does not re-run the anchor/standing reads on every view. The vouch ACTIONS always use
 * the uncached `getVoucherTier` - the cap is enforced on fresh facts.
 */
export const getVoucherTierCached = unstable_cache(
  async (userId: string) => getVoucherTier(userId),
  ['voucher-tier'],
  { revalidate: 60 },
);
