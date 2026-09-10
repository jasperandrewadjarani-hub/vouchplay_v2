/**
 * STS_V2 shadow report (master_plan §2AF rollout step 3). READ-ONLY - never writes to the database.
 * Computes CSL_V2/STS_V2 and anomaly flags for every rated player using the real, unit-tested engine
 * (`@vouchplay/core`'s `computeSkillV2`/`detectAnomalies`) fed by facts gathered in
 * `scripts/lib/skill-v2-facts.ts`, so the numbers here are exactly what the app would compute - this
 * script does not reimplement any of the trust/independence/aggregation math itself.
 *
 * Run from repo root: `npx vite-node scripts/skill-v2-shadow-report.ts`
 *
 * Writes `working/skill-v2-shadow-<YYYY-MM-DD>.csv` (UTF-8 BOM, CRLF) and prints a stdout summary.
 * Voucher identity is never printed or written to the CSV - only aggregate counts/shares per subject.
 */
import { writeFileSync } from 'node:fs';
import { computeSkillV2, detectAnomalies, assignBlocs, type AnomalyFlag } from '@vouchplay/core';
import { STS_V2_CONSTANTS } from '@vouchplay/config';
import {
  buildAllFacts,
  createServiceRoleClient,
  paramsFromSettings,
  v1SkillVerifiedThresholds,
  type SettingsRow,
} from './lib/skill-v2-facts';

interface ReportRow {
  slug: string;
  nickname: string;
  selfRating: number | null;
  cslV1: number | null;
  cslV2: number | null;
  delta: number | null;
  stsV1: number;
  stsV2: number;
  vouchersV1: number;
  nEffV2: number;
  weightSumV2: number;
  anchoredVouchers: number;
  unknownVouchers: number;
  reciprocalVouchers: number;
  largestClubBlocShare: number;
  wouldHoldNow: number;
  flags: AnomalyFlag[];
  v1Verified: boolean;
  v2Verified: boolean;
}

function csvField(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

function fmt(n: number | null, digits = 2): string {
  return n === null ? '' : Number(n.toFixed(digits)).toString();
}

async function main(): Promise<void> {
  const sb = createServiceRoleClient();
  const now = new Date();

  const [facts, settingsResult] = await Promise.all([
    buildAllFacts(sb, now),
    sb.from('system_settings').select('key, value'),
  ]);
  if (settingsResult.error) throw new Error(settingsResult.error.message);
  const settingsRows = (settingsResult.data ?? []) as SettingsRow[];
  const { params, anomaly } = paramsFromSettings(settingsRows);
  const v1Thresholds = v1SkillVerifiedThresholds(settingsRows);

  const rows: ReportRow[] = [];
  for (const [targetId, tf] of facts.byTarget) {
    const prof = facts.profiles.get(targetId);
    const result = computeSkillV2(
      { selfRating: tf.selfRating, vouches: tf.vouches, vouchers: tf.vouchers },
      params,
      STS_V2_CONSTANTS,
    );
    const flags = detectAnomalies(
      {
        now: now.toISOString(),
        selfRating: tf.selfRating,
        cslV1: tf.cslV1,
        cslV2: result.csl,
        nEff: result.nEff,
        vouches: tf.vouches,
        vouchers: tf.vouchers,
        trust: result.trust,
      },
      { ...params, ...anomaly },
    );

    let anchoredVouchers = 0;
    let unknownVouchers = 0;
    let reciprocalVouchers = 0;
    for (const v of tf.vouches) {
      const voucher = tf.vouchers.get(v.voucherId);
      if (voucher?.anchored) anchoredVouchers++;
      if ((result.trust.get(v.voucherId) ?? 0) <= params.trustUnknownFactor) unknownVouchers++;
      if (v.reciprocal) reciprocalVouchers++;
    }

    let largestClubBlocShare = 0;
    if (tf.vouches.length > 0) {
      const blocs = assignBlocs(tf.vouches, tf.vouchers);
      const groupSizes = new Map<string, number>();
      for (const clubId of blocs.values()) {
        if (!clubId) continue;
        groupSizes.set(clubId, (groupSizes.get(clubId) ?? 0) + 1);
      }
      let largest = 0;
      for (const size of groupSizes.values()) if (size > largest) largest = size;
      largestClubBlocShare = largest / tf.vouches.length;
    }

    const velocityBurst = flags.find((f) => f.type === 'VELOCITY_BURST');
    const delta = tf.cslV1 !== null && result.csl !== null ? result.csl - tf.cslV1 : null;
    const v1Verified =
      tf.stsV1 >= v1Thresholds.minSts && tf.uniqueV1 >= v1Thresholds.minUniqueVouchers;

    rows.push({
      slug: prof?.slug ?? targetId,
      nickname: prof?.nickname ?? '',
      selfRating: tf.selfRating,
      cslV1: tf.cslV1,
      cslV2: result.csl,
      delta,
      stsV1: tf.stsV1,
      stsV2: result.sts,
      vouchersV1: tf.uniqueV1,
      nEffV2: result.nEff,
      weightSumV2: result.weightSum,
      anchoredVouchers,
      unknownVouchers,
      reciprocalVouchers,
      largestClubBlocShare,
      wouldHoldNow: velocityBurst?.holdVouchIds.length ?? 0,
      flags,
      v1Verified,
      v2Verified: result.skillVerified,
    });
  }

  // Sort by |delta| desc (unknown delta sorts last), then n_eff asc.
  rows.sort((a, b) => {
    const ad = a.delta === null ? -1 : Math.abs(a.delta);
    const bd = b.delta === null ? -1 : Math.abs(b.delta);
    if (bd !== ad) return bd - ad;
    return a.nEffV2 - b.nEffV2;
  });

  // ---- CSV ----
  const header = [
    'slug',
    'nickname',
    'self_rating',
    'csl_v1',
    'csl_v2',
    'delta',
    'sts_v1',
    'sts_v2',
    'vouchers_v1',
    'n_eff_v2',
    'weight_sum_v2',
    'anchored_vouchers',
    'unknown_vouchers',
    'reciprocal_vouches',
    'largest_club_bloc_share',
    'would_hold_now',
    'flags',
    'reasons',
  ];
  const csvLines = [header.map(csvField).join(',')];
  for (const r of rows) {
    csvLines.push(
      [
        csvField(r.slug),
        csvField(r.nickname),
        csvField(r.selfRating ?? ''),
        csvField(r.cslV1 ?? ''),
        csvField(r.cslV2 ?? ''),
        csvField(fmt(r.delta, 0)),
        csvField(fmt(r.stsV1, 1)),
        csvField(fmt(r.stsV2, 1)),
        csvField(r.vouchersV1),
        csvField(fmt(r.nEffV2, 2)),
        csvField(fmt(r.weightSumV2, 2)),
        csvField(r.anchoredVouchers),
        csvField(r.unknownVouchers),
        csvField(r.reciprocalVouchers),
        csvField(fmt(r.largestClubBlocShare, 2)),
        csvField(r.wouldHoldNow),
        csvField(r.flags.map((f) => f.type).join(';')),
        csvField(r.flags.map((f) => f.reason).join(';')),
      ].join(','),
    );
  }
  const csv = csvLines.join('\r\n');
  const date = now.toISOString().slice(0, 10);
  const outPath = `working/skill-v2-shadow-${date}.csv`;
  writeFileSync(outPath, '﻿' + csv, 'utf8');

  // ---- stdout summary ----
  const totalPlayers = rows.length;
  const bandChanges = rows.filter(
    (r) => r.cslV1 !== null && r.cslV2 !== null && r.cslV1 !== r.cslV2,
  );
  const up = new Map<number, number>();
  const down = new Map<number, number>();
  for (const r of bandChanges) {
    const d = (r.cslV2 as number) - (r.cslV1 as number);
    const mag = Math.abs(d);
    const bucket = d > 0 ? up : down;
    bucket.set(mag, (bucket.get(mag) ?? 0) + 1);
  }
  const v1VerifiedCount = rows.filter((r) => r.v1Verified).length;
  const v2VerifiedCount = rows.filter((r) => r.v2Verified).length;

  const flagCounts = new Map<string, number>();
  for (const r of rows)
    for (const f of r.flags) flagCounts.set(f.type, (flagCounts.get(f.type) ?? 0) + 1);

  console.log(`\nSTS_V2 shadow report - ${now.toISOString()}`);
  console.log(`Players computed: ${totalPlayers}`);
  console.log(
    `Band changes (V2 != V1): ${bandChanges.length} of ${totalPlayers}` +
      ` (${totalPlayers > 0 ? ((bandChanges.length / totalPlayers) * 100).toFixed(1) : '0.0'}%)`,
  );
  const upStr =
    [...up.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([mag, n]) => `+${mag}:${n}`)
      .join(', ') || 'none';
  const downStr =
    [...down.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([mag, n]) => `-${mag}:${n}`)
      .join(', ') || 'none';
  console.log(`  up:   ${upStr}`);
  console.log(`  down: ${downStr}`);
  console.log(`Skill-Verified: V1 = ${v1VerifiedCount}, V2 = ${v2VerifiedCount}`);
  console.log('Flag counts:');
  if (flagCounts.size === 0) {
    console.log('  (none)');
  } else {
    for (const [type, n] of [...flagCounts.entries()].sort((a, b) => b[1] - a[1]))
      console.log(`  ${type}: ${n}`);
  }

  console.log('\nTop 15 by |delta| then n_eff asc:');
  console.log(
    'slug'.padEnd(22) +
      'self'.padEnd(6) +
      'v1'.padEnd(5) +
      'v2'.padEnd(5) +
      'd'.padEnd(5) +
      'n_eff'.padEnd(8) +
      'flags',
  );
  for (const r of rows.slice(0, 15)) {
    console.log(
      r.slug.slice(0, 20).padEnd(22) +
        String(r.selfRating ?? '-').padEnd(6) +
        String(r.cslV1 ?? '-').padEnd(5) +
        String(r.cslV2 ?? '-').padEnd(5) +
        String(r.delta ?? '-').padEnd(5) +
        r.nEffV2.toFixed(2).padEnd(8) +
        r.flags.map((f) => f.type).join(';'),
    );
  }

  const likelyRigged = rows
    .filter(
      (r): r is ReportRow & { selfRating: number; cslV1: number; cslV2: number } =>
        r.selfRating !== null &&
        r.cslV1 !== null &&
        r.cslV2 !== null &&
        r.cslV1 - r.selfRating >= 2 &&
        r.cslV2 <= r.selfRating + 1,
    )
    .sort((a, b) => b.cslV1 - b.selfRating - (a.cslV1 - a.selfRating))
    .slice(0, 10);

  console.log(`\nLikely-rigged shortlist (v1 - self >= 2, v2 <= self + 1): ${likelyRigged.length}`);
  for (const r of likelyRigged) {
    console.log(
      `  ${r.slug} - self ${r.selfRating}, V1 ${r.cslV1}, V2 ${r.cslV2}, n_eff ${r.nEffV2.toFixed(2)}`,
    );
  }

  console.log(`\nCSV written: ${outPath}`);
  console.log('No database writes performed.');
}

await main();
