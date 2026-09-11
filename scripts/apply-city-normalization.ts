/** One-time city canonicalization over live profiles (master_plan §2AG Phase B). Applies the SAME
 *  `normalizeCity` the app now runs on every save, so historical and future data agree. Reversible
 *  via working/city-backup-2026-09-11.csv. Nulls the "Phase 13 City" test rows. --dry-run supported. */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { normalizeCity } from '@vouchplay/config';

const ROOT = 'D:/claude_/P006b_PlayerProfiling/vouchplay_v2';
const env = Object.fromEntries(
  readFileSync(ROOT + '/apps/web/.env.local', 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const dry = process.argv.includes('--dry-run');

const { data, error } = await sb.from('profiles').select('id, city').not('city', 'is', null);
if (error) { console.error(error.message); process.exitCode = 1; }
const rows = (data ?? []).filter((p: { city: string | null }) => (p.city ?? '').trim());
let changed = 0, nulled = 0;
const sample: string[] = [];
for (const p of rows as { id: string; city: string }[]) {
  const isTest = /phase 13/i.test(p.city);
  const next = isTest ? null : normalizeCity(p.city);
  if (next === p.city) continue;
  if (next === null) nulled++; else changed++;
  if (sample.length < 20) sample.push(`${JSON.stringify(p.city)} -> ${next === null ? '(null, test row)' : JSON.stringify(next)}`);
  if (!dry) {
    const { error: uErr } = await sb.from('profiles').update({ city: next }).eq('id', p.id);
    if (uErr) console.error('update failed', p.id, uErr.message);
  }
}
console.log(`${dry ? 'DRY RUN - ' : ''}profiles with city: ${rows.length} | canonicalized: ${changed} | test rows nulled: ${nulled}`);
console.log('sample:'); for (const s of sample) console.log('  ' + s);
