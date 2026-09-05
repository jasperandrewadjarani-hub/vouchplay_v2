// Seed a JT admin: grant a global role (default `super_admin`) in `user_roles` to the account with
// the given email. Uses the service role (DML via PostgREST + Auth admin API — NO DDL). Idempotent.
//
// Run from the repo root (reads apps/web/.env.local for the Supabase URL + service-role key):
//   node scripts/seed-admin.mjs jasper.andrew.adjarani@gmail.com
//   node scripts/seed-admin.mjs tane@example.com super_admin
//
// The target account must have signed up first (it looks the user up in auth.users by email).
// Granting admin is a privilege escalation — run this deliberately, only for JT principals.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const email = (process.argv[2] || '').trim().toLowerCase();
const role = (process.argv[3] || 'super_admin').trim();
if (!email) {
  console.error('Usage: node scripts/seed-admin.mjs <email> [role]');
  process.exit(1);
}

const env = {};
for (const line of readFileSync('apps/web/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let userId = null;
for (let page = 1; page <= 20 && !userId; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error('listUsers error:', error.message);
    process.exit(1);
  }
  const found = data.users.find((u) => (u.email || '').toLowerCase() === email);
  if (found) userId = found.id;
  if (data.users.length < 200) break;
}
if (!userId) {
  console.error(`No auth user found with email ${email}. They must sign up first.`);
  process.exit(2);
}

const { data: existing } = await supabase
  .from('user_roles')
  .select('id')
  .eq('user_id', userId)
  .eq('role', role)
  .eq('status', 'active')
  .maybeSingle();
if (existing) {
  console.log(`${email} already has active ${role} (role id ${existing.id}).`);
  process.exit(0);
}

const { data, error } = await supabase
  .from('user_roles')
  .insert({ user_id: userId, role, status: 'active', approved_at: new Date().toISOString() })
  .select('id')
  .single();
if (error) {
  console.error('insert error:', error.message);
  process.exit(1);
}
console.log(`Granted ${role} to ${email} (user ${userId}, role id ${data.id}).`);
