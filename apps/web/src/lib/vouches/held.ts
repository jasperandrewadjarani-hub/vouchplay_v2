import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { HOLD_REASON_OR_FILTER } from '@/lib/vouches/hold-reasons';

/**
 * Public-safe "is anything under review" check for a profile (master_plan §2AF "Workflow and UX" -
 * profile page review note). Counts ACTIVE holds on a target - vouches a guard quarantined
 * (`status='invalidated'`, `invalidation_reason` = a velocity hold (§2AF) or a single-purpose cluster
 * hold (§2AJ)) that a moderator has not yet reinstated or otherwise resolved. Deliberately a bounded
 * HEAD count, never identities: the profile only ever shows "some vouches are being reviewed", never
 * who, how many, or why (§2AF "no blame").
 */
export async function countHeldVouchesForTarget(targetId: string): Promise<number> {
  const svc = createServiceClient();
  const { count } = await svc
    .from('vouches')
    .select('id', { count: 'exact', head: true })
    .eq('target_id', targetId)
    .eq('status', 'invalidated')
    .or(HOLD_REASON_OR_FILTER);
  return count ?? 0;
}
