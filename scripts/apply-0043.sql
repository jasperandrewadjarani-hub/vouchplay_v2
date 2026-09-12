-- =============================================================================
-- VouchPlay v2 - apply 0043: age at the door, organizer rows no longer publicly readable
-- Paste-and-run copy of supabase/migrations/0043_age_at_door_and_organizer_rls.sql, with a
-- verification SELECT appended. Statements are byte-identical to the migration.
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

-- ---------- Verification ----------
select proname, prosecdef
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname = 'player_fits_division';

select policyname, qual
  from pg_policies
 where schemaname = 'public'
   and tablename = 'tournament_organizers';
