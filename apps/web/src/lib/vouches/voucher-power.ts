import 'server-only';
import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { getVouchSettings } from '@/lib/settings';

/**
 * Minimal vouching power (owner-directed amendment of LOCKED handover §10.5, v1.67, master_plan
 * §2AN decision 5). A voucher is a MINIMAL account while ALL three cheap, honest-player signals are
 * absent: no profile photo, no approved identity verification, and no active vouch received from
 * anyone yet. These are deliberately the three things a throwaway account never bothers to fake and a
 * real player picks up quickly - a fifth source-credibility factor alongside identity verification
 * (`packages/core/src/vouches/weight.ts`), never a change to the four LOCKED base weight rows.
 *
 * Column-explicit selects via the service client (crosses RLS the same way `getVoucherTier` does).
 * Never throws: any read failure fails OPEN to "not minimal" (full weight) rather than silently
 * discounting a real player's vouches.
 */
export interface VoucherPower {
  minimal: boolean;
  reasons: { noPhoto: boolean; noId: boolean; noVouches: boolean };
  /** The admin `weight_minimal_account_multiplier` currently in force (1 = disabled). */
  multiplier: number;
}

const NOT_MINIMAL: VoucherPower = {
  minimal: false,
  reasons: { noPhoto: false, noId: false, noVouches: false },
  multiplier: 1,
};

export async function getVoucherPower(userId: string): Promise<VoucherPower> {
  try {
    const svc = createServiceClient();
    const [{ data: profileRow }, { data: idvRow }, { count: vouchCount }, settings] =
      await Promise.all([
        svc.from('profiles').select('avatar_path').eq('id', userId).maybeSingle(),
        svc
          .from('identity_verifications')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'approved')
          .limit(1)
          .maybeSingle(),
        svc
          .from('vouches')
          .select('id', { count: 'exact', head: true })
          .eq('target_id', userId)
          .eq('status', 'active'),
        getVouchSettings(),
      ]);

    const avatarPath = (profileRow as { avatar_path: string | null } | null)?.avatar_path ?? null;
    const noPhoto = !avatarPath || avatarPath.trim().length === 0;
    const noId = !idvRow;
    const noVouches = (vouchCount ?? 0) === 0;

    return {
      minimal: noPhoto && noId && noVouches,
      reasons: { noPhoto, noId, noVouches },
      multiplier: settings.weights.minimalAccountMultiplier,
    };
  } catch {
    return NOT_MINIMAL;
  }
}

/**
 * Display-only variant (the app-shell nudge banner + vouch form note): cached 60s per viewer so a hot
 * page does not re-run these reads on every render. The vouch/reweight ACTIONS always use the uncached
 * `getVoucherPower` - the weight the voucher actually gets is computed on fresh facts.
 */
export const getVoucherPowerCached = unstable_cache(
  async (userId: string) => getVoucherPower(userId),
  ['voucher-power'],
  { revalidate: 60 },
);
