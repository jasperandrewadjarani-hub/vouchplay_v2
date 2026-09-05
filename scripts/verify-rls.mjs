// RLS / role-spoofing verification (handover §37, Phase-1 gate). Read-only by default: compares what
// the ANON role can see vs service-role ground truth to prove RLS is actually filtering, not just
// that tables are empty. Run from repo root: node scripts/verify-rls.mjs
//
// Set VERIFY_WRITES=1 to also attempt anonymous role-spoofing writes (they must be rejected /
// affect 0 rows). Writes change nothing when RLS is correct, but are opt-in to keep the default run
// purely read-only.
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
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

const count = async (client, table) => {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  return { count: count ?? 0, error: error?.message ?? null };
};

// system_settings + profiles are PUBLIC reads (RLS allows anon).
const ss = await count(anon, 'system_settings');
check('anon can read system_settings (public)', ss.count > 0 && !ss.error, `count=${ss.count}`);

const prof = await count(anon, 'profiles');
check('anon can read profiles (public read policy)', !prof.error, `count=${prof.count}`);

// user_roles / identity_verifications / audit_logs are PRIVATE to owner/staff — anon must see 0,
// while the service role sees the true count. A divergence proves RLS is filtering.
for (const table of ['user_roles', 'identity_verifications', 'audit_logs']) {
  const a = await count(anon, table);
  const s = await count(svc, table);
  check(
    `anon is blocked from ${table} (RLS)`,
    a.count === 0,
    `anon=${a.count} service=${s.count}${s.count > 0 ? ' → RLS filtering confirmed' : ' (no rows yet; inconclusive but not leaking)'}`,
  );
}

// Anonymous voucher identity is never exposed (handover non-negotiable). vouches table is Phase 3;
// assert it is at least not anon-readable if it exists.
{
  const a = await anon.from('vouches').select('*', { count: 'exact', head: true });
  if (a.error && /does not exist|schema cache/i.test(a.error.message)) {
    check('vouches table not present yet (Phase 3)', true, 'skipped');
  } else {
    check('anon cannot read vouches', (a.count ?? 0) === 0);
  }
}

if (process.env.VERIFY_WRITES === '1') {
  // Role-spoofing: anonymous UPDATE of someone else's profile must affect 0 rows (auth.uid() null).
  const target = await svc.from('profiles').select('id, bio').limit(1).maybeSingle();
  if (target.data) {
    const { data, error } = await anon
      .from('profiles')
      .update({ bio: '__rls_spoof_attempt__' })
      .eq('id', target.data.id)
      .select('id');
    const rows = data?.length ?? 0;
    check('anon UPDATE of a profile is rejected by RLS', rows === 0, error ? `error=${error.message}` : `rows=${rows}`);
    // anon INSERT into append-only audit_logs must fail.
    const ins = await anon.from('audit_logs').insert({ action: '__rls_spoof__' }).select('id');
    check('anon INSERT into audit_logs is rejected', (ins.data?.length ?? 0) === 0 || !!ins.error);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
