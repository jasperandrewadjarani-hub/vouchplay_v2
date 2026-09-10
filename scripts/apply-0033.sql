-- =============================================================================
-- VouchPlay v2 - Migration 0033: lock the three partner RPCs (master_plan §2AA)
--
-- create_team_with_pending_partner / decline_partner_invitation / replace_pending_partner (added in
-- 0025, re-created in 0031) shipped WITHOUT the revoke/grant lockdown every other registration RPC
-- carries, so they were executable by anon/authenticated directly (bypassing ownership + the
-- gender/skill-cap gate, which lives only in the app layer). Verified in production: all three ran
-- with the public anon key; every sibling denied with 42501.
--
-- The app calls them only via the service-role client, so this is privilege-only: ZERO player-facing
-- change, no deploy required. Idempotent and safe to run anytime. Apply via the Supabase SQL editor.
-- =============================================================================

revoke all on function public.create_team_with_pending_partner(uuid, uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.decline_partner_invitation(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.replace_pending_partner(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.create_team_with_pending_partner(uuid, uuid, uuid, uuid, text, timestamptz)
  to service_role;
grant execute on function public.decline_partner_invitation(uuid, uuid)
  to service_role;
grant execute on function public.replace_pending_partner(uuid, uuid, uuid, text, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Verify 1: the three target functions are no longer anon/authenticated-executable.
-- EXPECT: 0 rows.
-- ---------------------------------------------------------------------------
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('create_team_with_pending_partner','decline_partner_invitation','replace_pending_partner')
   and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'));

-- ---------------------------------------------------------------------------
-- Verify 2 (standing tripwire): EVERY SECURITY DEFINER function in `public` still executable by
-- anon or authenticated. Review this list. Expected survivors are ONLY the read/helper functions
-- deliberately granted to `authenticated` (e.g. division_effective_fee and the leaderboard/coach
-- read helpers). A registration/team/vouch WRITER appearing here is a new finding - lock it too.
-- ---------------------------------------------------------------------------
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.prosecdef
   and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))
 order by p.proname;
