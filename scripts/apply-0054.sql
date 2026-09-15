-- =============================================================================
-- VouchPlay v2 - Migration 0054: organizer partner override + organizer merge of solo entries
-- master_plan §2BS. Replaces `organizer_assign_partner` (0044) in place - SAME signature and grants.
--
-- Jasper (2026-09-16): two players each entered the same doubles division alone and both paid. The
-- organizer tried to put them together and was refused twice:
--   1. `player_does_not_fit` - the division's skill rule (community Low Intermediate, Novice division).
--   2. `partner_conflict`    - the partner already holds their own live entry in the division.
-- Decision: organizers and admins seat partners AT WILL. Division rules (skill, age, sex, mixed
-- composition) keep applying on the PLAYER side only; the app shows the organizer a warning instead.
--
-- 1. organizer_assign_partner (replaced):
--    - no `player_fits_division` / `team_partner_composition_ok` checks any more (organizer override);
--    - a partner who holds their OWN SOLO entry in the division (a live team whose only member is them)
--      is MERGED: that entry is released as 'withdrawn' (event `merged_into_team`, which promotes the
--      division's next waitlisted team exactly like the player-side merge in 0045), its pending invites
--      are cancelled and the solo team is disbanded. Unlike the player-side merge this also merges an
--      entry that already has a submitted/verified TEAM receipt - the organizer is the one who untangles
--      money. The server moves the partner's money onto the kept entry (seat slots re-attached; a team
--      receipt copied into a seat slot) using the returned `merged_registration_id`;
--    - a partner on a team WITH someone else in the division is still refused (`partner_conflict`).
-- 2. organizer_create_solo_doubles_team (new): the organizer "Add entry" path for player 1 - same as
--    `create_solo_doubles_team` (0040) minus the fit check, callable only for an organizer of the
--    tournament. Registration-window and division-open checks are unchanged.
--
-- Security: both functions are SECURITY DEFINER, check `is_tournament_organizer`, and are locked to
-- service_role (repo non-negotiable). Organizer Phase B moves to 0055, PIN lock to 0056.
-- Apply via the Supabase SQL editor.
-- =============================================================================

create or replace function public.organizer_assign_partner(
  p_team_id uuid,
  p_actor uuid,
  p_player uuid,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_team teams%rowtype;
  v_other uuid;
  v_reg_id uuid;
  v_reg_status registration_status;
  v_merge_team uuid;
  v_merge_reg record;
  v_merged_registration_id uuid;
begin
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason_required'; end if;

  select * into v_team from teams where id = p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if v_team.status not in ('forming', 'formed') then raise exception 'team_not_active'; end if;

  if not public.is_tournament_organizer(p_actor, v_team.tournament_id) then
    raise exception 'not_organizer';
  end if;

  -- The seat must be genuinely open: exactly one CONFIRMED member.
  select player_id into v_other
    from team_members
   where team_id = p_team_id and confirmed_at is not null
   limit 1;
  if v_other is null then raise exception 'no_confirmed_member'; end if;
  if v_other = p_player then raise exception 'self_partner'; end if;

  -- An unconfirmed invitee still in the seat is displaced; the app tells them.
  delete from team_members
   where team_id = p_team_id and player_id <> v_other and confirmed_at is null;
  update partner_invitations
     set status = 'cancelled', updated_at = now()
   where team_id = p_team_id and status = 'sent';

  if exists (select 1 from team_members where team_id = p_team_id and player_id <> v_other) then
    raise exception 'seat_not_vacant';
  end if;

  -- §2BS: fold the partner's OWN solo entry in this division into this team (paid or not).
  select t.id into v_merge_team
    from teams t
    join team_members tm on tm.team_id = t.id
   where t.division_id = v_team.division_id
     and t.id <> p_team_id
     and t.status in ('forming', 'formed', 'locked')
     and tm.player_id = p_player
     and (select count(*) from team_members m where m.team_id = t.id) = 1
   limit 1;

  if v_merge_team is not null then
    perform 1 from teams where id = v_merge_team for update;
    for v_merge_reg in
      select r.id, r.status
        from registrations r
       where r.team_id = v_merge_team
         and r.status not in ('withdrawn', 'cancelled', 'rejected', 'refunded')
       for update
    loop
      perform public.release_slot(v_merge_reg.id, p_actor, 'withdrawn');
      insert into registration_events
        (registration_id, actor_id, event_type, from_status, to_status, metadata)
        values (v_merge_reg.id, p_actor, 'merged_into_team', v_merge_reg.status::text, 'withdrawn',
                jsonb_build_object('target_team', p_team_id, 'by', 'organizer', 'reason', trim(p_reason)));
      if v_merged_registration_id is null then
        v_merged_registration_id := v_merge_reg.id;
      end if;
    end loop;
    update partner_invitations set status = 'cancelled', updated_at = now()
     where team_id = v_merge_team and status = 'sent';
    delete from team_members where team_id = v_merge_team;
    update teams set status = 'disbanded', updated_at = now() where id = v_merge_team;
  end if;

  -- On a team WITH someone else in this division: the organizer must split that team first.
  if public.player_on_active_team_in_division(v_team.division_id, p_player, p_team_id) then
    raise exception 'partner_conflict';
  end if;

  -- §2BS: no fit / composition checks here - organizer override. Players still get them.
  insert into team_members (team_id, player_id, member_order, confirmed_at)
    values (p_team_id, p_player, 2, now());

  update teams set status = 'formed', updated_at = now()
   where id = p_team_id and status = 'forming';

  select r.id, r.status into v_reg_id, v_reg_status
    from registrations r
   where r.team_id = p_team_id and r.status not in ('withdrawn', 'cancelled', 'rejected', 'refunded')
   limit 1;

  if v_reg_id is not null then
    insert into registration_events (registration_id, actor_id, event_type, from_status, to_status, metadata)
      values (v_reg_id, p_actor, 'partner_assigned_by_organizer', v_reg_status::text, v_reg_status::text,
              jsonb_build_object('team_id', p_team_id, 'player', p_player, 'reason', trim(p_reason),
                                 'merged_registration_id', v_merged_registration_id));
  end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot)
    values (p_actor, 'organizer', 'organizer_assigned_partner', 'team', p_team_id,
            jsonb_build_object('members', jsonb_build_array(v_other)),
            jsonb_build_object('members', jsonb_build_array(v_other, p_player), 'reason', trim(p_reason),
                               'merged_team_id', v_merge_team,
                               'merged_registration_id', v_merged_registration_id));

  return jsonb_build_object('team_id', p_team_id, 'registration_id', v_reg_id,
                            'other_member', v_other, 'assigned', p_player,
                            'merged_team_id', v_merge_team,
                            'merged_registration_id', v_merged_registration_id);
end $$;

comment on function public.organizer_assign_partner(uuid, uuid, uuid, text) is
  'Organizer override (0044, replaced by 0054 / master_plan 2BS): seats p_player CONFIRMED into a team''s '
  'open seat with a reason. No fit/composition checks (player-side only). Merges the partner''s own solo '
  'entry in the division (paid or not) and returns merged_registration_id. Audited.';

revoke all on function public.organizer_assign_partner(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.organizer_assign_partner(uuid, uuid, uuid, text) to service_role;

-- ---------- organizer_create_solo_doubles_team (new) ----------
create or replace function public.organizer_create_solo_doubles_team(
  p_tournament_id uuid,
  p_division_id uuid,
  p_player uuid,
  p_actor uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_div divisions%rowtype;
  v_tourn_status tournament_status;
  v_team_id uuid;
begin
  if not public.is_tournament_organizer(p_actor, p_tournament_id) then
    raise exception 'not_organizer';
  end if;

  select * into v_div from divisions where id = p_division_id for update;
  if not found then raise exception 'division_not_found'; end if;
  if v_div.tournament_id <> p_tournament_id then raise exception 'division_not_found'; end if;
  if v_div.format <> 'doubles' then raise exception 'not_doubles_division'; end if;
  if v_div.status <> 'open' then raise exception 'division_closed'; end if;

  select status into v_tourn_status from tournaments where id = p_tournament_id;
  if v_tourn_status <> 'registration_open' then raise exception 'registration_closed'; end if;

  -- §2BS: no fit check - organizer override.
  if public.player_on_active_team_in_division(p_division_id, p_player, null) then
    raise exception 'partner_conflict';
  end if;

  insert into teams (tournament_id, division_id, status)
    values (p_tournament_id, p_division_id, 'forming')
    returning id into v_team_id;

  insert into team_members (team_id, player_id, member_order, confirmed_at)
    values (v_team_id, p_player, 1, now());

  return jsonb_build_object('team_id', v_team_id);
end $$;

comment on function public.organizer_create_solo_doubles_team(uuid, uuid, uuid, uuid) is
  'Organizer "Add entry" (master_plan 2BS): create_solo_doubles_team without the division fit check. '
  'Organizer of the tournament only.';

revoke all on function public.organizer_create_solo_doubles_team(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.organizer_create_solo_doubles_team(uuid, uuid, uuid, uuid) to service_role;

-- ---------- Verification (returns 2 rows) ----------
select routine_name
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('organizer_assign_partner', 'organizer_create_solo_doubles_team')
 order by routine_name;
