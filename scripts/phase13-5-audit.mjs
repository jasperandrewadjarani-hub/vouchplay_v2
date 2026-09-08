// Phase 13.5 evidence/schema audit (read-only). Confirms live migration/column state before any
// code change or migration is planned. Run from repo root: node scripts/phase13-5-audit.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync('apps/web/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const log = (label, val) => console.log(`${label}: ${JSON.stringify(val)}`);

// 1. Does tournaments.payment_qr_path actually exist live?
{
  const { data, error } = await svc.from('tournaments').select('id, payment_qr_path').limit(1);
  log('tournaments.payment_qr_path selectable', { ok: !error, error: error?.message ?? null, sample: data });
}

// 2. club_lock_at presence on tournaments.
{
  const { data, error } = await svc.from('tournaments').select('id, club_lock_at').limit(1);
  log('tournaments.club_lock_at selectable', { ok: !error, error: error?.message ?? null, sample: data });
}

// 3. max_divisions_per_player presence + values.
{
  const { data, error } = await svc
    .from('tournaments')
    .select('id, slug, max_divisions_per_player')
    .limit(5);
  log('tournaments.max_divisions_per_player', { ok: !error, error: error?.message ?? null, sample: data });
}

// 4. divisions.max_entries_per_player presence.
{
  const { data, error } = await svc.from('divisions').select('id, max_entries_per_player').limit(3);
  log('divisions.max_entries_per_player', { ok: !error, error: error?.message ?? null, sample: data });
}

// 5. registrations uniqueness constraints (information_schema via RPC not available generically;
//    use pg_constraint through a raw SQL RPC if one exists, else fall back to describing indexes
//    we can infer from a duplicate-insert probe is too risky/destructive - skip, rely on SQL editor).
{
  const { data, error } = await svc
    .from('registrations')
    .select('id, tournament_id, division_id, team_id, status')
    .limit(3);
  log('registrations sample', { ok: !error, error: error?.message ?? null, count: data?.length ?? 0 });
}

// 6. tournament_player_club_representations shape.
{
  const { data, error } = await svc
    .from('tournament_player_club_representations')
    .select('*')
    .limit(1);
  log('tournament_player_club_representations sample', {
    ok: !error,
    error: error?.message ?? null,
    columns: data && data[0] ? Object.keys(data[0]) : null,
  });
}

// 7. Storage: payment-proofs bucket existence + public/private flag.
{
  const { data, error } = await svc.storage.listBuckets();
  const proofs = (data ?? []).find((b) => b.name === 'payment-proofs' || b.id === 'payment-proofs');
  log('storage buckets', { ok: !error, error: error?.message ?? null, all: data?.map((b) => ({ id: b.id, public: b.public })), proofs });
}

// 8. system_settings relevant to this phase.
{
  const { data, error } = await svc
    .from('system_settings')
    .select('key, value')
    .in('key', [
      'player_registration_self_service_enabled',
      'player_registration_change_lock_hours_before_start',
      'max_divisions_per_player_default',
    ]);
  log('system_settings (relevant)', { ok: !error, error: error?.message ?? null, rows: data });
}

console.log('\nDone.');
