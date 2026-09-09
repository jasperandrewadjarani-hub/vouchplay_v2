-- =============================================================================
-- VouchPlay v2 - Migration 0027: change partner after payment
-- master_plan §1Y / §2A. Handover §20 (partner invitations), §21 (teams), §1D (partner lock).
--
-- Until now a partner could only be replaced when the seat was ALREADY vacant because the named
-- player declined (`replace_pending_partner`, migration 0025). A player who has paid and simply needs
-- a different partner had no route at all: the seat was occupied, so every path refused.
--
-- This adds one transactional swap that works while the seat is still occupied, and it is deliberately
-- narrow:
--   * the replacement must FIT THE SAME DIVISION - same sex classification and inside the same skill
--     band - so a partner swap can never be used to route around a division's own rules;
--   * the registration, the payment and the waitlist position are NEVER touched;
--   * the removed player is returned to the caller so the app can notify them. §1D exists so nobody
--     is displaced WITHOUT THEIR KNOWLEDGE; being told is what keeps that promise.
--
-- Apply via the Supabase SQL editor (same method as 0001-0026).
-- =============================================================================

-- ---------- Does one player fit this division's own rules? ----------
-- Skill uses the same precedence as everywhere else: community skill if known, else self-rating.
-- A player with NO known skill is not blocked - there is nothing to compare (mirrors §10.6/skill-floor).
create or replace function public.player_fits_division(p_division_id uuid, p_player uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_div divisions%rowtype;
  v_sex text;
  v_skill smallint;
begin
  select * into v_div from divisions where id = p_division_id;
  if not found then return false; end if;

  select p.sex,
         coalesce(sp.community_skill_level, p.self_rated_skill)
    into v_sex, v_skill
    from profiles p
    left join player_skill_profiles sp on sp.player_id = p.id
   where p.id = p_player;
  if not found then return false; end if;

  -- Sex classification (§25, WRONG_SEX). 'mixed' and 'genderless' accept anyone.
  if v_div.sex_classification = 'men' and coalesce(v_sex, '') <> 'male' then return false; end if;
  if v_div.sex_classification = 'women' and coalesce(v_sex, '') <> 'female' then return false; end if;

  -- Skill band. Unknown skill never blocks; a banded division blocks outside its own range.
  if v_div.skill_policy <> 'open' and v_skill is not null then
    if v_div.minimum_skill is not null and v_skill < v_div.minimum_skill then return false; end if;
    if v_div.maximum_skill is not null and v_skill > v_div.maximum_skill then return false; end if;
  end if;

  return true;
end $$;

-- =============================================================================
-- change_partner: swap the OTHER member of a two-player team for someone else.
-- Works whether the current partner had confirmed or not. Money and slot are untouched.
-- =============================================================================
create or replace function public.change_partner(
  p_team_id uuid,
  p_actor uuid,
  p_new_invitee uuid,
  p_message text default null,
  p_expires_at timestamptz default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_team teams%rowtype;
  v_div_status division_status;
  v_old_partner uuid;
  v_invitation_id uuid;
  v_reg_id uuid;
begin
  select * into v_team from teams where id = p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if p_actor = p_new_invitee then raise exception 'self_partner'; end if;

  -- Player-initiated changes obey the organizer's own window (§1E club/registration lock).
  if not public.player_registration_changes_are_open(v_team.tournament_id) then
    raise exception 'player_changes_locked';
  end if;

  select status into v_div_status from divisions where id = v_team.division_id;
  if v_div_status <> 'open' then raise exception 'division_closed'; end if;

  -- Only a CONFIRMED member may restructure their own team.
  if not exists (
    select 1 from team_members
    where team_id = p_team_id and player_id = p_actor and confirmed_at is not null
  ) then
    raise exception 'not_team_member';
  end if;

  select player_id into v_old_partner
    from team_members where team_id = p_team_id and player_id <> p_actor limit 1;
  if v_old_partner is null then raise exception 'no_partner_to_replace'; end if;
  if v_old_partner = p_new_invitee then raise exception 'same_partner'; end if;

  -- The replacement must fit THIS division, so a swap cannot route around its rules.
  if not public.player_fits_division(v_team.division_id, p_new_invitee) then
    raise exception 'partner_does_not_fit_division';
  end if;

  -- And must not already be on a live team in the same division.
  if exists (
    select 1 from team_members tm
    join teams t on t.id = tm.team_id
    where t.division_id = v_team.division_id
      and t.status in ('forming','formed','locked')
      and t.id <> p_team_id
      and tm.player_id = p_new_invitee
  ) then
    raise exception 'partner_conflict';
  end if;

  delete from team_members where team_id = p_team_id and player_id = v_old_partner;

  -- Any invitation still outstanding for the removed player is no longer meaningful.
  update partner_invitations
     set status = 'cancelled', updated_at = now()
   where team_id = p_team_id and invitee_id = v_old_partner and status = 'sent';

  insert into team_members (team_id, player_id, member_order, confirmed_at)
    values (p_team_id, p_new_invitee, 2, null);

  update teams set status = 'forming', updated_at = now()
   where id = p_team_id and status = 'formed';

  insert into partner_invitations
    (tournament_id, division_id, inviter_id, invitee_id, message, status, expires_at, team_id)
    values (v_team.tournament_id, v_team.division_id, p_actor, p_new_invitee, p_message, 'sent',
            p_expires_at, p_team_id)
    returning id into v_invitation_id;

  -- The registration row is untouched on purpose: status, slot hold, payment and waitlist position
  -- all survive a partner change.
  select r.id into v_reg_id from registrations r
   where r.team_id = p_team_id and r.status not in ('withdrawn','cancelled','rejected')
   limit 1;
  if v_reg_id is not null then
    insert into registration_events (registration_id, actor_id, event_type, metadata)
      values (v_reg_id, p_actor, 'partner_changed',
              json_build_object('team_id', p_team_id, 'removed_player', v_old_partner,
                                'new_invitee', p_new_invitee,
                                'invitation_id', v_invitation_id)::jsonb);
  end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot)
  values (p_actor, 'player', 'player_changed_partner', 'team', p_team_id,
          jsonb_build_object('partner', v_old_partner),
          jsonb_build_object('partner', p_new_invitee, 'invitation_id', v_invitation_id));

  -- removed_player is returned so the caller ALWAYS notifies them (§1D).
  return json_build_object('team_id', p_team_id, 'invitation_id', v_invitation_id,
                           'registration_id', v_reg_id, 'removed_player', v_old_partner);
end $$;

revoke all on function public.player_fits_division(uuid, uuid) from public, anon, authenticated;
revoke all on function public.change_partner(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.player_fits_division(uuid, uuid) to service_role;
grant execute on function public.change_partner(uuid, uuid, uuid, text, timestamptz) to service_role;

-- =============================================================================
-- VERIFICATION - run as the LAST statement (the SQL editor shows only the final result).
-- Expected: fits_division_fn=1, change_partner_fn=1, invitation_team_id_column=1.
-- teams_with_two_members is informational: doubles teams that currently have a partner to swap.
-- =============================================================================
select 'fits_division_fn' as check, count(*)::int as value
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'player_fits_division'
union all
select 'change_partner_fn', count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'change_partner'
union all
select 'invitation_team_id_column', count(*)::int
  from information_schema.columns
 where table_schema = 'public' and table_name = 'partner_invitations' and column_name = 'team_id'
union all
select 'teams_with_two_members', count(*)::int
  from (select team_id from team_members group by team_id having count(*) = 2) t;
