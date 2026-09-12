-- =============================================================================
-- VouchPlay v2 - Migration 0043: age at the door, organizer rows no longer publicly readable
-- master_plan §2AP (Decisions B and H). Handover §18.5 (age rules), §37 (RLS).
--
-- 1. `player_fits_division()` v4 - AGE joins sex and skill at the door. Until now age caps ("45 and
--    Up") were checked only by the eligibility engine, AFTER entry, as an advisory flag for the
--    organizer; a 30-year-old could enter a 45+ division and the organizer found out later. The
--    rule Jasper set is "in no way can they select an ineligible division (gender, skill cap, age
--    cap)", so the SQL gate now mirrors the new TS check: a player outside a division's age range
--    at the tournament START date is refused, and an unknown birthday on an age-limited division is
--    refused too (the app's message says "add your birthday to your profile" - a door, not a wall,
--    exactly like an unknown sex on a men's / women's division). Divisions with no age range are
--    untouched. Existing entries are untouched; the check runs at entry and at partner acceptance.
--
-- 2. `tournament_organizers` read policy - the 0007 policy made every ACTIVE row readable to anyone
--    with the anon key ("shown on the page"), but the page only ever shows the owner; co-organizer
--    names were never rendered publicly. The rows are now readable by the organizer themselves, the
--    tournament's organizers (owner included, via is_tournament_organizer) and staff. Every app read
--    goes through the service client or an organizer's own session, so nothing visible changes.
--
-- SAFE TO APPLY DURING THE OPEN REGISTRATION WINDOW: one function widened only for age-limited
-- divisions (Hermosa has two, both "45 and Up", both open-skill), one read policy narrowed for a
-- table the public UI never renders. Same signature and return type, so `create or replace` is safe.
--
-- Apply via the Supabase SQL editor (same method as 0001-0034, 0036, 0038-0042).
-- =============================================================================

-- ---------- 1. player_fits_division v4 (§2AP B): sex, then AGE, then skill ----------
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
  v_dob date;
  v_skill smallint;
  v_enforce boolean;
  v_allow_down boolean;
  v_start timestamptz;
  v_age int;
begin
  select * into v_div from divisions where id = p_division_id;
  if not found then return false; end if;

  select p.sex,
         p.date_of_birth,
         coalesce(sp.community_skill_level, p.self_rated_skill)
    into v_sex, v_dob, v_skill
    from profiles p
    left join player_skill_profiles sp on sp.player_id = p.id
   where p.id = p_player;
  if not found then return false; end if;

  -- Sex classification (§25, WRONG_SEX). 'mixed' and 'genderless' accept anyone.
  if v_div.sex_classification = 'men' and coalesce(v_sex, '') <> 'male' then return false; end if;
  if v_div.sex_classification = 'women' and coalesce(v_sex, '') <> 'female' then return false; end if;

  -- Age at the tournament START date (§18.5, §2AP B). Only age-limited divisions check anything.
  -- An unknown birthday on such a division is refused - the app tells the player what to add.
  if v_div.minimum_age is not null or v_div.maximum_age is not null then
    if v_dob is null then return false; end if;
    select t.start_at into v_start from tournaments t where t.id = v_div.tournament_id;
    v_age := extract(year from age(coalesce(v_start, now()), v_dob::timestamptz))::int;
    if v_div.minimum_age is not null and v_age < v_div.minimum_age then return false; end if;
    if v_div.maximum_age is not null and v_age > v_div.maximum_age then return false; end if;
  end if;

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
  'True when a player may enter a division (migration 0043, master_plan §2AP B): sex classification '
  'always applies; an age-limited division refuses a player outside its range at the tournament '
  'start date and refuses an unknown birthday; playing above your level is always allowed; playing '
  'below it is refused only when the tournament has enforce_skill_floor on - and even then a skill of '
  'exactly maximum_skill + 1 is accepted when allow_play_down_one_level is on.';

revoke all on function public.player_fits_division(uuid, uuid) from public, anon, authenticated;
grant execute on function public.player_fits_division(uuid, uuid) to service_role;

-- ---------- 2. tournament_organizers: no longer publicly readable (§2AP H) ----------
drop policy if exists tournament_organizers_read on tournament_organizers;
create policy tournament_organizers_read on tournament_organizers
  for select using (
    auth.uid() = user_id
    or public.is_tournament_organizer(auth.uid(), tournament_id)
    or public.is_staff(auth.uid())
  );
