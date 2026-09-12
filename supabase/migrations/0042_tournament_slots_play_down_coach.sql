-- =============================================================================
-- VouchPlay v2 - Migration 0042: tournament slots (pay per seat), play-down-one, coach vouch count
-- master_plan §2AO (Decisions A1-A5, C, D2, E + the Contracts block). Handover §24 (payment model),
-- §36.28A (tournament_slots), §18.7 (play one level down), §9.1/§9.2 (coach vouch surfaces), §37 (RLS),
-- §38 (private proof storage).
--
-- Five things, one migration:
--
-- 1. `tournament_slots` - THE SEAT BECOMES A UNIT OF PAYMENT (§2AO A1). Today money is one row per
--    TEAM registration (`payments.unique(registration_id)`), so a doubles entry is all-or-nothing and
--    a player cannot pay for themselves, cannot reserve a place before choosing a division, and cannot
--    carry their money with them when a partner falls through. A slot is one player's paid seat in one
--    tournament and lives in one of three shapes: BARE (`registration_id` null - "I reserved a slot,
--    I'll choose my division later"), ATTACHED (`registration_id` set - this player's seat on that team
--    entry) or RETIRED (`status in (rejected, refunded)`).
--    Why a NEW TABLE and not more `payments` rows: `payments.unique(registration_id)` is exactly what
--    the live `submitPayment` upsert keys on, so relaxing it would break the running app in the window
--    between this migration and the deploy landing - during Hermosa's early-bird week. A second table
--    is purely additive: the deployed code never reads it, the new code reads it defensively, and the
--    feature only switches on because the seed below sets `tournament_slot_reservations_enabled` true
--    (the code default is FALSE - the flag is this migration's proof of life, not an admin decision).
--
-- 2. `tournaments.allow_play_down_one_level` (§2AO C, handover §18.7) - an organizer toggle that lets a
--    player enter ONE level below their community-vouched skill, "subject to the organizers' final
--    skills assessment". Default false, so every existing tournament (Hermosa included) behaves
--    exactly as it does today until an organizer ticks it.
--
-- 3. `player_skill_profiles.coach_vouch_count` (§2AO D2) - the "Coach-vouched" chip must render on a
--    directory page without a per-card query, so the count is denormalised here and backfilled from
--    the active coach-weighted vouches. The recompute path maintains it from now on.
--
-- 4. `player_fits_division()` v3 - the play-down-one rule, folded into 0030's body. Unchanged for every
--    tournament that has not ticked the new toggle.
--
-- 5. `player_cancel_registration()` v2 - `payment_already_started` now means "a TEAM payment exists, or
--    a slot belonging to ANOTHER member is attached" (§2AO A4). A player whose own seat is the only
--    money on the entry may self-cancel; the app detaches their slot afterwards and the money travels
--    with the person.
--
-- SAFE TO APPLY DURING THE OPEN REGISTRATION WINDOW: purely additive; the currently deployed code
-- never reads the new table or columns. The two re-created functions keep their exact signatures and
-- return types, and both only WIDEN what is accepted - no entry that is valid today becomes invalid.
--
-- Apply via the Supabase SQL editor (same method as 0001-0034, 0036, 0038-0041).
-- =============================================================================

-- =============================================================================
-- 1. tournament_slots (§2AO A1, handover §36.28A) - one player's paid seat in one tournament.
--    Writes are service-role only, through authored + audited server actions; players only ever read.
-- =============================================================================
create table if not exists tournament_slots (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  player_id uuid not null references profiles (id) on delete cascade,
  registration_id uuid references registrations (id) on delete set null,
  division_id uuid references divisions (id) on delete set null,
  status payment_status not null default 'submitted',
  amount_due numeric(10, 2) not null default 0,
  amount_submitted numeric(10, 2),
  currency char(3) not null default 'PHP',
  method text,
  payer_name text,
  transaction_reference text,
  proof_storage_path text,                 -- PRIVATE payment-proofs bucket path; never public
  early_bird_applied boolean not null default false,
  submitted_at timestamptz,
  verified_by uuid references profiles (id),
  verified_at timestamptz,
  rejection_reason text,
  notification_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_slots_status_check
    check (status in ('submitted', 'verified', 'rejected', 'refunded'))
);

create index if not exists idx_tournament_slots_registration on tournament_slots (registration_id);
create index if not exists idx_tournament_slots_player on tournament_slots (tournament_id, player_id);

-- One LIVE bare slot per (tournament, player): a player reserves a place once, not five times.
create unique index if not exists uq_tournament_slots_live_bare
  on tournament_slots (tournament_id, player_id)
  where registration_id is null and status in ('submitted', 'verified');

-- One LIVE attached slot per (registration, player): a seat on an entry is paid once.
-- Retired rows (rejected / refunded) are deliberately outside both predicates, so a declined receipt
-- never blocks the player from submitting a new one.
create unique index if not exists uq_tournament_slots_live_attached
  on tournament_slots (registration_id, player_id)
  where registration_id is not null and status in ('submitted', 'verified');

comment on table tournament_slots is
  'One player''s paid seat in one tournament (master_plan §2AO A1, handover §36.28A). Bare '
  '(registration_id null) = a paid reservation with no division chosen yet; attached '
  '(registration_id set) = that player''s seat on a team entry; retired = status rejected/refunded. '
  'Team `payments` rows are unchanged and still mean "one receipt for the whole team"; a '
  'registration''s money state is the COMBINATION of the two, decided by summarizeEntryPayment().';

comment on column tournament_slots.registration_id is
  'Null while the slot is a bare reservation. On delete set null - and the app detaches deliberately '
  'when a player leaves a team or self-cancels (§2AO A4): the money travels with the person.';
comment on column tournament_slots.division_id is
  'Informational only - the division chosen at purchase. A BARE slot holds NO division capacity; the '
  'division place is taken when the division is actually chosen (§2AO A5).';
comment on column tournament_slots.status is
  'payment_status, constrained to submitted | verified | rejected | refunded. Only submitted and '
  'verified are LIVE (see the two partial unique indexes).';
comment on column tournament_slots.amount_due is
  'The per-player quote at submission. Raised when a cheaper bare slot is attached to a pricier '
  'division, which makes the seat read `topup` until the difference is settled (§2AO A2).';
comment on column tournament_slots.amount_submitted is
  'What the player says they sent. A verified slot with amount_submitted < amount_due is a top-up, '
  'not a paid seat.';
comment on column tournament_slots.proof_storage_path is
  'PRIVATE `payment-proofs` bucket path (handover §38) - never public, never a direct URL. Reachable '
  'only through a server-issued signed URL after an authorization check.';
comment on column tournament_slots.early_bird_applied is
  'True when the early-bird price was used at submission, so a later price change never silently '
  'reprices a receipt the player already sent.';
comment on column tournament_slots.notification_sent_at is
  'Set when the organizer receipt notification for this slot has gone out; makes the backfill '
  'idempotent (§2AO A6).';

drop trigger if exists trg_tournament_slots_updated_at on tournament_slots;
create trigger trg_tournament_slots_updated_at before update on tournament_slots
  for each row execute function set_updated_at();

-- Row Level Security (§37). Readable by the seat's own player, the tournament's organizers and staff.
-- No insert/update/delete policies: every write goes through the service role in authored actions.
alter table tournament_slots enable row level security;

drop policy if exists tournament_slots_read on tournament_slots;
create policy tournament_slots_read on tournament_slots
  for select using (
    auth.uid() = player_id
    or public.is_tournament_organizer(auth.uid(), tournament_id)
    or public.is_staff(auth.uid())
  );

-- =============================================================================
-- 2. Play one level down (§2AO C, handover §18.7) - organizer toggle, default off.
-- =============================================================================
alter table public.tournaments
  add column if not exists allow_play_down_one_level boolean not null default false;

comment on column public.tournaments.allow_play_down_one_level is
  'Organizer toggle (master_plan §2AO C, handover §18.7): when the skill floor is enforced, a player '
  'whose skill is EXACTLY one level above a division''s maximum may still enter it, subject to the '
  'organizers'' final skills assessment. Default false, so no existing tournament changes behaviour. '
  'Read by player_fits_division() (SQL) and evaluateDivisionFit() (TS); the eligibility engine turns '
  'such an entry into a REVIEW with reason PLAYING_DOWN_ONE_LEVEL rather than a refusal.';

-- =============================================================================
-- 3. Coach vouch count (§2AO D2) - denormalised so a directory page never runs a per-card query.
-- =============================================================================
alter table public.player_skill_profiles
  add column if not exists coach_vouch_count int not null default 0;

comment on column public.player_skill_profiles.coach_vouch_count is
  'Number of ACTIVE vouches on this player that used the coach weight (master_plan §2AO D2). Drives '
  'the "Coach-vouched" chip on the profile header and both card layouts without a per-card query. '
  'Backfilled by this migration and maintained by the recompute path from now on. This is a count of '
  'coach vouches only - it is NOT a verification and never affects CSL, STS or vouch weight.';

-- Backfill. Players with no coach vouches keep the column default of 0, so only the rows that have
-- any are touched; re-running this is a no-op once the counts already match.
update player_skill_profiles sp
   set coach_vouch_count = c.n
  from (
    select v.target_id, count(*)::int as n
      from vouches v
     where v.status = 'active'
       and v.used_coach_weight = true
     group by v.target_id
  ) c
 where c.target_id = sp.player_id
   and sp.coach_vouch_count is distinct from c.n;

-- =============================================================================
-- 4. player_fits_division v3 (§2AO C) - 0030's body plus the play-down-one exception.
--    Sex classification is untouched and stays a hard rule regardless of any setting. Playing UP is
--    still always allowed. The ONLY change is that, when the organizer has ticked the toggle, a skill
--    of exactly `maximum_skill + 1` no longer refuses. Two levels down still refuses.
-- =============================================================================
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
  v_enforce boolean;
  v_allow_down boolean;
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

  -- Skill. Entering a division ABOVE your level is always allowed, so there is deliberately no
  -- minimum_skill check here. Only the ceiling is enforced, and only when the organizer asked for it.
  select coalesce(t.enforce_skill_floor, false),
         coalesce(t.allow_play_down_one_level, false)
    into v_enforce, v_allow_down
    from tournaments t where t.id = v_div.tournament_id;

  if coalesce(v_enforce, false)
     and v_div.skill_policy <> 'open'
     and v_skill is not null
     and v_div.maximum_skill is not null
     and v_skill > v_div.maximum_skill then
    -- §2AO C: exactly one level below the player's own level is allowed when the organizer has
    -- turned it on. The player is warned, and the entry lands in the organizer's review queue.
    if coalesce(v_allow_down, false) and v_skill = v_div.maximum_skill + 1 then
      null;
    else
      return false;
    end if;
  end if;

  return true;
end $$;

comment on function public.player_fits_division(uuid, uuid) is
  'True when a player may enter a division (migration 0042, master_plan §2AO C): sex classification '
  'always applies; playing above your level is always allowed; playing below it is refused only when '
  'the tournament has enforce_skill_floor on - and even then a skill of exactly maximum_skill + 1 is '
  'accepted when the tournament has allow_play_down_one_level on, subject to the organizers'' final '
  'skills assessment.';

revoke all on function public.player_fits_division(uuid, uuid) from public, anon, authenticated;
grant execute on function public.player_fits_division(uuid, uuid) to service_role;

-- =============================================================================
-- 5. player_cancel_registration v2 (§2AO A4) - 0021's body with one changed guard.
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
  -- §2AO A4: money that is NOT the actor's own still blocks a self-cancel. A team payment is one
  -- receipt for the whole entry, and another member's attached seat is that member's money - neither
  -- may be walked away from unilaterally. But a player whose OWN seat is the only money on the entry
  -- may self-cancel: the app detaches their slot afterwards, it becomes bare again and is reusable
  -- through the wizard. That restores "I picked the wrong division" without reviving the §2X bypass -
  -- re-entering runs the full fit / eligibility path again.
  if exists (select 1 from payments where registration_id = v_registration.id)
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
  'Player self-cancellation (migration 0042, master_plan §2AO A4): unchanged from 0021 except that '
  'payment_already_started now means a TEAM payment exists, or a live tournament_slot belonging to '
  'ANOTHER member is attached to this registration. A player whose own seat is the only money on the '
  'entry may self-cancel; the app detaches their slot afterwards and the money travels with them.';

revoke all on function public.player_cancel_registration(uuid, uuid) from public, anon, authenticated;
grant execute on function public.player_cancel_registration(uuid, uuid) to service_role;

-- =============================================================================
-- 6. Settings seeds (§2AO A, E). `on conflict do nothing`, so an Admin's prior edit is never
--    overwritten by a re-run or a redeploy.
-- =============================================================================
insert into system_settings (key, value, description) values
  ('profile_show_vouch_meter', 'true'::jsonb, 'Off hides the per-level vouch meter (skill distribution) on profiles from everyone except staff, the profile owner included (§2AO E)'),
  ('profile_show_community_skill', 'true'::jsonb, 'Off hides the community-vouched skill chip from other players on profiles and cards; they see the self-rated chip instead. The owner and staff still see it (§2AO E)'),
  ('tournament_slot_reservations_enabled', 'true'::jsonb, 'Tournament slots: pay per seat / reserve before choosing a division. Seeded on by 0042; the code default is off so the feature is inert until this migration is applied (§2AO A)')
on conflict (key) do nothing;
