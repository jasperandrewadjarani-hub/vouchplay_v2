// RPC execute-grant verification (master_plan §2AA). Read-only. Proves that registration/team-writing
// SECURITY DEFINER functions are NOT callable with the public anon key: a legitimate call goes through
// the server's service-role client, never the browser. Run from repo root: node scripts/verify-rpc-grants.mjs
//
// Method: call each function with the anon key and no session, using zero-UUID arguments so nothing is
// ever written. A locked function returns 42501 (permission denied). An UNLOCKED function instead
// "succeeds" into a business error (e.g. self_partner, team_not_found) - that is the finding. Exit
// code is non-zero if any write RPC is reachable by anon.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync('apps/web/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const Z = '00000000-0000-0000-0000-000000000000';

// Every function here WRITES registration/team/invitation state and must be service-role only.
const WRITE_RPCS = [
  ['register_team', { p_team_id: Z, p_actor: Z }],
  ['move_player_registration', { p_registration_id: Z, p_target_division_id: Z, p_actor: Z }],
  ['player_cancel_registration', { p_registration_id: Z, p_actor: Z }],
  ['accept_partner_invitation', { p_invitation_id: Z, p_actor: Z }],
  ['change_partner', { p_team_id: Z, p_actor: Z, p_new_invitee: Z, p_message: null, p_expires_at: null }],
  ['create_team_with_pending_partner', { p_tournament_id: Z, p_division_id: Z, p_inviter: Z, p_invitee: Z, p_message: null, p_expires_at: null }],
  ['decline_partner_invitation', { p_invitation_id: Z, p_actor: Z }],
  ['replace_pending_partner', { p_team_id: Z, p_actor: Z, p_new_invitee: Z, p_message: null, p_expires_at: null }],
];

let fail = 0;
for (const [fn, args] of WRITE_RPCS) {
  const { error } = await anon.rpc(fn, args);
  if (error && error.code === '42501') {
    console.log(`PASS  ${fn} - denied to anon (42501)`);
  } else if (error && error.code === 'PGRST202') {
    console.log(`SKIP  ${fn} - not found with this signature (adjust args): ${error.message}`);
  } else if (error) {
    console.log(`FAIL  ${fn} - REACHABLE by anon (executed to business error ${error.code}: ${error.message})`);
    fail++;
  } else {
    console.log(`FAIL  ${fn} - REACHABLE by anon (executed and returned data)`);
    fail++;
  }
}

console.log(`\n${fail === 0 ? 'OK' : 'PROBLEM'}: ${fail} write RPC(s) reachable by anon.`);
process.exit(fail === 0 ? 0 : 1);
