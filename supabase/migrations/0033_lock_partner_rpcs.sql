-- 0033_lock_partner_rpcs.sql
-- SECURITY (master_plan §2AA). Three SECURITY DEFINER functions added in 0025 and re-created in 0031
-- never received the revoke/grant lockdown every other registration-writing RPC in this schema has,
-- so they were executable by `public`/`anon`/`authenticated` (Postgres grants EXECUTE to PUBLIC on
-- CREATE unless revoked). They take actor ids as plain parameters (no auth.uid() check) and never
-- call player_fits_division, so a direct rpc() call bypassed both ownership and the gender/skill-cap
-- gate (the same class of bypass §2X closed). Verified in production: all three were callable with
-- the public anon key while every sibling correctly denied with 42501.
--
-- The app calls all three ONLY through the service-role client (lib/actions/registration.ts), which
-- keeps EXECUTE, so this changes nothing a real player does; it only closes the direct-RPC hole.
-- Privilege-only, idempotent, no schema/RLS/data change - safe to apply anytime, independent of any
-- code deploy. Apply via the Supabase SQL editor (same method as 0001-0032).

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
