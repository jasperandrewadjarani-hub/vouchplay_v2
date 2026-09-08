-- =============================================================================
-- VouchPlay v2 — Migration 0018: Optional DOB for public leaderboards
-- Handover §6.1. An unknown DOB is not a public-ranking exclusion; supplied minors remain excluded.
-- =============================================================================

update system_settings
set
  value = 'false'::jsonb,
  description = 'Exclude unknown DOB from public leaderboards (false keeps DOB optional)',
  updated_at = now()
where key = 'leaderboard_exclude_unknown_dob';

-- Verify after SQL Editor application.
select 'unknown_dob_optional' as check,
       count(*) as n
from system_settings
where key = 'leaderboard_exclude_unknown_dob' and value = 'false'::jsonb
union all
select 'leaderboard_setting_row', count(*)
from system_settings
where key = 'leaderboard_exclude_unknown_dob';
