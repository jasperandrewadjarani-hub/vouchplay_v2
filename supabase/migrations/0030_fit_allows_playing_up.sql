-- =============================================================================
-- VouchPlay v2 - Migration 0030: a player may always enter a division ABOVE their level
-- master_plan §2F. Handover §22, §25.
--
-- `player_fits_division()` (0027) refused a player on either side of a division's band. That is not
-- the rule. The organizer's own setting says it in words - "Only allow players at each division's
-- level or higher: players cannot join a division BELOW their skill level" - so:
--
--   * Playing UP is always allowed. A Low Intermediate entering a High Intermediate division is
--     choosing a harder game, and no rule should stand in the way of that.
--   * Playing DOWN is refused, and only when the tournament has `enforce_skill_floor` on.
--
-- Sex classification is unchanged and stays a hard rule regardless of any setting.
--
-- Nothing else about the function's signature or behaviour changes, so `change_partner` and every
-- other caller keeps working. This only widens what is accepted, so it cannot invalidate an entry
-- that already exists.
--
-- Apply via the Supabase SQL editor (same method as 0001-0029).
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
  select coalesce(t.enforce_skill_floor, false) into v_enforce
    from tournaments t where t.id = v_div.tournament_id;

  if coalesce(v_enforce, false)
     and v_div.skill_policy <> 'open'
     and v_skill is not null
     and v_div.maximum_skill is not null
     and v_skill > v_div.maximum_skill then
    return false;
  end if;

  return true;
end $$;

comment on function public.player_fits_division(uuid, uuid) is
  'True when a player may enter a division (migration 0030): sex classification always applies; '
  'playing above your level is always allowed; playing below it is refused only when the '
  'tournament has enforce_skill_floor on.';

revoke all on function public.player_fits_division(uuid, uuid) from public, anon, authenticated;
grant execute on function public.player_fits_division(uuid, uuid) to service_role;
