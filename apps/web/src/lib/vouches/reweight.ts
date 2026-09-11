import 'server-only';
import { effectiveWeight, WEIGHT_RULE_VERSION } from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';
import { getVouchSettings } from '@/lib/settings';
import { getVoucherPower } from '@/lib/vouches/voucher-power';
import { recomputePlayerSkillProfile } from '@/lib/vouches/recompute';

const BOUND = 1000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * "Weight follows the person, not the moment" (master_plan §2AN decision 5, handover §10.5 v1.67).
 * Re-derives `effective_weight` for every ACTIVE vouch a voucher has GIVEN, from their CURRENT source
 * credibility (identity verification + minimal-account status), and updates whichever ones differ.
 * Called after something about the voucher changes: an avatar is added (`profile.ts`), an identity
 * verification is approved (`identity.ts`), or they receive their first vouch (`vouch.ts`). This is
 * also the routine that finally fixes the pre-existing gap where a later identity approval never
 * lifted a voucher's PAST vouches to the 1.25 row (§2AN finding 5) - both cases are just "recompute
 * from current facts."
 *
 * System revision rows are written with `changed_by: null` (a SYSTEM re-weight, not a new decision by
 * the voucher) so they never count toward that voucher's rolling 24h vouch-action cap in
 * `submitVouch`, which only counts revisions where `changed_by = user.id`.
 *
 * Bounded to at most 1000 active vouches per call. Never throws - any failure resolves to
 * `{ updated: 0 }` so every caller can invoke this purely best-effort.
 */
export async function reweightGivenVouches(voucherId: string): Promise<{ updated: number }> {
  try {
    const svc = createServiceClient();
    const [settings, power, { data: idvRow }, { data: vouchRows }] = await Promise.all([
      getVouchSettings(),
      getVoucherPower(voucherId),
      svc
        .from('identity_verifications')
        .select('id')
        .eq('user_id', voucherId)
        .eq('status', 'approved')
        .limit(1)
        .maybeSingle(),
      svc
        .from('vouches')
        .select('id, target_id, used_coach_weight, effective_weight, skill_level')
        .eq('voucher_id', voucherId)
        .eq('status', 'active')
        .limit(BOUND),
    ]);
    const voucherIdentityVerified = !!idvRow;
    const active = (vouchRows ?? []) as {
      id: string;
      target_id: string;
      used_coach_weight: boolean;
      effective_weight: number | string;
      skill_level: number;
    }[];
    if (active.length === 0) return { updated: 0 };

    const targets = new Set<string>();
    let updated = 0;

    for (const v of active) {
      const nextWeight = round2(
        effectiveWeight(
          {
            usedCoachWeight: v.used_coach_weight,
            voucherIdentityVerified,
            voucherMinimalAccount: power.minimal,
          },
          settings.weights,
        ),
      );
      const currentWeight = round2(Number(v.effective_weight));
      if (nextWeight === currentWeight) continue;

      const { error } = await svc
        .from('vouches')
        .update({ effective_weight: nextWeight, weight_rule_version: WEIGHT_RULE_VERSION })
        .eq('id', v.id);
      if (error) continue;

      await svc.from('vouch_revisions').insert({
        vouch_id: v.id,
        previous_skill_level: v.skill_level,
        new_skill_level: v.skill_level,
        previous_weight: currentWeight,
        new_weight: nextWeight,
        changed_by: null,
        change_type: 'updated',
      });

      targets.add(v.target_id);
      updated += 1;
    }

    for (const targetId of targets) await recomputePlayerSkillProfile(targetId);
    return { updated };
  } catch {
    return { updated: 0 };
  }
}
