// Disposable controlled-session wrapper for verify-phase13-rls.mjs.
// Creates one Player and one AAL2 Admin, injects their short-lived access tokens into the verifier,
// and deletes both Auth users (with cascaded test rows) in a finally block. No secret is printed.
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = { ...process.env };
for (const line of readFileSync('apps/web/.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}
for (const key of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]) {
  if (!env[key]) throw new Error(`Missing ${key}.`);
}

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
const createdIds = [];

function base32Bytes(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of value.replace(/=+$/g, '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid TOTP secret.');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const digest = createHmac('sha1', base32Bytes(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

async function createSession(label) {
  const nonce = `${Date.now()}-${randomBytes(5).toString('hex')}`;
  const email = `phase13-${label}-${nonce}@example.invalid`;
  const password = `Vp!${randomBytes(24).toString('base64url')}`;
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: 'Phase', last_name: label === 'admin' ? 'Admin' : 'Player' },
  });
  if (createError || !created.user)
    throw createError ?? new Error('Controlled user was not created.');
  createdIds.push(created.user.id);
  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    options,
  );
  const { data: signed, error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !signed.session) throw signInError ?? new Error('Controlled sign-in failed.');
  return { id: created.user.id, client, accessToken: signed.session.access_token };
}

try {
  const player = await createSession('player');
  const admin = await createSession('admin');
  const { error: momentumError } = await service.from('player_leaderboard_momentum').insert({
    player_id: player.id,
    category: 'players',
    scope_type: 'global',
    scope_value: '',
    period: 'all_time',
    scoring_version: 'LEADER_V1',
    eligible_public: false,
    exclusion_code: 'opted_out',
    private_rank: 1,
    score: 1,
    components: { participation: 1 },
    cta_key: 'request_vouch',
  });
  if (momentumError) throw momentumError;
  const { error: roleError } = await service.from('user_roles').insert({
    user_id: admin.id,
    role: 'admin',
    status: 'active',
    approved_by: admin.id,
    approved_at: new Date().toISOString(),
    reason: 'Disposable Phase 13 authorization verification',
  });
  if (roleError) throw roleError;

  const { data: factor, error: enrollError } = await admin.client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Phase 13 disposable verification',
  });
  if (enrollError || !factor) throw enrollError ?? new Error('TOTP enrollment failed.');
  const { data: verified, error: verifyError } = await admin.client.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: totp(factor.totp.secret),
  });
  if (verifyError || !verified.access_token)
    throw verifyError ?? new Error('AAL2 verification failed.');

  process.env.VERIFY_PLAYER_ACCESS_TOKEN = player.accessToken;
  process.env.VERIFY_ADMIN_AAL2_ACCESS_TOKEN = verified.access_token;
  await import('./verify-phase13-rls.mjs');
} finally {
  let cleanupFailed = false;
  for (const id of createdIds.reverse()) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) cleanupFailed = true;
  }
  if (cleanupFailed) {
    console.error('FAIL  disposable controlled-account cleanup');
    process.exitCode = 1;
  } else if (createdIds.length) {
    console.log(`PASS  removed ${createdIds.length} disposable controlled accounts`);
  }
}
