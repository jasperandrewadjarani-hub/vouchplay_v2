-- =============================================================================
-- VouchPlay v2 - Migration 0022: organizer global division rules
-- Three tournament-wide toggles replace two per-division flags and add a new skill floor.
--  * enforce_skill_floor (default TRUE): a player cannot register in a division whose skill ceiling
--    is below their own skill. Playing at their level or higher is always allowed. Enforced in the
--    registration action, never inside the version-locked ELIG_V1 engine.
--  * require_skill_verified (default FALSE): only Skill Verified players are eligible, applied to
--    every division (fed into ELIG_V1 as the skill-verified rule).
--  * require_organizer_approval (default FALSE): no entry is auto-eligible; the organizer must review.
-- Existing per-division skill_verified_required / organizer_approval_required intent is rolled up so
-- no tournament silently loses a rule. The per-division columns are retained but no longer edited.
-- =============================================================================

alter table tournaments
  add column if not exists enforce_skill_floor boolean not null default true,
  add column if not exists require_skill_verified boolean not null default false,
  add column if not exists require_organizer_approval boolean not null default false;

-- Preserve prior per-division intent at the new global level.
update tournaments t set require_skill_verified = true
  where require_skill_verified = false
    and exists (
      select 1 from divisions d
      where d.tournament_id = t.id and d.skill_verified_required = true
    );

update tournaments t set require_organizer_approval = true
  where require_organizer_approval = false
    and exists (
      select 1 from divisions d
      where d.tournament_id = t.id and d.organizer_approval_required = true
    );

select 'tournament_rule_columns' as check, count(*) as n
from information_schema.columns
where table_schema = 'public' and table_name = 'tournaments'
  and column_name in ('enforce_skill_floor', 'require_skill_verified', 'require_organizer_approval');
-- Expect tournament_rule_columns=3.
