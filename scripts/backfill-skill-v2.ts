/**
 * STS_V2 backfill (master_plan §2AF rollout step 5). Persists `community_skill_level_v2`, `sts_v2`,
 * `n_eff_v2`, `weight_sum_v2`, `components_v2`, and `calculated_v2_at` on `player_skill_profiles` for
 * every rated player, computed with the real engine (`@vouchplay/core`) via the same shared facts as
 * `scripts/skill-v2-shadow-report.ts` - never reimplements the trust/independence/aggregation math.
 *
 * Requires migration 0034 (adds the six V2 columns) to already be applied. Refuses to run otherwise
 * (probes with a cheap `select('community_skill_level_v2').limit(1)` first) rather than half-writing.
 *
 * WRITES ONLY the six V2 columns above - never V1 columns (`community_skill_level`, `sts`,
 * `unique_voucher_count`, `effective_weight_sum`, `agreement_component`, `count_component`,
 * `weight_component`, `distribution`, `skill_verified`, `verification_type`, `algorithm_version`,
 * `calculated_at`) and never `fraud_flags` - the velocity guard / hold logic belongs to the live vouch
 * write path (§2AF E3), not this script. Idempotent: rerunning recomputes and overwrites only the V2
 * columns with the same inputs producing the same outputs.
 *
 * Run from repo root: `npx vite-node scripts/backfill-skill-v2.ts` (add `--dry-run` to compute and
 * print the summary without writing).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeSkillV2, type ComputeSkillV2Result } from '@vouchplay/core';
import { STS_V2_CONSTANTS } from '@vouchplay/config';
import {
  buildAllFacts,
  createServiceRoleClient,
  paramsFromSettings,
  type SettingsRow,
} from './lib/skill-v2-facts';

/** Sequential-batch concurrency cap - no Promise.all storm against the database. */
const CONCURRENCY = 5;

interface ComponentsV2 {
  count: number;
  weight: number;
  agreement: number;
  dispersion: number;
  trustSummary: { anchored: number; unknown: number };
  flags: string[];
}

interface PlayerUpdate {
  playerId: string;
  cslV1: number | null;
  csl: number | null;
  sts: number;
  nEff: number;
  weightSum: number;
  components: ComponentsV2;
}

/** Probes for migration 0034's V2 columns. Returns true when present, false on a missing-column error. */
async function migration0034Applied(sb: SupabaseClient): Promise<boolean> {
  const { error } = await sb
    .from('player_skill_profiles')
    .select('community_skill_level_v2')
    .limit(1);
  if (!error) return true;
  // PostgREST/Postgres surfaces an unknown column as 42703; PostgREST itself can also report it as
  // PGRST204 depending on schema cache state - treat either as "column missing".
  if (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /column .* does not exist/i.test(error.message)
  ) {
    return false;
  }
  throw new Error(
    `Unexpected error probing player_skill_profiles.community_skill_level_v2: ${error.message}`,
  );
}

async function processInBatches<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map((item) => worker(item)));
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const sb = createServiceRoleClient();

  const applied = await migration0034Applied(sb);
  if (!applied) {
    console.log('Migration 0034 not applied - refusing to run');
    process.exitCode = 1;
    return;
  }

  const now = new Date();
  const [facts, settingsResult] = await Promise.all([
    buildAllFacts(sb, now),
    sb.from('system_settings').select('key, value'),
  ]);
  if (settingsResult.error) throw new Error(settingsResult.error.message);
  const settingsRows = (settingsResult.data ?? []) as SettingsRow[];
  const { params } = paramsFromSettings(settingsRows);

  const updates: PlayerUpdate[] = [];
  for (const [targetId, tf] of facts.byTarget) {
    const result: ComputeSkillV2Result = computeSkillV2(
      { selfRating: tf.selfRating, vouches: tf.vouches, vouchers: tf.vouchers },
      params,
      STS_V2_CONSTANTS,
    );

    let anchoredCount = 0;
    let unknownCount = 0;
    for (const v of tf.vouches) {
      const voucher = tf.vouchers.get(v.voucherId);
      if (voucher?.anchored) anchoredCount++;
      if ((result.trust.get(v.voucherId) ?? 0) <= params.trustUnknownFactor) unknownCount++;
    }

    updates.push({
      playerId: targetId,
      cslV1: tf.cslV1,
      csl: result.csl,
      sts: result.sts,
      nEff: result.nEff,
      weightSum: result.weightSum,
      components: {
        count: result.components.count,
        weight: result.components.weight,
        agreement: result.components.agreement,
        dispersion: result.components.dispersion,
        trustSummary: { anchored: anchoredCount, unknown: unknownCount },
        flags: [],
      },
    });
  }

  const bandChanges = updates.filter(
    (u) => u.cslV1 !== null && u.csl !== null && u.cslV1 !== u.csl,
  ).length;

  if (dryRun) {
    console.log(`[dry-run] Would update ${updates.length} player_skill_profiles rows.`);
    console.log(`[dry-run] Band changes (V2 != V1): ${bandChanges} of ${updates.length}`);
    console.log('[dry-run] No database writes performed.');
    return;
  }

  let updated = 0;
  let failed = 0;
  const calculatedAt = now.toISOString();
  await processInBatches(updates, async (u) => {
    const { error } = await sb
      .from('player_skill_profiles')
      .update({
        community_skill_level_v2: u.csl,
        sts_v2: u.sts,
        n_eff_v2: u.nEff,
        weight_sum_v2: u.weightSum,
        components_v2: u.components,
        calculated_v2_at: calculatedAt,
      })
      .eq('player_id', u.playerId);
    if (error) {
      failed++;
      console.error(`  FAILED ${u.playerId}: ${error.message}`);
    } else {
      updated++;
    }
  });

  console.log(`\nSTS_V2 backfill complete - ${calculatedAt}`);
  console.log(`Updated: ${updated} of ${updates.length}${failed > 0 ? ` (${failed} failed)` : ''}`);
  console.log(`Band changes (V2 != V1): ${bandChanges} of ${updates.length}`);
  if (failed > 0) process.exitCode = 1;
}

await main();
