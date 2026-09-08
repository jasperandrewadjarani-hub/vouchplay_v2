// Phase 13C/13D direct API/RLS abuse checks. Run only after applying 0016 + 0017.
// Optional controlled-session tokens deepen coverage without storing passwords:
// VERIFY_PLAYER_ACCESS_TOKEN and VERIFY_ADMIN_AAL2_ACCESS_TOKEN.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = { ...process.env };
for (const line of readFileSync('apps/web/.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}
const options = { auth: { autoRefreshToken: false, persistSession: false } };
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
const withToken = (token) =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    ...options,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
const player = env.VERIFY_PLAYER_ACCESS_TOKEN ? withToken(env.VERIFY_PLAYER_ACCESS_TOKEN) : null;
const admin = env.VERIFY_ADMIN_AAL2_ACCESS_TOKEN
  ? withToken(env.VERIFY_ADMIN_AAL2_ACCESS_TOKEN)
  : null;
let pass = 0;
let fail = 0;
let skip = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
  ok ? pass++ : fail++;
}
function skipped(name) {
  console.log(`SKIP  ${name} - controlled token not supplied`);
  skip++;
}
async function count(client, table, configure = (query) => query) {
  const result = await configure(client.from(table).select('id', { count: 'exact', head: true }));
  return { count: result.count ?? 0, error: result.error };
}

const anonEvidence = await count(anon, 'role_application_evidence');
check(
  'anon cannot read Coach evidence metadata',
  anonEvidence.count === 0,
  `rows=${anonEvidence.count}`,
);
const anonApps = await count(anon, 'role_applications');
check('anon cannot read role applications', anonApps.count === 0, `rows=${anonApps.count}`);
const anonMomentum = await count(anon, 'player_leaderboard_momentum');
check('anon cannot read private momentum', anonMomentum.count === 0, `rows=${anonMomentum.count}`);
const anonExclusions = await count(anon, 'leaderboard_exclusions');
check(
  'anon cannot read Admin exclusions',
  anonExclusions.count === 0,
  `rows=${anonExclusions.count}`,
);
const publicRuns = await anon
  .from('leaderboard_snapshot_runs')
  .select('id, active, status')
  .limit(100);
check(
  'anon sees only active published snapshot runs',
  !publicRuns.error &&
    (publicRuns.data ?? []).every((row) => row.active && row.status === 'published'),
);
const publicEntries = await anon
  .from('leaderboard_snapshot_entries')
  .select('id, is_public')
  .limit(100);
check(
  'anon sees only public snapshot DTO rows',
  !publicEntries.error && (publicEntries.data ?? []).every((row) => row.is_public === true),
);
const [{ data: hiddenProfiles }, { data: visibleEntryIds }, { data: ageSettings }] =
  await Promise.all([
    svc.from('profiles').select('id, profile_visibility, date_of_birth').limit(1000),
    anon
      .from('leaderboard_snapshot_entries')
      .select('subject_id')
      .eq('subject_type', 'player')
      .limit(1000),
    svc
      .from('system_settings')
      .select('key, value')
      .in('key', ['leaderboard_min_age', 'leaderboard_exclude_unknown_dob']),
  ]);
const setting = Object.fromEntries((ageSettings ?? []).map((row) => [row.key, row.value]));
const minimumAge = Number(setting.leaderboard_min_age ?? 18);
const excludeUnknownDob = setting.leaderboard_exclude_unknown_dob !== false;
const today = new Date();
const ineligiblePublicIds = new Set(
  (hiddenProfiles ?? [])
    .filter((row) => {
      const visibility = row.profile_visibility ?? {};
      if (
        visibility.leaderboards === 'hidden' ||
        visibility.directory === 'hidden' ||
        visibility.profile === 'private'
      )
        return true;
      if (!row.date_of_birth) return excludeUnknownDob;
      const dob = new Date(`${row.date_of_birth}T00:00:00Z`);
      let age = today.getUTCFullYear() - dob.getUTCFullYear();
      if (
        today.getUTCMonth() < dob.getUTCMonth() ||
        (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate())
      )
        age--;
      return age < minimumAge;
    })
    .map((row) => row.id),
);
check(
  'public snapshots exclude opt-out, private, minor, and unknown-age players',
  (visibleEntryIds ?? []).every((row) => !ineligiblePublicIds.has(row.subject_id)),
);
const anonSubmit = await anon.rpc('submit_coach_application', {
  p_application_id: crypto.randomUUID(),
  p_answers: {},
  p_evidence: [],
});
check('anon cannot invoke Coach submit RPC', Boolean(anonSubmit.error));
const anonPublish = await anon.rpc('publish_leaderboard_snapshot', {
  p_scoring_version: 'LEADER_V1',
  p_category: 'players',
  p_scope_type: 'global',
  p_scope_value: null,
  p_period: 'all_time',
  p_settings_fingerprint: 'abuse-test',
  p_source_cutoff: new Date().toISOString(),
  p_stale_after: new Date().toISOString(),
  p_entries: [],
  p_momentum: [],
});
check('anon cannot invoke service-only snapshot publisher', Boolean(anonPublish.error));
const objectList = await anon.storage.from('role-evidence').list('', { limit: 1 });
check(
  'anon cannot list private Coach evidence objects',
  Boolean(objectList.error) || (objectList.data ?? []).length === 0,
);

if (player) {
  const { data: authData } = await player.auth.getUser();
  const playerId = authData.user?.id;
  check('controlled player token resolves', Boolean(playerId));
  if (playerId) {
    const selfGrant = await player
      .from('user_roles')
      .insert({ user_id: playerId, role: 'coach', status: 'active' })
      .select('id');
    check(
      'player cannot self-grant Coach',
      Boolean(selfGrant.error) || (selfGrant.data ?? []).length === 0,
    );
    const directApp = await player
      .from('role_applications')
      .insert({ user_id: playerId, role_requested: 'coach', answers: {} })
      .select('id');
    check(
      'player cannot bypass Coach submit RPC',
      Boolean(directApp.error) || (directApp.data ?? []).length === 0,
    );
    const ownMomentum = await player
      .from('player_leaderboard_momentum')
      .select('player_id')
      .neq('player_id', playerId)
      .limit(1);
    check('player cannot read another player momentum', (ownMomentum.data ?? []).length === 0);
    const selfMomentum = await player
      .from('player_leaderboard_momentum')
      .select('player_id')
      .eq('player_id', playerId)
      .limit(10);
    check(
      'player can read only their private momentum',
      !selfMomentum.error &&
        (selfMomentum.data ?? []).length > 0 &&
        (selfMomentum.data ?? []).every((row) => row.player_id === playerId),
    );
    const controls = await player.from('leaderboard_rebuild_requests').select('id').limit(1);
    check('player cannot read Admin leaderboard controls', (controls.data ?? []).length === 0);
  }
} else skipped('authenticated player self-grant/application/momentum/control tests');

if (admin) {
  const { data: authData } = await admin.auth.getUser();
  check('controlled Admin AAL2 token resolves', Boolean(authData.user?.id));
  const evidence = await admin.from('role_application_evidence').select('id').limit(1);
  check('AAL2 Admin may read Coach evidence metadata', !evidence.error);
  const controls = await admin.from('leaderboard_rebuild_requests').select('id').limit(1);
  check('AAL2 Admin may read leaderboard controls', !controls.error);
  const invalid = await admin.rpc('request_leaderboard_rebuild', {
    p_category: '__invalid__',
    p_scope_type: null,
    p_scope_value: null,
    p_period: null,
    p_reason: 'Non-mutating authorization probe',
  });
  check(
    'AAL2 Admin reached control RPC validation',
    Boolean(invalid.error) && /invalid_category/i.test(invalid.error.message),
  );
} else skipped('AAL2 Admin evidence/control tests');

const svcEvidence = await count(svc, 'role_application_evidence');
console.log(
  `INFO  service evidence rows=${svcEvidence.count}; identities and paths were not printed`,
);
console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
if (fail || skip) process.exitCode = 1;

