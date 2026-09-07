-- Phase 13A + 13D: privacy-safe Community Contribution aggregates and versioned Home leaderboard
-- snapshots. Most Bidded is intentionally absent until §16A. Safe to re-run.

insert into system_settings (key, value, description) values
  ('contribution_enabled','true'::jsonb,'Feature flag for Community Contribution (CONTRIB_V1)'),
  ('contribution_active_version','"CONTRIB_V1"'::jsonb,'Rollbackable active contribution version'),
  ('contribution_base_distinct_points','10'::jsonb,'Base credit per distinct player helped'),
  ('contribution_newcomer_voucher_threshold','1'::jsonb,'Prior distinct-voucher ceiling for newcomer support'),
  ('contribution_newcomer_bonus','5'::jsonb,'Additional newcomer-support credit'),
  ('contribution_reciprocal_multiplier','0.25'::jsonb,'Dampening for reciprocal pairs'),
  ('contribution_ring_multiplier','0'::jsonb,'Credit multiplier for unresolved high-risk rings'),
  ('contribution_daily_full_credit_limit','5'::jsonb,'Full-credit distinct vouches per UTC day'),
  ('contribution_daily_reduced_credit_limit','10'::jsonb,'Reduced-credit ceiling per UTC day'),
  ('contribution_daily_reduced_multiplier','0.5'::jsonb,'Reduced daily credit multiplier'),
  ('contribution_daily_floor_multiplier','0.1'::jsonb,'High-volume daily floor multiplier'),
  ('contribution_decay_half_life_days','180'::jsonb,'Contribution decay half-life in days'),
  ('contribution_level_base_points','50'::jsonb,'Contribution level curve base'),
  ('contribution_newcomer_badge_count','5'::jsonb,'Newcomer Champion qualifying count'),
  ('contribution_streak_badge_weeks','4'::jsonb,'Consistent Voucher qualifying streak'),
  ('contribution_pillar_score','500'::jsonb,'Community Pillar qualifying score'),
  ('contribution_builder_max_fact_rows','5000'::jsonb,'Hard fact-row bound per contribution build'),
  ('leaderboards_enabled','true'::jsonb,'Feature flag for Home leaderboards (§6.1)'),
  ('leaderboard_most_bidded_enabled','false'::jsonb,'Must stay false until §16A is live'),
  ('leaderboard_active_version','"LEADER_V1"'::jsonb,'Rollbackable active leaderboard scoring version'),
  ('leaderboard_publish_cadence_hours','24'::jsonb,'Normal snapshot publication cadence; minimum supported production interval is 24 hours'),
  ('leaderboard_home_limit','10'::jsonb,'Rows shown on Home'),
  ('leaderboard_full_limit','100'::jsonb,'Maximum rows shown on full leaderboard'),
  ('leaderboard_builder_max_subjects','5000'::jsonb,'Hard subject bound per snapshot build'),
  ('leaderboard_builder_max_scopes','20'::jsonb,'Hard combined city/region scope bound per build'),
  ('leaderboard_component_cap','100'::jsonb,'Maximum value contributed by one leaderboard component'),
  ('leaderboard_club_movement_notify_places','3'::jsonb,'Minimum upward places for a club movement milestone'),
  ('leaderboard_min_age','18'::jsonb,'Minimum age for public player rankings'),
  ('leaderboard_exclude_unknown_dob','true'::jsonb,'Exclude unknown date of birth publicly'),
  ('leaderboard_month_days','30'::jsonb,'This-month rolling lookback'),
  ('leaderboard_season_start','"01-01"'::jsonb,'Configurable calendar-season start MM-DD'),
  ('leaderboard_city_region_map','"{}"'::jsonb,'Admin-managed JSON city-to-region mapping'),
  ('leaderboard_players_paused','false'::jsonb,'Pause Players publication'),
  ('leaderboard_community_paused','false'::jsonb,'Pause Community publication'),
  ('leaderboard_clubs_paused','false'::jsonb,'Pause Clubs publication'),
  ('leaderboard_milestone_notifications_enabled','true'::jsonb,'Enable deduplicated leaderboard milestones'),
  ('leaderboard_player_min_score','1'::jsonb,'Minimum Players score'),
  ('leaderboard_player_participation_weight','4'::jsonb,'Players verified-participation weight'),
  ('leaderboard_player_placement_weight','6'::jsonb,'Players official-placement weight'),
  ('leaderboard_player_profile_weight','1'::jsonb,'Players capped profile-completeness weight'),
  ('leaderboard_player_skill_verified_weight','1'::jsonb,'Players capped Skill-Verified supporting weight'),
  ('leaderboard_community_min_score','1'::jsonb,'Minimum Community score'),
  ('leaderboard_community_contribution_weight','1'::jsonb,'Community Contribution weight'),
  ('leaderboard_club_min_score','1'::jsonb,'Minimum Clubs score'),
  ('leaderboard_club_participation_weight','4'::jsonb,'Clubs verified participation weight'),
  ('leaderboard_club_active_members_weight','2'::jsonb,'Clubs normalized active-member weight'),
  ('leaderboard_club_attendance_weight','4'::jsonb,'Clubs represented attendance weight'),
  ('leaderboard_club_placement_weight','6'::jsonb,'Clubs official-placement weight'),
  ('leaderboard_club_contribution_weight','1'::jsonb,'Clubs community-contribution weight')
on conflict (key) do nothing;

create table if not exists player_contributions (
  player_id uuid primary key references profiles (id) on delete cascade,
  algorithm_version text not null,
  score numeric(14,2) not null default 0 check (score >= 0),
  level integer not null default 1 check (level >= 1),
  distinct_players_helped integer not null default 0 check (distinct_players_helped >= 0),
  newcomer_players_helped integer not null default 0 check (newcomer_players_helped >= 0),
  current_streak_weeks integer not null default 0 check (current_streak_weeks >= 0),
  badges jsonb not null default '[]'::jsonb,
  explanation_facts jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now()
);
create index if not exists idx_player_contributions_rank
  on player_contributions (algorithm_version, score desc, player_id);

create table if not exists leaderboard_snapshot_runs (
  id uuid primary key default gen_random_uuid(),
  scoring_version text not null,
  category text not null check (category in ('players','community','clubs')),
  scope_type text not null check (scope_type in ('city','region','global')),
  scope_value text,
  period text not null check (period in ('month','season','all_time')),
  status text not null default 'building' check (status in ('building','published','failed','rolled_back')),
  active boolean not null default false,
  settings_fingerprint text not null,
  source_cutoff timestamptz not null,
  published_at timestamptz,
  stale_after timestamptz,
  row_count integer not null default 0,
  error_code text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  check ((scope_type = 'global' and scope_value is null) or (scope_type <> 'global' and scope_value is not null))
);
create unique index if not exists uq_leaderboard_active_snapshot
  on leaderboard_snapshot_runs (category, scope_type, coalesce(scope_value,''), period)
  where active;
create index if not exists idx_leaderboard_runs_lookup
  on leaderboard_snapshot_runs (category, scope_type, scope_value, period, active, published_at desc);

create table if not exists leaderboard_snapshot_entries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references leaderboard_snapshot_runs (id) on delete cascade,
  subject_type text not null check (subject_type in ('player','club')),
  subject_id uuid not null,
  rank integer not null check (rank > 0),
  score numeric(16,4) not null check (score >= 0),
  components jsonb not null default '{}'::jsonb,
  explanation text not null,
  display_name text not null,
  slug text not null,
  image_path text,
  city text,
  region text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  unique (run_id, subject_id),
  unique (run_id, rank)
);
create index if not exists idx_leaderboard_entries_run_rank
  on leaderboard_snapshot_entries (run_id, rank);
create index if not exists idx_leaderboard_entries_subject
  on leaderboard_snapshot_entries (subject_type, subject_id, created_at desc);

create table if not exists player_leaderboard_momentum (
  player_id uuid not null references profiles (id) on delete cascade,
  category text not null check (category in ('players','community')),
  scope_type text not null check (scope_type in ('city','region','global')),
  scope_value text not null default '',
  period text not null check (period in ('month','season','all_time')),
  scoring_version text not null,
  run_id uuid references leaderboard_snapshot_runs (id) on delete set null,
  eligible_public boolean not null default false,
  exclusion_code text,
  private_rank integer,
  previous_rank integer,
  score numeric(16,4) not null default 0,
  components jsonb not null default '{}'::jsonb,
  cta_key text,
  updated_at timestamptz not null default now(),
  primary key (player_id, category, scope_type, scope_value, period)
);
create index if not exists idx_player_momentum_updated on player_leaderboard_momentum (player_id, updated_at desc);

create table if not exists leaderboard_exclusions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('player','club')),
  entity_id uuid not null,
  category text check (category in ('players','community','clubs')),
  active boolean not null default true,
  reason text not null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  revoked_by uuid references profiles (id),
  revoked_at timestamptz
);
create unique index if not exists uq_leaderboard_exclusion_active
  on leaderboard_exclusions (entity_type, entity_id, coalesce(category,'')) where active;

create table if not exists leaderboard_rebuild_requests (
  id uuid primary key default gen_random_uuid(),
  category text check (category is null or category in ('players','community','clubs')),
  scope_type text check (scope_type is null or scope_type in ('city','region','global')),
  scope_value text,
  period text check (period is null or period in ('month','season','all_time')),
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  requested_by uuid references profiles (id),
  reason text not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text
);
create index if not exists idx_leaderboard_rebuild_pending
  on leaderboard_rebuild_requests (requested_at) where status = 'pending';

create table if not exists leaderboard_milestones (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles (id) on delete cascade,
  category text not null check (category in ('players','community','clubs')),
  scope_type text not null,
  scope_value text not null default '',
  period text not null,
  milestone text not null check (milestone in ('top_10','podium','club_movement')),
  first_achieved_at timestamptz not null default now(),
  last_notified_at timestamptz,
  unique (recipient_id, category, scope_type, scope_value, period, milestone)
);

alter table player_contributions enable row level security;
alter table leaderboard_snapshot_runs enable row level security;
alter table leaderboard_snapshot_entries enable row level security;
alter table player_leaderboard_momentum enable row level security;
alter table leaderboard_exclusions enable row level security;
alter table leaderboard_rebuild_requests enable row level security;
alter table leaderboard_milestones enable row level security;

drop policy if exists contribution_safe_read on player_contributions;
create policy contribution_safe_read on player_contributions for select using (
  auth.uid() = player_id or exists (
    select 1 from profiles p where p.id = player_id and p.deleted_at is null
      and p.account_status = 'active'
      and coalesce(p.profile_visibility->>'directory','public') <> 'hidden'
  )
);

drop policy if exists leaderboard_runs_public_active on leaderboard_snapshot_runs;
create policy leaderboard_runs_public_active on leaderboard_snapshot_runs for select using (
  (active and status = 'published') or
  (public.is_admin(auth.uid()) and coalesce(auth.jwt()->>'aal','aal1') = 'aal2')
);

drop policy if exists leaderboard_entries_public_active on leaderboard_snapshot_entries;
create policy leaderboard_entries_public_active on leaderboard_snapshot_entries for select using (
  is_public and exists (
    select 1 from leaderboard_snapshot_runs r
    where r.id = run_id and r.active and r.status = 'published'
  )
  or (public.is_admin(auth.uid()) and coalesce(auth.jwt()->>'aal','aal1') = 'aal2')
);

drop policy if exists momentum_read_own on player_leaderboard_momentum;
create policy momentum_read_own on player_leaderboard_momentum for select using (auth.uid() = player_id);

drop policy if exists leaderboard_exclusions_aal2_admin on leaderboard_exclusions;
create policy leaderboard_exclusions_aal2_admin on leaderboard_exclusions for select using (
  public.is_admin(auth.uid()) and coalesce(auth.jwt()->>'aal','aal1') = 'aal2'
);

drop policy if exists leaderboard_rebuild_aal2_admin on leaderboard_rebuild_requests;
create policy leaderboard_rebuild_aal2_admin on leaderboard_rebuild_requests for select using (
  public.is_admin(auth.uid()) and coalesce(auth.jwt()->>'aal','aal1') = 'aal2'
);

create or replace function public.set_leaderboard_exclusion(
  p_entity_type text,
  p_entity_id uuid,
  p_category text,
  p_excluded boolean,
  p_reason text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null or not public.is_admin(v_actor) or coalesce(auth.jwt()->>'aal','aal1') <> 'aal2'
  then raise exception 'aal2_admin_required'; end if;
  if p_entity_type not in ('player','club') or (p_category is not null and p_category not in ('players','community','clubs'))
  then raise exception 'invalid_exclusion_scope'; end if;
  if (p_entity_type = 'player' and p_category = 'clubs')
     or (p_entity_type = 'club' and p_category in ('players','community'))
  then raise exception 'invalid_exclusion_scope'; end if;
  if (p_entity_type = 'player' and not exists (select 1 from profiles where id = p_entity_id))
     or (p_entity_type = 'club' and not exists (select 1 from clubs where id = p_entity_id))
  then raise exception 'entity_not_found'; end if;
  if length(trim(coalesce(p_reason,''))) < 10 then raise exception 'useful_reason_required'; end if;
  if p_excluded then
    insert into leaderboard_exclusions (entity_type,entity_id,category,reason,created_by)
    values (p_entity_type,p_entity_id,p_category,trim(p_reason),v_actor)
    on conflict (entity_type,entity_id,(coalesce(category,''))) where active
    do update set reason = excluded.reason, created_by = excluded.created_by, created_at = now()
    returning id into v_id;
  else
    update leaderboard_exclusions set active = false, revoked_by = v_actor, revoked_at = now()
    where entity_type = p_entity_type and entity_id = p_entity_id
      and coalesce(category,'') = coalesce(p_category,'') and active
    returning id into v_id;
    if v_id is null then raise exception 'active_exclusion_not_found'; end if;
  end if;
  insert into audit_logs (actor_id,actor_role,action,entity_type,entity_id,after_snapshot,reason)
  values (v_actor,'admin',case when p_excluded then 'leaderboard.exclude' else 'leaderboard.include' end,
    p_entity_type,p_entity_id,jsonb_build_object('category',p_category,'excluded',p_excluded),trim(p_reason));
  return v_id;
end;
$$;

create or replace function public.request_leaderboard_rebuild(
  p_category text default null,
  p_scope_type text default null,
  p_scope_value text default null,
  p_period text default null,
  p_reason text default 'Admin requested rebuild'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_actor uuid := auth.uid(); v_id uuid;
begin
  if v_actor is null or not public.is_admin(v_actor) or coalesce(auth.jwt()->>'aal','aal1') <> 'aal2'
  then raise exception 'aal2_admin_required'; end if;
  if p_category is not null and p_category not in ('players','community','clubs') then raise exception 'invalid_category'; end if;
  if p_scope_type is not null and p_scope_type not in ('city','region','global') then raise exception 'invalid_scope'; end if;
  if p_period is not null and p_period not in ('month','season','all_time') then raise exception 'invalid_period'; end if;
  if p_scope_type is null and p_scope_value is not null then raise exception 'invalid_scope_value'; end if;
  if p_scope_type = 'global' and p_scope_value is not null then raise exception 'invalid_scope_value'; end if;
  if p_scope_type in ('city','region') and nullif(trim(coalesce(p_scope_value,'')),'') is null then raise exception 'invalid_scope_value'; end if;
  insert into leaderboard_rebuild_requests (category,scope_type,scope_value,period,requested_by,reason)
  values (p_category,p_scope_type,p_scope_value,p_period,v_actor,trim(p_reason)) returning id into v_id;
  insert into audit_logs (actor_id,actor_role,action,entity_type,entity_id,after_snapshot,reason)
  values (v_actor,'admin','leaderboard.rebuild.request','leaderboard_rebuild',v_id,
    jsonb_build_object('category',p_category,'scope_type',p_scope_type,'scope_value',p_scope_value,'period',p_period),trim(p_reason));
  return v_id;
end;
$$;

create or replace function public.activate_leaderboard_snapshot(p_run_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_actor uuid := auth.uid(); v_run leaderboard_snapshot_runs%rowtype;
begin
  if v_actor is null or not public.is_admin(v_actor) or coalesce(auth.jwt()->>'aal','aal1') <> 'aal2'
  then raise exception 'aal2_admin_required'; end if;
  if length(trim(coalesce(p_reason,''))) < 10 then raise exception 'useful_reason_required'; end if;
  select * into v_run from leaderboard_snapshot_runs where id = p_run_id for update;
  if not found or v_run.status not in ('published','rolled_back') then raise exception 'snapshot_not_activatable'; end if;
  update leaderboard_snapshot_runs set active = false
    where category = v_run.category and scope_type = v_run.scope_type
      and coalesce(scope_value,'') = coalesce(v_run.scope_value,'') and period = v_run.period and active;
  update leaderboard_snapshot_runs set active = true, status = 'published' where id = p_run_id;
  insert into audit_logs (actor_id,actor_role,action,entity_type,entity_id,after_snapshot,reason)
  values (v_actor,'admin','leaderboard.snapshot.activate','leaderboard_snapshot',p_run_id,
    jsonb_build_object('category',v_run.category,'scope_type',v_run.scope_type,'scope_value',v_run.scope_value,'period',v_run.period),trim(p_reason));
  return p_run_id;
end;
$$;

-- Service-only atomic publisher. Raw source facts never enter snapshots: the bounded server builder
-- supplies only the public DTO facts and each player's private momentum aggregate.
create or replace function public.publish_leaderboard_snapshot(
  p_scoring_version text,
  p_category text,
  p_scope_type text,
  p_scope_value text,
  p_period text,
  p_settings_fingerprint text,
  p_source_cutoff timestamptz,
  p_stale_after timestamptz,
  p_entries jsonb,
  p_momentum jsonb default '[]'::jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_run_id uuid := gen_random_uuid();
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_category not in ('players','community','clubs') then raise exception 'invalid_category'; end if;
  if p_scope_type not in ('city','region','global') then raise exception 'invalid_scope'; end if;
  if p_period not in ('month','season','all_time') then raise exception 'invalid_period'; end if;
  if (p_scope_type = 'global' and p_scope_value is not null)
    or (p_scope_type <> 'global' and nullif(trim(coalesce(p_scope_value,'')),'') is null)
  then raise exception 'invalid_scope_value'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 5000
    or jsonb_typeof(p_momentum) <> 'array' or jsonb_array_length(p_momentum) > 10000
  then raise exception 'snapshot_payload_out_of_bounds'; end if;

  insert into leaderboard_snapshot_runs (
    id,scoring_version,category,scope_type,scope_value,period,status,active,
    settings_fingerprint,source_cutoff,stale_after,row_count
  ) values (
    v_run_id,p_scoring_version,p_category,p_scope_type,p_scope_value,p_period,'building',false,
    p_settings_fingerprint,p_source_cutoff,p_stale_after,jsonb_array_length(p_entries)
  );

  insert into leaderboard_snapshot_entries (
    run_id,subject_type,subject_id,rank,score,components,explanation,
    display_name,slug,image_path,city,region,is_public
  )
  select v_run_id,x.subject_type,x.subject_id,x.rank,x.score,x.components,x.explanation,
    x.display_name,x.slug,x.image_path,x.city,x.region,true
  from jsonb_to_recordset(p_entries) as x(
    subject_type text,subject_id uuid,rank integer,score numeric,components jsonb,
    explanation text,display_name text,slug text,image_path text,city text,region text
  );

  insert into player_leaderboard_momentum (
    player_id,category,scope_type,scope_value,period,scoring_version,run_id,
    eligible_public,exclusion_code,private_rank,score,components,cta_key,updated_at
  )
  select x.player_id,p_category,p_scope_type,coalesce(p_scope_value,''),p_period,
    p_scoring_version,v_run_id,x.eligible_public,x.exclusion_code,x.private_rank,
    x.score,x.components,x.cta_key,now()
  from jsonb_to_recordset(p_momentum) as x(
    player_id uuid,eligible_public boolean,exclusion_code text,private_rank integer,
    score numeric,components jsonb,cta_key text
  )
  on conflict (player_id,category,scope_type,scope_value,period) do update set
    scoring_version = excluded.scoring_version,
    run_id = excluded.run_id,
    eligible_public = excluded.eligible_public,
    exclusion_code = excluded.exclusion_code,
    previous_rank = player_leaderboard_momentum.private_rank,
    private_rank = excluded.private_rank,
    score = excluded.score,
    components = excluded.components,
    cta_key = excluded.cta_key,
    updated_at = excluded.updated_at;

  update leaderboard_snapshot_runs set active = false
    where category = p_category and scope_type = p_scope_type
      and coalesce(scope_value,'') = coalesce(p_scope_value,'') and period = p_period and active;
  update leaderboard_snapshot_runs
    set status = 'published', active = true, published_at = now()
    where id = v_run_id;
  insert into audit_logs (actor_id,actor_role,action,entity_type,entity_id,after_snapshot)
  values (null,'system','leaderboard.snapshot.publish','leaderboard_snapshot',v_run_id,
    jsonb_build_object('category',p_category,'scope_type',p_scope_type,
      'scope_value',p_scope_value,'period',p_period,'row_count',jsonb_array_length(p_entries),
      'scoring_version',p_scoring_version));
  return v_run_id;
end;
$$;

revoke all on function public.set_leaderboard_exclusion(text,uuid,text,boolean,text) from public;
revoke all on function public.request_leaderboard_rebuild(text,text,text,text,text) from public;
revoke all on function public.activate_leaderboard_snapshot(uuid,text) from public;
revoke all on function public.publish_leaderboard_snapshot(text,text,text,text,text,text,timestamptz,timestamptz,jsonb,jsonb) from public;
grant execute on function public.set_leaderboard_exclusion(text,uuid,text,boolean,text) to authenticated;
grant execute on function public.request_leaderboard_rebuild(text,text,text,text,text) to authenticated;
grant execute on function public.activate_leaderboard_snapshot(uuid,text) to authenticated;
grant execute on function public.publish_leaderboard_snapshot(text,text,text,text,text,text,timestamptz,timestamptz,jsonb,jsonb) to service_role;

select 'leaderboard_tables' as check, count(*) as n from information_schema.tables
  where table_schema='public' and table_name in (
    'player_contributions','leaderboard_snapshot_runs','leaderboard_snapshot_entries',
    'player_leaderboard_momentum','leaderboard_exclusions','leaderboard_rebuild_requests','leaderboard_milestones'
  )
union all
select 'leaderboard_rpcs', count(*) from information_schema.routines where routine_schema='public'
  and routine_name in ('set_leaderboard_exclusion','request_leaderboard_rebuild','activate_leaderboard_snapshot','publish_leaderboard_snapshot')
union all
select 'contribution_settings', count(*) from system_settings where key like 'contribution_%'
union all
select 'leaderboard_settings', count(*) from system_settings where key like 'leaderboard%'
union all
select 'leaderboard_rls_policies', count(*) from pg_policies where schemaname='public'
  and tablename in ('player_contributions','leaderboard_snapshot_runs','leaderboard_snapshot_entries','player_leaderboard_momentum','leaderboard_exclusions','leaderboard_rebuild_requests','leaderboard_milestones');
-- Expect: leaderboard_tables=7, leaderboard_rpcs=4, contribution_settings=17,
-- leaderboard_settings=32, leaderboard_rls_policies=6 (milestones intentionally service-only).
