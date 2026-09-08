// Phase 13.5 direct RLS/API abuse checks (read-only, non-destructive). Confirms the new payment-QR
// and club-representation surfaces do not widen anonymous/unrelated access. Run from repo root:
//   node scripts/phase13-5-abuse.mjs
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

// Ground truth: a saved QR path from the live project.
const { data: qrRow } = await svc
  .from('tournaments')
  .select('id, payment_qr_path')
  .not('payment_qr_path', 'is', null)
  .limit(1)
  .maybeSingle();
const qrPath = qrRow?.payment_qr_path ?? null;

// 1. Anonymous cannot download the private QR object by path (private bucket, no signed URL).
if (qrPath) {
  const { data, error } = await anon.storage.from('payment-proofs').download(qrPath);
  check('anon cannot download private QR object', !data && !!error, error?.message ?? 'blocked');
} else {
  check('no saved QR to probe (skipped)', true, 'no payment_qr_path present');
}

// 2. Anonymous cannot create a signed URL for a QR object (needs service role / policy).
if (qrPath) {
  const { data, error } = await anon.storage.from('payment-proofs').createSignedUrl(qrPath, 60);
  check('anon cannot mint a signed QR URL', !data?.signedUrl, error?.message ?? 'blocked');
}

// 3. Anonymous cannot read tournament_player_club_representations (RLS private).
{
  const a = await anon
    .from('tournament_player_club_representations')
    .select('*', { count: 'exact', head: true });
  const s = await svc
    .from('tournament_player_club_representations')
    .select('*', { count: 'exact', head: true });
  check(
    'anon blocked from club representations (RLS)',
    (a.count ?? 0) === 0,
    `anon=${a.count ?? 0} service=${s.count ?? 0}`,
  );
}

// 4. Anonymous cannot read audit_logs (append-only, staff-only).
{
  const a = await anon.from('audit_logs').select('*', { count: 'exact', head: true });
  const s = await svc.from('audit_logs').select('*', { count: 'exact', head: true });
  check(
    'anon blocked from audit_logs (RLS)',
    (a.count ?? 0) === 0,
    `anon=${a.count ?? 0} service=${s.count ?? 0}`,
  );
}

// 5. Anonymous cannot execute the privileged registration RPCs directly.
for (const [fn, args] of [
  ['move_player_registration', { p_registration_id: qrRow?.id ?? crypto.randomUUID(), p_target_division_id: crypto.randomUUID(), p_actor: crypto.randomUUID() }],
  ['player_cancel_registration', { p_registration_id: crypto.randomUUID(), p_actor: crypto.randomUUID() }],
]) {
  const { error } = await anon.rpc(fn, args);
  check(`anon cannot execute ${fn}()`, !!error, error?.message ?? 'no error (LEAK)');
}

// 6. Anonymous cannot POST arbitrary rows into registrations (RLS write denial).
{
  const { error } = await anon.from('registrations').insert({
    tournament_id: crypto.randomUUID(),
    division_id: crypto.randomUUID(),
    team_id: crypto.randomUUID(),
    status: 'confirmed',
  });
  check('anon cannot insert a registration (RLS)', !!error, error?.message ?? 'no error (LEAK)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
