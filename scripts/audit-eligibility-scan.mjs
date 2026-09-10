// Read-only eligibility scan (master_plan §2AB / §2P handoff). Lists LIVE registrations whose members
// no longer fit their division's own rules - almost always because the player's community skill rose
// above the division cap AFTER they registered (the register-time gate does not re-run on vouch
// drift). Run from repo root: node scripts/audit-eligibility-scan.mjs [tournamentSlug]
//
// Writes a CSV to working/eligibility-scan-<date>.csv for the organizer to review. Never writes to the
// database. Fit semantics mirror player_fits_division: sex classification always applies; skill cap
// applies only when the tournament has enforce_skill_floor on and the division is not 'open'; unknown
// skill never blocks; playing UP is always allowed.
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync('apps/web/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const onlySlug = process.argv[2] ?? null;
const DEAD = ['cancelled', 'withdrawn', 'rejected', 'expired', 'released'];

const regs = (await sb.from('registrations').select('id, status, division_id, team_id, tournament_id').limit(10000)).data ?? [];
const live = regs.filter((r) => !DEAD.includes(r.status));
const divIds = [...new Set(live.map((r) => r.division_id))];
const divs = (await sb.from('divisions').select('id, name_override, tournament_id, sex_classification, skill_policy, maximum_skill').in('id', divIds)).data ?? [];
const D = Object.fromEntries(divs.map((d) => [d.id, d]));
const ts = (await sb.from('tournaments').select('id, slug, status, enforce_skill_floor').in('id', [...new Set(divs.map((d) => d.tournament_id))])).data ?? [];
const T = Object.fromEntries(ts.map((t) => [t.id, t]));
const teamIds = live.map((r) => r.team_id);
const tm = (await sb.from('team_members').select('team_id, player_id').in('team_id', teamIds)).data ?? [];
const members = {};
for (const m of tm) (members[m.team_id] ??= []).push(m.player_id);
const pIds = [...new Set(tm.map((m) => m.player_id))];
const profs = (await sb.from('profiles').select('id, slug, nickname, sex, self_rated_skill').in('id', pIds)).data ?? [];
const P = Object.fromEntries(profs.map((p) => [p.id, p]));
const skills = (await sb.from('player_skill_profiles').select('player_id, community_skill_level, unique_voucher_count').in('player_id', pIds)).data ?? [];
const SK = Object.fromEntries(skills.map((s) => [s.player_id, s]));

const rows = [];
for (const r of live) {
  const d = D[r.division_id];
  const t = T[d?.tournament_id];
  if (!d || !t || t.status !== 'registration_open') continue;
  if (onlySlug && t.slug !== onlySlug) continue;
  for (const pid of members[r.team_id] ?? []) {
    const p = P[pid];
    if (!p) continue;
    const sk = SK[pid];
    const eff = sk?.community_skill_level ?? p.self_rated_skill ?? null;
    const reasons = [];
    if (d.sex_classification === 'men' && p.sex !== 'male') reasons.push(`sex: ${p.sex ?? 'unset'} in men's`);
    if (d.sex_classification === 'women' && p.sex !== 'female') reasons.push(`sex: ${p.sex ?? 'unset'} in women's`);
    if (t.enforce_skill_floor && d.skill_policy !== 'open' && eff != null && d.maximum_skill != null && eff > d.maximum_skill)
      reasons.push(`skill: ${eff} above division cap ${d.maximum_skill} (self-rated ${p.self_rated_skill}, vouches ${sk?.unique_voucher_count ?? 0})`);
    if (reasons.length)
      rows.push({
        tournament: t.slug,
        division: d.name_override ?? `${d.sex_classification} band ${d.maximum_skill}`,
        registration_status: r.status,
        registration_id: r.id,
        player: p.nickname ?? p.slug,
        slug: p.slug,
        issue: reasons.join('; '),
      });
  }
}

const header = ['tournament', 'division', 'registration_status', 'registration_id', 'player', 'slug', 'issue'];
const csv = [header.join(',')]
  .concat(rows.map((r) => header.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')))
  .join('\r\n');
const date = new Date().toISOString().slice(0, 10);
const out = `working/eligibility-scan-${date}.csv`;
writeFileSync(out, '﻿' + csv, 'utf8');

console.log(`${rows.length} member-registration mismatches across ${new Set(rows.map((r) => r.registration_id)).size} registrations.`);
for (const r of rows) console.log(`  ${r.tournament} | ${r.division} | ${r.player} (${r.registration_status}) - ${r.issue}`);
console.log(`\nCSV written: ${out}`);
