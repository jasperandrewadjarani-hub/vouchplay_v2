// Phase 14A direct RLS/API abuse checks for club offers (read-only, non-destructive). Run AFTER
// applying migration 0023. From repo root: node scripts/phase14a-abuse.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync('apps/web/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const svc = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
  ok ? pass++ : fail++;
};

// Ground truth via service role.
const svcOffers = await svc.from('club_offers').select('id, status', { count: 'exact' });
const svcResponses = await svc
  .from('club_offer_responses')
  .select('id', { count: 'exact', head: true });
console.log(
  `service sees offers=${svcOffers.count ?? 0}, responses=${svcResponses.count ?? 0}\n`,
);

// 1. Anonymous can read ONLY open offers (never drafts/closed/cancelled/expired).
{
  const { data, error } = await anon.from('club_offers').select('id, status');
  const rows = data ?? [];
  const nonOpen = rows.filter((r) => r.status !== 'open');
  check(
    'anon reads only open offers',
    !error && nonOpen.length === 0,
    `anon rows=${rows.length}, non-open leaked=${nonOpen.length}`,
  );
}

// 2. Anonymous cannot read any offer responses (private).
{
  const a = await anon.from('club_offer_responses').select('*', { count: 'exact', head: true });
  check(
    'anon blocked from offer responses (RLS)',
    (a.count ?? 0) === 0,
    `anon=${a.count ?? 0} service=${svcResponses.count ?? 0}`,
  );
}

// 3. Anonymous cannot insert an offer or a response (RLS write denial).
{
  const off = await anon.from('club_offers').insert({
    club_id: crypto.randomUUID(),
    title: 'x',
    created_by: crypto.randomUUID(),
  });
  check('anon cannot insert an offer (RLS)', !!off.error, off.error?.message ?? 'no error (LEAK)');
  const resp = await anon.from('club_offer_responses').insert({
    offer_id: crypto.randomUUID(),
    player_id: crypto.randomUUID(),
  });
  check(
    'anon cannot insert a response (RLS)',
    !!resp.error,
    resp.error?.message ?? 'no error (LEAK)',
  );
}

// 4. Open offers are only from verified, active clubs (no draft-club leakage).
{
  const { data } = await anon.from('club_offers').select('club_id, status').eq('status', 'open');
  const clubIds = Array.from(new Set((data ?? []).map((r) => r.club_id)));
  let bad = 0;
  if (clubIds.length > 0) {
    const { data: clubs } = await svc
      .from('clubs')
      .select('id, verification_status, activity_status, deleted_at')
      .in('id', clubIds);
    bad = (clubs ?? []).filter(
      (c) =>
        c.verification_status !== 'verified' ||
        c.activity_status !== 'active' ||
        c.deleted_at !== null,
    ).length;
  }
  check('public open offers come only from verified active clubs', bad === 0, `bad clubs=${bad}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
