-- =============================================================================
-- APPLY: Migration 0015 - Free non-archived tournament lifecycle control (§17.2).
-- Paste this whole block into the Supabase SQL editor (project itrosesiywpbaxtmucbb) and run it.
-- Apply migration 0014 first if it is still pending. Idempotent.
-- Expect: lifecycle_function = 1, lifecycle_authenticated_grant = 1.
-- =============================================================================

create or replace function public.set_tournament_status(
  p_tournament_id uuid,
  p_next_status tournament_status
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_tournament tournaments%rowtype;
  v_allowed boolean := false;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select * into v_tournament from tournaments where id = p_tournament_id for update;
  if not found then raise exception 'tournament_not_found'; end if;

  v_allowed := v_tournament.owner_organizer_id = v_actor or exists (
    select 1 from tournament_organizers o
    where o.tournament_id = p_tournament_id
      and o.user_id = v_actor
      and o.status = 'active'
      and coalesce((o.permissions ->> 'edit')::boolean, false)
  );
  if not v_allowed then raise exception 'edit_tournament_required'; end if;
  if v_tournament.status = 'archived' or p_next_status = 'archived' then
    raise exception 'archived_requires_retention_flow';
  end if;

  if v_tournament.status = p_next_status then
    return jsonb_build_object(
      'changed', false, 'from', v_tournament.status, 'to', p_next_status
    );
  end if;

  update tournaments set status = p_next_status where id = p_tournament_id;
  insert into audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot, reason
  ) values (
    v_actor, 'organizer', 'tournament.status.change', 'tournament', p_tournament_id,
    jsonb_build_object('status', v_tournament.status, 'name', v_tournament.name),
    jsonb_build_object('status', p_next_status, 'name', v_tournament.name),
    'Organizer changed tournament lifecycle status'
  );

  return jsonb_build_object(
    'changed', true, 'from', v_tournament.status, 'to', p_next_status
  );
end;
$$;

revoke all on function public.set_tournament_status(uuid, tournament_status) from public;
grant execute on function public.set_tournament_status(uuid, tournament_status) to authenticated;

select 'lifecycle_function' as check, count(*) as n
  from information_schema.routines
  where routine_schema = 'public' and routine_name = 'set_tournament_status'
union all
select 'lifecycle_authenticated_grant', count(*)
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name = 'set_tournament_status'
    and grantee = 'authenticated'
    and privilege_type = 'EXECUTE';
-- Expect: lifecycle_function = 1, lifecycle_authenticated_grant = 1


