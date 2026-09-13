-- =============================================================================
-- VouchPlay v2 - Migration 0044: public co-organizer opt-in, organizer assign-partner
-- master_plan §2AQ (Decisions A3, A4). Handover §17.4, §21.5.
--
-- 1. `tournament_organizers.show_publicly` - the owner decides, per co-organizer, whether that name
--    appears on the public tournament page ("Organized by {owner} with {names}"). Default FALSE: nothing
--    is exposed until switched on. The §2AP read policy is untouched (rows are still not publicly
--    readable); the public page reads opted-in rows through the service client only.
--
-- 2. `organizer_assign_partner()` - an organizer with approve-registrations permission (or the owner)
--    seats a player into a team's OPEN seat as CONFIRMED, with a reason. The same doors the player
--    flow uses are applied - division fit (sex, age, skill), mixed composition, no live team in the
--    division - but the partner lock-in does NOT apply: this is the organizer's override for the
--    "partner never confirmed / never named" cases the lock exists to surface. Any pending invitation
--    on the team is cancelled (the seat is no longer under offer). Writes a registration_events row and
--    an audit_logs row carrying the reason. The app attaches the player's bare slot, settles the
--    registration and notifies both players afterwards.
--
-- SAFE TO APPLY DURING THE OPEN REGISTRATION WINDOW: one nullable-default column, one new function.
-- Apply via the Supabase SQL editor (same method as 0001-0034, 0036, 0038-0043).
-- =============================================================================

-- ---------- 1. show_publicly (§2AQ A4) ----------
alter table public.tournament_organizers
  add column if not exists show_publicly boolean not null default false;

comment on column public.tournament_organizers.show_publicly is
  'Owner-controlled (master_plan §2AQ A4): true = this co-organizer''s name appears on the public '
  'tournament page after the owner''s. Default false - nothing is exposed until switched on.';

-- ---------- 1b. Same-deploy additions (master_plan §2AS D, F) ----------
-- Confirmation email on verification (per-tournament switch; sent once per registration) and the
-- reserved-slot cancellation request (reason; organizer refunds or keeps).
alter table public.tournaments
  add column if not exists confirmation_email_enabled boolean not null default true;
comment on column public.tournaments.confirmation_email_enabled is
  'Organizer switch (master_plan §2AS D): email every confirmed member when their entry is confirmed, '
  'with the skills-assessment / reclassification / refund caveats and the tournament link.';

alter table public.registrations
  add column if not exists confirmation_email_sent_at timestamptz;
comment on column public.registrations.confirmation_email_sent_at is
  'Set when the confirmation email went out for this entry (master_plan §2AS D); makes the send and '
  'the backfill idempotent.';

alter table public.tournament_slots
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancel_reason text;
comment on column public.tournament_slots.cancel_requested_at is
  'A reserved-slot holder asked to cancel (master_plan §2AS F). The organizer refunds the slot or keeps '
  'it (which clears this).';

-- ---------- 2. organizer_assign_partner (§2AQ A3) ----------
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
begin
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'reason_required'; end if;

  select * into v_team from teams where id = p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if v_team.status not in ('forming', 'formed') then raise exception 'team_not_active'; end if;

  -- The actor must be the owner or an active organizer of THIS tournament. The app also checks the
  -- approve_registrations permission before calling; this is the defence that does not depend on it.
  if not public.is_tournament_organizer(p_actor, v_team.tournament_id) then
    raise exception 'not_organizer';
  end if;

  -- The seat must be genuinely open: exactly one CONFIRMED member and no other row at all.
  select player_id into v_other
    from team_members
   where team_id = p_team_id and confirmed_at is not null
   limit 1;
  if v_other is null then raise exception 'no_confirmed_member'; end if;
  if v_other = p_player then raise exception 'self_partner'; end if;

  -- An unconfirmed invitee still sitting in the seat is displaced only by cancelling their invite;
  -- the organizer chose somebody else for the seat, and the invitee is told by the app.
  delete from team_members
   where team_id = p_team_id and player_id <> v_other and confirmed_at is null;
  update partner_invitations
     set status = 'cancelled', updated_at = now()
   where team_id = p_team_id and status = 'sent';

  if exists (select 1 from team_members where team_id = p_team_id and player_id <> v_other) then
    raise exception 'seat_not_vacant';
  end if;

  -- The same doors as the player flow (§2AP B, §2AM decision 1). The partner lock-in is NOT checked.
  if not public.player_fits_division(v_team.division_id, p_player) then
    raise exception 'player_does_not_fit';
  end if;
  if not public.team_partner_composition_ok(v_team.division_id, v_other, p_player) then
    raise exception 'mixed_pair';
  end if;
  if public.player_on_active_team_in_division(v_team.division_id, p_player, p_team_id) then
    raise exception 'partner_conflict';
  end if;

  insert into team_members (team_id, player_id, member_order, confirmed_at)
    values (p_team_id, p_player, 2, now());

  update teams set status = 'formed', updated_at = now()
   where id = p_team_id and status = 'forming';

  select r.id, r.status into v_reg_id, v_reg_status
    from registrations r
   where r.team_id = p_team_id and r.status not in ('withdrawn', 'cancelled', 'rejected')
   limit 1;

  if v_reg_id is not null then
    insert into registration_events (registration_id, actor_id, event_type, from_status, to_status, metadata)
      values (v_reg_id, p_actor, 'partner_assigned_by_organizer', v_reg_status::text, v_reg_status::text,
              jsonb_build_object('team_id', p_team_id, 'player', p_player, 'reason', trim(p_reason)));
  end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot)
    values (p_actor, 'organizer', 'organizer_assigned_partner', 'team', p_team_id,
            jsonb_build_object('members', jsonb_build_array(v_other)),
            jsonb_build_object('members', jsonb_build_array(v_other, p_player), 'reason', trim(p_reason)));

  return jsonb_build_object('team_id', p_team_id, 'registration_id', v_reg_id,
                            'other_member', v_other, 'assigned', p_player);
end $$;

comment on function public.organizer_assign_partner(uuid, uuid, uuid, text) is
  'Organizer override (migration 0044, master_plan §2AQ A3): seats p_player CONFIRMED into a team''s '
  'open seat with a reason. Fit, composition and conflict rules apply; the partner lock-in does not. '
  'Cancels any pending invitation on the team. Audited.';

revoke all on function public.organizer_assign_partner(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.organizer_assign_partner(uuid, uuid, uuid, text) to service_role;
