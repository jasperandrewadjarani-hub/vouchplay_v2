// Static guard (master_plan §2AA): every SECURITY DEFINER function defined in supabase/migrations/*.sql
// must be revoked from public/anon/authenticated SOMEWHERE in the migrations (the lockdown pattern used
// throughout this schema). This is a text scan, name-based, run from repo root and wired into
// `npm run lint`. It exists because three registration RPCs (0025/0031) shipped world-executable for
// want of exactly this check; 0033 locks them.
//
// A function is treated as intentionally caller-facing (and therefore NOT flagged) when it is
// explicitly granted to `authenticated` and never granted to a write path - those are read helpers.
// The rule we enforce is the footgun: a security-definer function with NO revoke-from-anon/public and
// NO explicit authenticated grant, i.e. left on the Postgres PUBLIC-execute default.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Reviewed read-only predicates / triggers that are intentionally left on the default: they return
// booleans or ints about roles/settings and are CALLED INSIDE RLS policies, so revoking EXECUTE from
// `authenticated` would break those policies. None writes data. A new name may only join this list
// with a one-line justification that it is read-only and safe to be caller-executable.
const ALLOWLIST = new Set([
  'handle_new_user', // trigger on auth.users insert; not a callable writer in practice
  'has_global_role', // boolean role predicate, used in RLS
  'is_admin', // boolean role predicate, used in RLS
  'is_staff', // boolean role predicate, used in RLS
  'is_club_manager', // boolean membership predicate, used in RLS
  'is_club_member', // boolean membership predicate, used in RLS
  'is_club_owner', // boolean membership predicate, used in RLS
  'is_team_member', // boolean membership predicate, used in RLS
  'is_tournament_organizer', // boolean role predicate, used in RLS
  'slot_hold_minutes', // returns an int setting; read-only
]);

const DIR = 'supabase/migrations';
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const sql = files.map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n');

// Names defined as SECURITY DEFINER functions in public.
const defined = new Set();
const defRe =
  /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?security\s+definer/gi;
for (const m of sql.matchAll(defRe)) defined.add(m[1].toLowerCase());

// Names that are revoked from public/anon/authenticated anywhere.
const revoked = new Set();
const revRe = /revoke\s+[\s\S]*?on\s+function\s+public\.([a-z0-9_]+)\s*\([\s\S]*?from\s+([^;]*);/gi;
for (const m of sql.matchAll(revRe)) {
  if (/\b(public|anon|authenticated)\b/i.test(m[2])) revoked.add(m[1].toLowerCase());
}

// Names explicitly granted to `authenticated` (intentional caller-facing read helpers).
const grantedAuthed = new Set();
const grantRe = /grant\s+execute\s+on\s+function\s+public\.([a-z0-9_]+)\s*\([\s\S]*?to\s+([^;]*);/gi;
for (const m of sql.matchAll(grantRe)) {
  if (/\bauthenticated\b/i.test(m[2])) grantedAuthed.add(m[1].toLowerCase());
}

const violations = [...defined]
  .filter((fn) => !revoked.has(fn) && !grantedAuthed.has(fn) && !ALLOWLIST.has(fn))
  .sort();

if (violations.length) {
  console.error(
    'check-migration-grants: SECURITY DEFINER function(s) left on the Postgres PUBLIC-execute default\n' +
      '(no revoke from public/anon/authenticated, and not an explicit authenticated read helper):\n',
  );
  for (const fn of violations) console.error(`  - public.${fn}(...)`);
  console.error(
    '\nAdd `revoke all on function public.<fn>(<args>) from public, anon, authenticated; ' +
      'grant execute on function public.<fn>(<args>) to service_role;` in a migration.',
  );
  process.exit(1);
}

console.log(`check-migration-grants: OK (${defined.size} security-definer functions, all locked down).`);
