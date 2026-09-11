/**
 * City normalization report (master_plan §2AG Phase B, D8). READ-ONLY - never writes to the
 * database. Reads every profile that has a `city`, computes what `normalizeCity` (`@vouchplay/config`,
 * the same function `packages/validation/src/profile.ts` now applies on every NEW save) would resolve
 * it to, and writes a review CSV of the proposed old -> new mapping for Jasper to sign off before the
 * one-time data-fix migration runs. This script does not reimplement any normalization logic itself.
 *
 * Run from repo root: `npx vite-node scripts/city-normalization-report.ts`
 *
 * Writes `working/city-normalization-<YYYY-MM-DD>.csv` (UTF-8 BOM, CRLF) with columns
 * old_city, new_city, changed, count - one row per DISTINCT existing spelling, most populated first.
 * Prints a stdout summary. No writes anywhere.
 */
import { writeFileSync } from 'node:fs';
import { normalizeCity } from '@vouchplay/config';
import { createServiceRoleClient } from './lib/skill-v2-facts';

/** Bounded page size for the paginated table scan - keeps each request well under PostgREST caps. */
const PAGE_SIZE = 1000;

interface ProfileCityRow {
  id: string;
  city: string | null;
}

function csvField(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

async function main(): Promise<void> {
  const sb = createServiceRoleClient();

  const rows: ProfileCityRow[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await sb
      .from('profiles')
      .select('id, city')
      .not('city', 'is', null)
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as ProfileCityRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // A blank/whitespace-only city is not "a profile with a city" - exclude it, matching the live
  // "365 profiles with a city" figure the plan verified.
  const withCity = rows.filter((r) => (r.city ?? '').trim().length > 0);

  const byOldCity = new Map<string, { newCity: string; count: number }>();
  for (const r of withCity) {
    const oldCity = (r.city as string).trim();
    const newCity = normalizeCity(oldCity);
    const key = oldCity; // group by the EXACT existing spelling, not a normalised key
    const existing = byOldCity.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      byOldCity.set(key, { newCity, count: 1 });
    }
  }

  const reportRows = [...byOldCity.entries()]
    .map(([oldCity, { newCity, count }]) => ({
      oldCity,
      newCity,
      changed: oldCity !== newCity,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.oldCity.localeCompare(b.oldCity));

  // ---- CSV ----
  const header = ['old_city', 'new_city', 'changed', 'count'];
  const csvLines = [header.map(csvField).join(',')];
  for (const r of reportRows) {
    csvLines.push(
      [
        csvField(r.oldCity),
        csvField(r.newCity),
        csvField(r.changed ? 'true' : 'false'),
        csvField(r.count),
      ].join(','),
    );
  }
  const csv = csvLines.join('\r\n');
  const date = new Date().toISOString().slice(0, 10);
  const outPath = `working/city-normalization-${date}.csv`;
  writeFileSync(outPath, '﻿' + csv, 'utf8');

  // ---- stdout summary ----
  const totalProfiles = withCity.length;
  const distinctOld = reportRows.length;
  const distinctNew = new Set(reportRows.map((r) => r.newCity)).size;
  const changedRows = reportRows.filter((r) => r.changed);
  const changedProfileCount = changedRows.reduce((sum, r) => sum + r.count, 0);

  console.log(`\nCity normalization report - ${new Date().toISOString()}`);
  console.log(`Profiles with a city: ${totalProfiles}`);
  console.log(`Distinct existing spellings: ${distinctOld}`);
  console.log(`Distinct canonical results: ${distinctNew}`);
  console.log(
    `Spellings that would change: ${changedRows.length} of ${distinctOld}` +
      ` (${changedProfileCount} of ${totalProfiles} profiles)`,
  );
  console.log('\nOld -> new (only spellings that would change), most populated first:');
  for (const r of changedRows) {
    console.log(`  "${r.oldCity}" (${r.count}) -> "${r.newCity}"`);
  }
  console.log(`\nWrote ${outPath} (${reportRows.length} rows).`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
