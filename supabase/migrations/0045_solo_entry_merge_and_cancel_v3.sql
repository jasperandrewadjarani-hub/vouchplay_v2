-- =============================================================================
-- VouchPlay v2 - Migration 0045: solo-entry partner merge, dismissible bare slots, cancel v3
-- master_plan §2AT (Decisions A, B, D + the Contracts block). Handover §20 (partner invitations),
-- §21 (teams), §23 (registration), §24 (payment model), §36.28A (tournament_slots).
--
-- Three things, one migration:
--
-- 1. SOLO ENTRIES COULD NOT PARTNER UP (§2AT A). Every seating RPC refuses when the invitee is on ANY
--    live team in the division (`player_on_active_team_in_division`, 0031). Since 0040 gave a player a
--    genuinely solo `forming` team (enter now, choose a partner later), the player's OWN solo entry
--    trips that guard: the invitation search shows Christine as choosable and the RPC then answers
--    `partner_conflict` - the worst possible order. The rule Jasper wants: two players who each hold a
--    place in the same division (paid or not) may partner up, division rules permitting.
--    `mergeable_solo_team()` is the single definition of "this entry can be folded into another team":
--    exactly one member (them, confirmed), nothing under offer from it, and NO team receipt in
--    `submitted`/`verified` on its live registration - a whole-team payment is the organizer's to
--    untangle, not this RPC's. The three inviting RPCs stop refusing a MERGEABLE invitee; when the
--    block really is a paid team receipt they now say so (`team_paid_not_mergeable`) instead of the
--    undifferentiated `partner_conflict`, so the app can tell the player to ask the organizer.
--    `accept_partner_invitation` does the actual merge on the team branch: the invitee's solo
--    registration is released (`release_slot ... 'withdrawn'`, event `merged_into_team`), the solo team
--    is disbanded, and they are then seated exactly as before. The RPC returns
--    `merged_registration_id` / `merged_team_id` so the server can move the invitee's paid SLOT from
--    the released entry onto the joined one - the money travels with the person (§2AO A1).
--
-- 2. A REJECTED BARE SLOT COULD NOT BE PUT AWAY (§2AT D). `tournament_slots.dismissed_at` marks a
--    declined reservation the PLAYER removed from their own list. It is never a live state: a dismissed
--    slot is not shown, not payable and not cancellable, and dismissing it neither refunds nor
--    un-declines anything.
--
-- 3. A DECLINED RECEIPT TRAPPED THE PLAYER (§2AT B). `player_cancel_registration` v2 raised
--    `payment_already_started` when a `payments` row existed in ANY status - `rejected` and `refunded`
--    included - so a player whose receipt was declined could neither pay (without resubmitting) nor
--    cancel without the organizer. v3 blocks only on money that is actually in flight: a team receipt
--    in `submitted`/`verified`, or another member's live attached seat. Nothing else changes.
--
-- SAFE TO APPLY DURING THE OPEN REGISTRATION WINDOW: one nullable column with no default, one new
-- function, and five `create or replace` re-creations that keep their EXACT signatures and return
-- types. Every re-created function only WIDENS what is accepted - no entry, invitation or cancellation
-- that succeeds today starts failing - except the new, strictly more specific `team_paid_not_mergeable`
-- refusal, which replaces a `partner_conflict` that already refused the same call.
--
-- ONE DELIBERATE SIDE EFFECT: a merged registration that was holding a slot goes through `release_slot`,
-- which promotes the next waitlisted team in that division exactly as a withdrawal does. That is
-- intended - the seat really is given up - and it is the same promotion the player would have caused by
-- cancelling the entry by hand before accepting.
--
-- APPLY THIS *WITH OR AFTER* THE §2AT DEPLOY, NOT BEFORE IT. The merge is only half of the story in
-- SQL: `accept_partner_invitation` releases the invitee's solo registration and hands back
-- `merged_registration_id`, and the SERVER then moves that player's paid `tournament_slots` row off the
-- released entry and onto the joined one. Applied ahead of the deploy, the currently running code
-- ignores the new keys, so a merged player's slot would sit attached to a withdrawn registration -
-- neither bare nor live, so invisible in My registrations until the deploy lands (no money is lost; the
-- row is intact and the server re-attaches it on the next settle). Nothing else in this migration cares
-- about the order.
--
-- Apply via the Supabase SQL editor (same method as 0001-0034, 0036, 0038-0044).
-- =============================================================================

-- =============================================================================
-- 1. tournament_slots.dismissed_at (§2AT D) - the player put a declined reservation away.
-- =============================================================================
alter table public.tournament_slots
  add column if not exists dismissed_at timestamptz;

comment on column public.tournament_slots.dismissed_at is
  'The player removed this REJECTED bare slot from their own list (master_plan §2AT D). Never a live '
  'state: a dismissed slot is excluded from getLatestBareSlot and offers no pay / cancel action. '
  'Dismissing refunds nothing and un-declines nothing - it only hides a dead reservation.';

-- =============================================================================
-- 2. mergeable_solo_team (§2AT A) - the ONE definition of "this entry can be folded into a team".
--
--    Returns the id of p_player's live team in p_division_id when that team is a solo entry the player
--    may walk away from unilaterally, and null otherwise (no such team, a real partner on it, a seat
--    already under offer, or a whole-team receipt already in the organizer's hands).
--
--    `security definer` for the same reason `player_on_active_team_in_division` is (0031): it reads
--    another player's teams / registrations / payments to answer a yes-or-no question the caller is
--    entitled to, and it is called from inside the definer RPCs below. It returns a team id and
--    nothing else - no amounts, no statuses, no names.
-- =============================================================================
create or replace function public.mergeable_solo_team(
  p_division_id uuid,
  p_player uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
    from teams t
    join team_members tm on tm.team_id = t.id
   where t.division_id = p_division_id
     and t.status in ('forming', 'formed', 'locked')
     and tm.player_id = p_player
     and tm.confirmed_at is not null
     -- Exactly one membership row on the whole team: the player themselves. An unconfirmed invitee
     -- sitting in seat 2 counts, so a team that is mid-invitation is never silently disbanded.
     and (select count(*) from team_members m where m.team_id = t.id) = 1
     -- ...and the seat is not under offer to anybody.
     and not exists (
       select 1 from partner_invitations pi
        where pi.team_id = t.id
          and pi.status = 'sent'
     )
     -- A team receipt in the organizer's hands is money this RPC must not move (§2AT A).
     and not exists (
       select 1
         from registrations r
         join payments pay on pay.registration_id = r.id
        where r.team_id = t.id
          and r.status not in ('withdrawn', 'cancelled', 'rejected')
          and pay.status in ('submitted', 'verified')
     )
   limit 1;
$$;

comment on function public.mergeable_solo_team(uuid, uuid) is
  'Solo-entry merge predicate (migration 0045, master_plan §2AT A): the id of p_player''s live team in '
  'p_division_id when it holds exactly one member (them, confirmed), has no invitation in ''sent'', and '
  'carries no team receipt in submitted/verified on a live registration. Null when there is no such '
  'team or it is not mergeable.';

revoke all on function public.mergeable_solo_team(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mergeable_solo_team(uuid, uuid) to service_role;

-- =============================================================================
-- 3. Re-created seating RPCs. Same signatures, same return types (`create or replace` cannot change
--    either), bodies taken verbatim from 0040 with ONE change each: the INVITEE's conflict guard.
--
--    Old:  on a live team in this division            -> partner_conflict
--    New:  on a live team with a paid team receipt    -> team_paid_not_mergeable  (the app tells the
--                                                        player to ask the organizer to combine)
--          on a live team that is NOT mergeable       -> partner_conflict         (as before)
--          on a live MERGEABLE solo team              -> allowed; the merge happens at ACCEPTANCE
--
--    The INVITER's own guards are untouched: a player who already holds an entry in the division does
--    not get to start a second one - they fill their own open seat instead.
-- =============================================================================

-- ---------- create_team_with_pending_partner (mergeable-aware invitee guard) ----------
create or replace function public.create_team_with_pending_partner(
  p_tournament_id uuid,
  p_division_id uuid,
  p_inviter uuid,
  p_invitee uuid,
  p_message text default null,
  p_expires_at timestamptz default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_div divisions%rowtype;
  v_tourn_status tournament_status;
  v_team_id uuid;
  v_invitation_id uuid;
begin
  if p_inviter = p_invitee then raise exception 'self_partner'; end if;

  select * into v_div from divisions where id = p_division_id for update;
  if not found then raise exception 'division_not_found'; end if;
  if v_div.tournament_id <> p_tournament_id then raise exception 'division_not_found'; end if;
  if v_div.status <> 'open' then raise exception 'division_closed'; end if;

  select status into v_tourn_status from tournaments where id = p_tournament_id;
  if v_tourn_status <> 'registration_open' then raise exception 'registration_closed'; end if;

  -- The INVITER already on a LIVE, registered team in this division (§20.3, §21.4). Unchanged: they
  -- would be starting a second entry, not merging one.
  if public.player_on_active_team_in_division(p_division_id, p_inviter) then
    raise exception 'partner_conflict';
  end if;

  -- The INVITEE (§2AT A). A paid team receipt is named for what it is; a mergeable solo entry no
  -- longer refuses - it is folded in when they accept.
  if public.player_on_active_team_in_division(p_division_id, p_invitee) then
    if exists (
      select 1
        from teams t
        join team_members tm on tm.team_id = t.id
        join registrations r on r.team_id = t.id
        join payments pay on pay.registration_id = r.id
       where t.division_id = p_division_id
         and t.status in ('forming', 'formed', 'locked')
         and tm.player_id = p_invitee
         and r.status not in ('withdrawn', 'cancelled', 'rejected')
         and pay.status in ('submitted', 'verified')
    ) then
      raise exception 'team_paid_not_mergeable';
    end if;
    if public.mergeable_solo_team(p_division_id, p_invitee) is null then
      raise exception 'partner_conflict';
    end if;
  end if;

  -- §2AM decision 1: a mixed doubles team is one male + one female, checked at every door.
  if not public.team_partner_composition_ok(p_division_id, p_inviter, p_invitee) then
    raise exception 'mixed_pair';
  end if;

  insert into teams (tournament_id, division_id, status)
    values (p_tournament_id, p_division_id, 'forming')
    returning id into v_team_id;

  insert into team_members (team_id, player_id, member_order, confirmed_at) values
    (v_team_id, p_inviter, 1, now()),
    (v_team_id, p_invitee, 2, null);

  insert into partner_invitations
    (tournament_id, division_id, inviter_id, invitee_id, message, status, expires_at, team_id)
    values (p_tournament_id, p_division_id, p_inviter, p_invitee, p_message, 'sent', p_expires_at, v_team_id)
    returning id into v_invitation_id;

  return json_build_object('team_id', v_team_id, 'invitation_id', v_invitation_id);
end $$;

comment on function public.create_team_with_pending_partner(uuid, uuid, uuid, uuid, text, timestamptz) is
  'Create a forming team and invite a partner (migration 0045, master_plan §2AT A): as 0040 except the '
  'INVITEE''s guard - a mergeable solo entry is accepted (it is folded in at acceptance), a team with a '
  'submitted/verified receipt raises team_paid_not_mergeable, anything else still raises '
  'partner_conflict. The inviter''s own conflict guard is unchanged.';

revoke all on function public.create_team_with_pending_partner(uuid, uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_team_with_pending_partner(uuid, uuid, uuid, uuid, text, timestamptz)
  to service_role;

-- ---------- replace_pending_partner (mergeable-aware invitee guard) ----------
create or replace function public.replace_pending_partner(
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
  v_invitation_id uuid;
  v_reg_id uuid;
begin
  select * into v_team from teams where id = p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if p_actor = p_new_invitee then raise exception 'self_partner'; end if;

  -- The actor must be a CONFIRMED member of this team.
  if not exists (
    select 1 from team_members
    where team_id = p_team_id and player_id = p_actor and confirmed_at is not null
  ) then
    raise exception 'not_team_member';
  end if;

  -- Nobody may be displaced: the seat must actually be empty.
  if exists (select 1 from team_members where team_id = p_team_id and player_id <> p_actor) then
    raise exception 'seat_not_vacant';
  end if;

  -- ...and it must not already be under offer to somebody.
  if exists (
    select 1 from partner_invitations where team_id = p_team_id and status = 'sent'
  ) then
    raise exception 'invitation_pending';
  end if;

  -- §2AM: gated by the partner lock, NOT by registration close (Hermosa closes a month before it
  -- starts). A closed division still accepts a partner for an entry it already holds.
  if not public.partner_changes_are_open(v_team.tournament_id) then
    raise exception 'partner_lock_passed';
  end if;
  select status into v_div_status from divisions where id = v_team.division_id;
  if v_div_status not in ('open', 'closed') then raise exception 'division_closed'; end if;

  -- The INVITEE (§2AT A): a mergeable solo entry is no longer a conflict; a paid team receipt is named.
  if public.player_on_active_team_in_division(v_team.division_id, p_new_invitee) then
    if exists (
      select 1
        from teams t
        join team_members tm on tm.team_id = t.id
        join registrations r on r.team_id = t.id
        join payments pay on pay.registration_id = r.id
       where t.division_id = v_team.division_id
         and t.status in ('forming', 'formed', 'locked')
         and tm.player_id = p_new_invitee
         and r.status not in ('withdrawn', 'cancelled', 'rejected')
         and pay.status in ('submitted', 'verified')
    ) then
      raise exception 'team_paid_not_mergeable';
    end if;
    if public.mergeable_solo_team(v_team.division_id, p_new_invitee) is null then
      raise exception 'partner_conflict';
    end if;
  end if;

  -- The invitee must fit this division on their own, and the pair must be legal for it.
  if not public.player_fits_division(v_team.division_id, p_new_invitee) then
    raise exception 'player_does_not_fit';
  end if;
  if not public.team_partner_composition_ok(v_team.division_id, p_actor, p_new_invitee) then
    raise exception 'mixed_pair';
  end if;

  insert into team_members (team_id, player_id, member_order, confirmed_at)
    values (p_team_id, p_new_invitee, 2, null);

  insert into partner_invitations
    (tournament_id, division_id, inviter_id, invitee_id, message, status, expires_at, team_id)
    values (v_team.tournament_id, v_team.division_id, p_actor, p_new_invitee, p_message, 'sent',
            p_expires_at, p_team_id)
    returning id into v_invitation_id;

  select r.id into v_reg_id from registrations r
    where r.team_id = p_team_id and r.status not in ('withdrawn','cancelled','rejected')
    limit 1;
  if v_reg_id is not null then
    insert into registration_events (registration_id, actor_id, event_type, metadata)
      values (v_reg_id, p_actor, 'partner_replaced',
              json_build_object('team_id', p_team_id, 'new_invitee', p_new_invitee,
                                'invitation_id', v_invitation_id)::jsonb);
  end if;

  return json_build_object('team_id', p_team_id, 'invitation_id', v_invitation_id,
                           'registration_id', v_reg_id);
end $$;

comment on function public.replace_pending_partner(uuid, uuid, uuid, text, timestamptz) is
  'Fill a team''s vacant seat (migration 0045, master_plan §2AT A): as 0040 except the invitee''s guard - '
  'a mergeable solo entry is accepted, a team with a submitted/verified receipt raises '
  'team_paid_not_mergeable, anything else still raises partner_conflict.';

revoke all on function public.replace_pending_partner(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.replace_pending_partner(uuid, uuid, uuid, text, timestamptz)
  to service_role;

-- ---------- change_partner (mergeable-aware invitee guard) ----------
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
  v_old_confirmed_at timestamptz;
  v_invitation_id uuid;
  v_reg_id uuid;
begin
  select * into v_team from teams where id = p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if p_actor = p_new_invitee then raise exception 'self_partner'; end if;

  -- Partner actions follow the partner lock, never the generic self-service window (§2AM).
  if not public.partner_changes_are_open(v_team.tournament_id) then
    raise exception 'partner_lock_passed';
  end if;

  select status into v_div_status from divisions where id = v_team.division_id;
  -- A closed division still allows swapping an unanswered invitee (parity with replace_pending_partner,
  -- §2AM): this is not a new registration. Locked/cancelled/draft still refuse.
  if v_div_status not in ('open', 'closed') then raise exception 'division_closed'; end if;

  -- Only a CONFIRMED member may restructure their own team.
  if not exists (
    select 1 from team_members
    where team_id = p_team_id and player_id = p_actor and confirmed_at is not null
  ) then
    raise exception 'not_team_member';
  end if;

  select player_id, confirmed_at into v_old_partner, v_old_confirmed_at
    from team_members where team_id = p_team_id and player_id <> p_actor limit 1;
  if v_old_partner is null then raise exception 'no_partner_to_replace'; end if;
  if v_old_partner = p_new_invitee then raise exception 'same_partner'; end if;

  -- A partner who already accepted can only leave with their own consent (§2AM decision 4).
  if v_old_confirmed_at is not null then
    raise exception 'partner_confirmed_needs_release';
  end if;

  -- The replacement must fit THIS division, so a swap cannot route around its rules.
  if not public.player_fits_division(v_team.division_id, p_new_invitee) then
    raise exception 'partner_does_not_fit_division';
  end if;

  if not public.team_partner_composition_ok(v_team.division_id, p_actor, p_new_invitee) then
    raise exception 'mixed_pair';
  end if;

  -- The INVITEE (§2AT A): a mergeable solo entry is no longer a conflict; a paid team receipt is named.
  -- This team is excluded on both checks, exactly as the 0040 guard excluded it.
  if public.player_on_active_team_in_division(v_team.division_id, p_new_invitee, p_team_id) then
    if exists (
      select 1
        from teams t
        join team_members tm on tm.team_id = t.id
        join registrations r on r.team_id = t.id
        join payments pay on pay.registration_id = r.id
       where t.division_id = v_team.division_id
         and t.id <> p_team_id
         and t.status in ('forming', 'formed', 'locked')
         and tm.player_id = p_new_invitee
         and r.status not in ('withdrawn', 'cancelled', 'rejected')
         and pay.status in ('submitted', 'verified')
    ) then
      raise exception 'team_paid_not_mergeable';
    end if;
    if public.mergeable_solo_team(v_team.division_id, p_new_invitee) is null then
      raise exception 'partner_conflict';
    end if;
  end if;

  delete from team_members where team_id = p_team_id and player_id = v_old_partner;

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

  return json_build_object('team_id', p_team_id, 'invitation_id', v_invitation_id,
                           'registration_id', v_reg_id, 'removed_player', v_old_partner);
end $$;

comment on function public.change_partner(uuid, uuid, uuid, text, timestamptz) is
  'Swap an UNCONFIRMED invitee (migration 0045, master_plan §2AT A): as 0040 except the new invitee''s '
  'guard - a mergeable solo entry is accepted, a team with a submitted/verified receipt raises '
  'team_paid_not_mergeable, anything else still raises partner_conflict. A confirmed partner still '
  'raises partner_confirmed_needs_release.';

revoke all on function public.change_partner(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.change_partner(uuid, uuid, uuid, text, timestamptz)
  to service_role;

-- =============================================================================
-- 4. accept_partner_invitation - the merge itself (§2AT A).
--
--    The team branch gains ONE block, ahead of every existing check: if the invitee holds a mergeable
--    solo team in this division (and it is not the team they are joining), that entry is released,
--    recorded and disbanded first. Everything after it - the lock, the conflict guard, re-fit,
--    composition, seating, the `partner_confirmed` event - is byte-identical to 0040, and the conflict
--    guard now passes for exactly the case that used to fail it.
--
--    `release_slot` promotes the next waitlisted team when the released registration was holding a
--    slot. That is intended (§2AT A): the seat is genuinely given up.
--
--    The non-team branch (invitations created before 0025, where no team exists yet) is untouched.
-- =============================================================================
create or replace function public.accept_partner_invitation(p_invitation_id uuid, p_actor uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_inv partner_invitations%rowtype;
  v_recip_id uuid;
  v_team_id uuid;
  v_team_division uuid;
  v_other_member uuid;
  v_merge_team uuid;
  v_merged_registration_id uuid;
  v_merge_reg record;
begin
  select * into v_inv from partner_invitations where id = p_invitation_id for update;
  if not found then raise exception 'invitation_not_found'; end if;
  if v_inv.invitee_id <> p_actor then raise exception 'not_invitee'; end if;
  if v_inv.status <> 'sent' then raise exception 'not_pending'; end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    update partner_invitations set status = 'expired' where id = p_invitation_id;
    raise exception 'invitation_expired';
  end if;

  if v_inv.team_id is not null then
    -- §2AM decision 5: seating a player is a partner action, gated by the lock and NOT by
    -- registration close.
    if not public.partner_changes_are_open(v_inv.tournament_id) then
      raise exception 'partner_lock_passed';
    end if;

    -- §2AT A: fold the invitee's own solo entry into this team BEFORE the conflict guard runs, which
    -- is precisely what that guard used to refuse. Nothing here touches a team with a real partner, a
    -- seat under offer, or a whole-team receipt - mergeable_solo_team() excludes all three.
    v_merge_team := public.mergeable_solo_team(v_inv.division_id, v_inv.invitee_id);
    if v_merge_team is not null and v_merge_team <> v_inv.team_id then
      for v_merge_reg in
        select r.id, r.status
          from registrations r
         where r.team_id = v_merge_team
           and r.status not in ('withdrawn', 'cancelled', 'rejected')
         for update
      loop
        -- Releases the entry and promotes the division's next waitlisted team, as a withdrawal does.
        perform public.release_slot(v_merge_reg.id, p_actor, 'withdrawn');

        -- release_slot writes its own 'withdrawn' event; this second row says WHY, and carries the
        -- team the entry was folded into so the server can move the player's paid slot across.
        insert into registration_events
          (registration_id, actor_id, event_type, from_status, to_status, metadata)
          values (v_merge_reg.id, p_actor, 'merged_into_team', v_merge_reg.status::text, 'withdrawn',
                  jsonb_build_object('target_team', v_inv.team_id, 'invitation_id', p_invitation_id));

        if v_merged_registration_id is null then
          v_merged_registration_id := v_merge_reg.id;
        end if;
      end loop;

      -- Exactly one membership row (the invitee's) by mergeable_solo_team's own definition.
      delete from team_members where team_id = v_merge_team;

      update teams set status = 'disbanded', updated_at = now() where id = v_merge_team;

      -- Defensive: mergeable_solo_team already excluded a team with an invitation in 'sent'.
      update partner_invitations set status = 'cancelled', updated_at = now()
       where team_id = v_merge_team and status = 'sent';
    end if;

    -- Confirm into the existing team; the invitee's OWN team is excluded from the conflict check.
    if public.player_on_active_team_in_division(v_inv.division_id, v_inv.invitee_id, v_inv.team_id) then
      raise exception 'partner_conflict';
    end if;

    -- §2AM decision 3: fit and composition are re-checked AT ACCEPTANCE. A community skill level can
    -- move between the invite and the accept, and the team's other seat can have changed hands.
    select t.division_id into v_team_division from teams t where t.id = v_inv.team_id;
    if not public.player_fits_division(v_team_division, v_inv.invitee_id) then
      raise exception 'player_does_not_fit';
    end if;

    select tm.player_id into v_other_member
      from team_members tm
     where tm.team_id = v_inv.team_id
       and tm.player_id <> v_inv.invitee_id
       and tm.confirmed_at is not null
     limit 1;
    if not public.team_partner_composition_ok(v_team_division, v_inv.invitee_id, v_other_member) then
      raise exception 'mixed_pair';
    end if;

    update team_members set confirmed_at = now()
      where team_id = v_inv.team_id and player_id = v_inv.invitee_id and confirmed_at is null;
    if not found then raise exception 'membership_not_pending'; end if;

    update teams set status = 'formed' where id = v_inv.team_id and status = 'forming';
    update partner_invitations set status = 'accepted', updated_at = now() where id = p_invitation_id;

    insert into registration_events (registration_id, actor_id, event_type, metadata)
      select r.id, p_actor, 'partner_confirmed',
             json_build_object('team_id', v_inv.team_id, 'invitation_id', p_invitation_id)::jsonb
        from registrations r
       where r.team_id = v_inv.team_id
         and r.status not in ('withdrawn','cancelled','rejected');

    return json_build_object('team_id', v_inv.team_id, 'merged', false, 'joined_existing', true,
                             'merged_registration_id', v_merged_registration_id,
                             'merged_team_id', v_merge_team);
  end if;

  -- Original path: no team yet (invitations created before migration 0025).
  if not public.partner_changes_are_open(v_inv.tournament_id) then
    raise exception 'partner_lock_passed';
  end if;

  if public.player_on_active_team_in_division(v_inv.division_id, v_inv.inviter_id)
     or public.player_on_active_team_in_division(v_inv.division_id, v_inv.invitee_id) then
    raise exception 'partner_conflict';
  end if;

  select id into v_recip_id from partner_invitations
    where tournament_id = v_inv.tournament_id and division_id = v_inv.division_id
      and inviter_id = v_inv.invitee_id and invitee_id = v_inv.inviter_id and status = 'sent'
    for update;

  insert into teams (tournament_id, division_id, status)
    values (v_inv.tournament_id, v_inv.division_id, 'formed')
    returning id into v_team_id;
  insert into team_members (team_id, player_id, member_order, confirmed_at) values
    (v_team_id, v_inv.inviter_id, 1, now()),
    (v_team_id, v_inv.invitee_id, 2, now());

  update partner_invitations set status = 'accepted', updated_at = now() where id = p_invitation_id;
  if v_recip_id is not null then
    update partner_invitations set status = 'merged', updated_at = now() where id = v_recip_id;
  end if;

  return json_build_object('team_id', v_team_id, 'merged', (v_recip_id is not null), 'joined_existing', false);
end $$;

comment on function public.accept_partner_invitation(uuid, uuid) is
  'Accept a partner invitation (migration 0045, master_plan §2AT A): as 0040, plus - on the team branch '
  'only - the invitee''s own mergeable solo entry is released (release_slot ... withdrawn, event '
  'merged_into_team, waitlist promoted as usual) and its team disbanded before they are seated. Returns '
  'merged_registration_id / merged_team_id so the server can move their paid slot onto the joined entry - '
  'both are null when nothing was merged.';

revoke all on function public.accept_partner_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_partner_invitation(uuid, uuid) to service_role;

-- =============================================================================
-- 5. player_cancel_registration v3 (§2AT B) - 0042's body with one widened guard.
--
--    `payment_already_started` now means money that is ACTUALLY IN FLIGHT: a team receipt in
--    `submitted` or `verified`, or another member's live attached seat. A `rejected` or `refunded`
--    receipt no longer blocks - a player whose receipt was declined can neither pay nor be left waiting
--    on the organizer to cancel for them (§2AT finding 2). `pending` does not block either: it is a
--    receipt row with nothing submitted against it.
-- =============================================================================
create or replace function public.player_cancel_registration(
  p_registration_id uuid,
  p_actor uuid
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration registrations%rowtype;
  v_result json;
begin
  select * into v_registration from registrations where id = p_registration_id for update;
  if not found then raise exception 'registration_not_found'; end if;
  if not public.player_registration_changes_are_open(v_registration.tournament_id) then
    raise exception 'player_changes_locked';
  end if;
  if not exists (
    select 1 from team_members where team_id = v_registration.team_id and player_id = p_actor
  ) then
    raise exception 'not_team_member';
  end if;
  if v_registration.status not in ('payment_pending', 'waitlisted') then
    raise exception 'player_cancellation_not_allowed';
  end if;
  -- §2AO A4 + §2AT B: money that is NOT the actor's own still blocks a self-cancel - a LIVE team
  -- receipt is one payment for the whole entry, and another member's attached seat is that member's
  -- money. Neither may be walked away from unilaterally. But a declined or refunded receipt is not
  -- money in flight, and a player whose OWN seat is the only money on the entry may self-cancel: the
  -- app detaches their slot afterwards, it becomes bare again and is reusable through the wizard.
  if exists (
       select 1 from payments p
        where p.registration_id = v_registration.id
          and p.status in ('submitted', 'verified')
     )
     or exists (
       select 1 from tournament_slots s
        where s.registration_id = v_registration.id
          and s.player_id <> p_actor
          and s.status in ('submitted', 'verified')
     ) then
    raise exception 'payment_already_started';
  end if;

  v_result := public.release_slot(p_registration_id, p_actor, 'withdrawn');
  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot)
  values (
    p_actor, 'player', 'player_registration_cancelled', 'registration', p_registration_id,
    jsonb_build_object('status', v_registration.status), jsonb_build_object('status', 'withdrawn')
  );
  return v_result;
end;
$$;

comment on function public.player_cancel_registration(uuid, uuid) is
  'Player self-cancellation v3 (migration 0045, master_plan §2AT B): unchanged from 0042 except that '
  'payment_already_started now means a TEAM payment in submitted/verified, or a live tournament_slot '
  'belonging to ANOTHER member attached to this registration. A rejected or refunded receipt no longer '
  'traps the player, and a player whose own seat is the only money on the entry may still self-cancel.';

revoke all on function public.player_cancel_registration(uuid, uuid) from public, anon, authenticated;
grant execute on function public.player_cancel_registration(uuid, uuid) to service_role;
