-- =============================================================================
-- VouchPlay v2 - Migration 0014: Pilot-prep usability and retention
-- §17.2 owner-only Archive/Restore, §18.6 audited unused-division removal, and the
-- system_settings-backed starter capacity. Safe to re-run.
-- =============================================================================

insert into system_settings (key, value, description) values
  ('default_division_capacity_teams', '20'::jsonb,
   'Default team capacity for each starter division created with a tournament (§18.6)')
on conflict (key) do nothing;

-- Archived tournaments are private historical records: only their organizers/staff may read them.
drop policy if exists tournaments_read on tournaments;
create policy tournaments_read on tournaments
  for select using (
    status not in ('draft', 'archived')
    or public.is_tournament_organizer(auth.uid(), id)
    or public.is_staff(auth.uid())
  );

drop policy if exists divisions_read on divisions;
create policy divisions_read on divisions
  for select using (
    exists (
      select 1 from tournaments t
      where t.id = tournament_id
        and (
          t.status not in ('draft', 'archived')
          or public.is_tournament_organizer(auth.uid(), t.id)
          or public.is_staff(auth.uid())
        )
    )
  );

drop policy if exists tournament_announcements_read on tournament_announcements;
create policy tournament_announcements_read on tournament_announcements
  for select using (
    exists (
      select 1 from tournaments t
      where t.id = tournament_id
        and (
          t.status not in ('draft', 'archived')
          or public.is_tournament_organizer(auth.uid(), t.id)
          or public.is_staff(auth.uid())
        )
    )
  );

-- One transaction owns the status change and immutable audit row. Password re-entry is deliberately
-- not required: OTP/Google accounts may not have one. The authenticated session and owner row lock
-- are authoritative, with exact-name confirmation supplied by the UI.
create or replace function public.set_tournament_archived_state(
  p_tournament_id uuid,
  p_expected_name text,
  p_restore boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_tournament tournaments%rowtype;
  v_target tournament_status;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;

  select * into v_tournament
    from tournaments
    where id = p_tournament_id
    for update;
  if not found then raise exception 'tournament_not_found'; end if;
  if v_tournament.owner_organizer_id <> v_actor then raise exception 'owner_required'; end if;
  if v_tournament.name <> p_expected_name then raise exception 'tournament_name_mismatch'; end if;

  if p_restore then
    if v_tournament.status <> 'archived' then raise exception 'not_archived'; end if;
    v_target := 'draft';
  else
    if v_tournament.status not in ('draft', 'cancelled', 'completed') then
      raise exception 'unsafe_archive_status';
    end if;
    v_target := 'archived';
  end if;

  update tournaments set status = v_target where id = p_tournament_id;
  insert into audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot, reason
  ) values (
    v_actor,
    'organizer',
    case when p_restore then 'tournament.restore' else 'tournament.archive' end,
    'tournament',
    p_tournament_id,
    jsonb_build_object('status', v_tournament.status, 'name', v_tournament.name),
    jsonb_build_object('status', v_target, 'name', v_tournament.name),
    case when p_restore then 'Owner restored archived tournament' else 'Owner archived tournament' end
  );

  return v_target::text;
end;
$$;

revoke all on function public.set_tournament_archived_state(uuid, text, boolean) from public;
grant execute on function public.set_tournament_archived_state(uuid, text, boolean) to authenticated;

-- Delete only a genuinely unused division. Authorization, dependency checks, audit, and delete are
-- transactional so there can be no unaudited partial result.
create or replace function public.remove_unused_division(p_division_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_division divisions%rowtype;
  v_tournament tournaments%rowtype;
  v_allowed boolean := false;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;

  select * into v_division from divisions where id = p_division_id for update;
  if not found then raise exception 'division_not_found'; end if;
  select * into v_tournament from tournaments where id = v_division.tournament_id;

  v_allowed := v_tournament.owner_organizer_id = v_actor or exists (
    select 1 from tournament_organizers o
    where o.tournament_id = v_division.tournament_id
      and o.user_id = v_actor
      and o.status = 'active'
      and coalesce((o.permissions ->> 'manage_divisions')::boolean, false)
  );
  if not v_allowed then raise exception 'manage_divisions_required'; end if;

  if exists (select 1 from registrations where division_id = p_division_id)
     or exists (select 1 from teams where division_id = p_division_id)
     or exists (select 1 from partner_invitations where division_id = p_division_id)
     or exists (select 1 from tournament_interests where division_id = p_division_id)
     or exists (select 1 from tournament_announcements where division_id = p_division_id)
     or exists (select 1 from achievements where division_id = p_division_id)
  then
    raise exception 'division_has_activity';
  end if;

  insert into audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot, reason
  ) values (
    v_actor,
    'organizer',
    'tournament.division.remove',
    'division',
    p_division_id,
    to_jsonb(v_division),
    null,
    'Organizer removed unused division'
  );

  delete from divisions where id = p_division_id;
  return p_division_id;
end;
$$;

revoke all on function public.remove_unused_division(uuid) from public;
grant execute on function public.remove_unused_division(uuid) to authenticated;


