-- Phase 13C: Coach application, private evidence metadata, applicant-visible history, and
-- transactional AAL2 decisions/revocation. Safe to re-run and preserves Organizer applications.

alter type application_status add value if not exists 'information_requested' after 'reviewing';

insert into system_settings (key, value, description) values
  ('coach_vouch_weight_enabled', 'true'::jsonb, 'Safety kill switch; the per-vouch Coach control is explicitly off by default (§4.4)'),
  ('coach_applications_enabled', 'true'::jsonb, 'Feature flag for Coach applications (§4.4)'),
  ('coach_application_review_sla_days', '7'::jsonb, 'Target Coach application review SLA in days (§4.4)'),
  ('coach_evidence_max_files', '5'::jsonb, 'Maximum private evidence files per Coach application (§4.4)'),
  ('coach_evidence_max_bytes', '5242880'::jsonb, 'Maximum bytes per Coach evidence file (§4.4)'),
  ('coach_evidence_allowed_mime_types', '"image/jpeg,image/png,image/webp,application/pdf"'::jsonb, 'Comma-separated allowed Coach evidence MIME types (§4.4)'),
  ('coach_evidence_signed_url_seconds', '60'::jsonb, 'Lifetime of an AAL2 staff Coach evidence URL (§4.4)'),
  ('coach_evidence_retention_days_after_decision', '90'::jsonb, 'Coach evidence retention after decision/withdrawal (§4.4)'),
  ('coach_application_reference_min_count', '1'::jsonb, 'Minimum public reference links for Coach applications (§4.4)'),
  ('coach_application_reason_min_chars', '10'::jsonb, 'Minimum useful request/reject/revoke reason length (§4.4)')
on conflict (key) do nothing;

alter table role_applications
  add column if not exists submitted_at timestamptz,
  add column if not exists review_started_at timestamptz,
  add column if not exists information_requested_at timestamptz,
  add column if not exists responded_at timestamptz,
  add column if not exists decided_at timestamptz,
  add column if not exists withdrawn_at timestamptz,
  add column if not exists retention_delete_after timestamptz;

update role_applications set submitted_at = created_at where submitted_at is null;
alter table role_applications alter column submitted_at set default now();
alter table role_applications alter column submitted_at set not null;

-- The existing pending/reviewing unique index remains. The transactional submit RPC additionally
-- locks the applicant profile and checks information_requested, covering the full open lifecycle
-- without an unsafe same-transaction enum value in an index predicate.
create index if not exists idx_role_applications_coach_queue
  on role_applications (status, created_at)
  where role_requested = 'coach';

create table if not exists role_application_evidence (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references role_applications (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_at timestamptz not null default now(),
  delete_after timestamptz,
  deleted_at timestamptz
);
create index if not exists idx_role_evidence_application
  on role_application_evidence (application_id, uploaded_at);
create index if not exists idx_role_evidence_retention
  on role_application_evidence (delete_after)
  where deleted_at is null and delete_after is not null;

create table if not exists role_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references role_applications (id) on delete cascade,
  event_type text not null check (event_type in (
    'submitted', 'review_started', 'information_requested', 'resubmitted',
    'approved', 'rejected', 'withdrawn'
  )),
  actor_kind text not null check (actor_kind in ('applicant', 'staff', 'system')),
  applicant_message text,
  created_at timestamptz not null default now()
);
create index if not exists idx_role_application_events_history
  on role_application_events (application_id, created_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'role-evidence', 'role-evidence', false, 20971520,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table role_application_evidence enable row level security;
alter table role_application_events enable row level security;

drop policy if exists role_applications_read_own_or_staff on role_applications;
create policy role_applications_read_own_or_staff on role_applications
  for select using (
    auth.uid() = user_id
    or (role_requested = 'organizer' and public.is_staff(auth.uid()))
    or (
      role_requested = 'coach'
      and public.is_admin(auth.uid())
      and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    )
  );

drop policy if exists role_evidence_read_owner_or_aal2_admin on role_application_evidence;
create policy role_evidence_read_owner_or_aal2_admin on role_application_evidence
  for select using (
    auth.uid() = user_id
    or (public.is_admin(auth.uid()) and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2')
  );

drop policy if exists role_events_read_owner_or_aal2_admin on role_application_events;
create policy role_events_read_owner_or_aal2_admin on role_application_events
  for select using (
    exists (
      select 1 from role_applications a
      where a.id = application_id
        and (
          a.user_id = auth.uid()
          or (public.is_admin(auth.uid()) and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2')
        )
    )
  );

-- Direct application writes are removed. Every state transition goes through the authenticated,
-- transactional RPCs below; the existing own/staff SELECT policy remains.
drop policy if exists role_applications_insert_own on role_applications;

create or replace function public.submit_coach_application(
  p_application_id uuid,
  p_answers jsonb,
  p_evidence jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_profile profiles%rowtype;
  v_item jsonb;
  v_max_files integer;
  v_max_bytes integer;
  v_min_refs integer;
  v_allowed_mimes text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_application_id is null then raise exception 'application_id_required'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'invalid_answers'; end if;
  if jsonb_typeof(coalesce(p_evidence, '[]'::jsonb)) <> 'array' then raise exception 'invalid_evidence'; end if;

  if not coalesce((select (value #>> '{}')::boolean from system_settings where key = 'role_applications_enabled'), true)
     or not coalesce((select (value #>> '{}')::boolean from system_settings where key = 'coach_applications_enabled'), true)
  then raise exception 'coach_applications_closed'; end if;

  select * into v_profile from profiles where id = v_actor for update;
  if not found or v_profile.account_status <> 'active' or v_profile.onboarded_at is null
  then raise exception 'active_profile_required'; end if;
  if exists (select 1 from user_roles where user_id = v_actor and role = 'coach' and status = 'active')
  then raise exception 'already_coach'; end if;
  if exists (
    select 1 from role_applications
    where user_id = v_actor and role_requested = 'coach'
      and status::text in ('pending','reviewing','information_requested')
  ) then raise exception 'open_application_exists'; end if;

  if length(trim(coalesce(p_answers->>'experience', ''))) < 20
     or length(trim(coalesce(p_answers->>'locations', ''))) < 2
     or jsonb_typeof(p_answers->'specialties') <> 'array'
     or jsonb_array_length(p_answers->'specialties') < 1
     or coalesce(p_answers->>'consent', 'false') <> 'true'
  then raise exception 'incomplete_application'; end if;

  v_min_refs := coalesce((select (value #>> '{}')::int from system_settings where key = 'coach_application_reference_min_count'), 1);
  if jsonb_typeof(p_answers->'references') <> 'array'
     or jsonb_array_length(p_answers->'references') < v_min_refs
  then raise exception 'reference_required'; end if;

  v_max_files := coalesce((select (value #>> '{}')::int from system_settings where key = 'coach_evidence_max_files'), 5);
  v_max_bytes := coalesce((select (value #>> '{}')::int from system_settings where key = 'coach_evidence_max_bytes'), 5242880);
  v_allowed_mimes := coalesce((select value #>> '{}' from system_settings where key = 'coach_evidence_allowed_mime_types'), 'image/jpeg,image/png,image/webp,application/pdf');
  if jsonb_array_length(coalesce(p_evidence, '[]'::jsonb)) > v_max_files
  then raise exception 'too_many_evidence_files'; end if;

  insert into role_applications (
    id, user_id, role_requested, answers, evidence, status, submitted_at
  ) values (
    p_application_id, v_actor, 'coach', p_answers, '{}'::jsonb, 'pending', now()
  );

  for v_item in select * from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) loop
    if position(format('%s/%s/', v_actor, p_application_id) in coalesce(v_item->>'storage_path','')) <> 1
       or coalesce((v_item->>'size_bytes')::int, 0) > v_max_bytes
       or position(',' || coalesce(v_item->>'mime_type','') || ',' in ',' || v_allowed_mimes || ',') = 0
    then raise exception 'invalid_evidence_metadata'; end if;
    insert into role_application_evidence (
      application_id, user_id, storage_path, original_filename, mime_type, size_bytes, sha256
    ) values (
      p_application_id, v_actor, v_item->>'storage_path', left(v_item->>'original_filename', 255),
      v_item->>'mime_type', (v_item->>'size_bytes')::int, v_item->>'sha256'
    );
  end loop;

  insert into role_application_events (application_id, event_type, actor_kind, applicant_message)
  values (p_application_id, 'submitted', 'applicant', 'Coach application submitted.');
  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, after_snapshot, reason)
  values (v_actor, 'player', 'coach.application.submit', 'role_application', p_application_id,
    jsonb_build_object('status','pending','evidence_count',jsonb_array_length(coalesce(p_evidence,'[]'::jsonb))),
    'Applicant submitted Coach application');
  return p_application_id;
end;
$$;

create or replace function public.withdraw_coach_application(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_app role_applications%rowtype;
  v_days integer;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select * into v_app from role_applications where id = p_application_id for update;
  if not found or v_app.user_id <> v_actor or v_app.role_requested <> 'coach'
  then raise exception 'application_not_found'; end if;
  if v_app.status::text not in ('pending','reviewing','information_requested')
  then raise exception 'application_not_withdrawable'; end if;
  v_days := coalesce((select (value #>> '{}')::int from system_settings where key = 'coach_evidence_retention_days_after_decision'), 90);
  update role_applications set status = 'withdrawn', withdrawn_at = now(),
    retention_delete_after = now() + make_interval(days => v_days)
  where id = p_application_id;
  update role_application_evidence set delete_after = now() + make_interval(days => v_days)
  where application_id = p_application_id and deleted_at is null;
  insert into role_application_events (application_id, event_type, actor_kind, applicant_message)
  values (p_application_id, 'withdrawn', 'applicant', 'Application withdrawn.');
  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot, reason)
  values (v_actor, 'player', 'coach.application.withdraw', 'role_application', p_application_id,
    jsonb_build_object('status',v_app.status), jsonb_build_object('status','withdrawn'), 'Applicant withdrew Coach application');
  return p_application_id;
end;
$$;

create or replace function public.resubmit_coach_application(
  p_application_id uuid,
  p_answers jsonb,
  p_evidence jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_app role_applications%rowtype;
  v_item jsonb;
  v_existing integer;
  v_max_files integer;
  v_max_bytes integer;
  v_min_refs integer;
  v_allowed_mimes text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select * into v_app from role_applications where id = p_application_id for update;
  if not found or v_app.user_id <> v_actor or v_app.role_requested <> 'coach'
  then raise exception 'application_not_found'; end if;
  if v_app.status::text <> 'information_requested' then raise exception 'resubmission_not_requested'; end if;
  if jsonb_typeof(p_answers) <> 'object'
     or length(trim(coalesce(p_answers->>'experience', ''))) < 20
     or length(trim(coalesce(p_answers->>'locations', ''))) < 2
     or jsonb_typeof(p_answers->'specialties') <> 'array'
     or jsonb_array_length(p_answers->'specialties') < 1
     or coalesce(p_answers->>'consent','false') <> 'true'
  then raise exception 'invalid_answers'; end if;

  v_min_refs := coalesce((select (value #>> '{}')::int from system_settings where key = 'coach_application_reference_min_count'), 1);
  if jsonb_typeof(p_answers->'references') <> 'array'
     or jsonb_array_length(p_answers->'references') < v_min_refs
  then raise exception 'reference_required'; end if;

  v_max_files := coalesce((select (value #>> '{}')::int from system_settings where key = 'coach_evidence_max_files'), 5);
  v_max_bytes := coalesce((select (value #>> '{}')::int from system_settings where key = 'coach_evidence_max_bytes'), 5242880);
  v_allowed_mimes := coalesce((select value #>> '{}' from system_settings where key = 'coach_evidence_allowed_mime_types'), 'image/jpeg,image/png,image/webp,application/pdf');
  select count(*) into v_existing from role_application_evidence
  where application_id = p_application_id and deleted_at is null;
  if v_existing + jsonb_array_length(coalesce(p_evidence,'[]'::jsonb)) > v_max_files
  then raise exception 'too_many_evidence_files'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) loop
    if position(format('%s/%s/', v_actor, p_application_id) in coalesce(v_item->>'storage_path','')) <> 1
       or coalesce((v_item->>'size_bytes')::int, 0) > v_max_bytes
       or position(',' || coalesce(v_item->>'mime_type','') || ',' in ',' || v_allowed_mimes || ',') = 0
    then raise exception 'invalid_evidence_metadata'; end if;
    insert into role_application_evidence (
      application_id, user_id, storage_path, original_filename, mime_type, size_bytes, sha256
    ) values (
      p_application_id, v_actor, v_item->>'storage_path', left(v_item->>'original_filename', 255),
      v_item->>'mime_type', (v_item->>'size_bytes')::int, v_item->>'sha256'
    );
  end loop;

  update role_applications set answers = p_answers, status = 'pending', responded_at = now(),
    submitted_at = now(), information_requested_at = null, retention_delete_after = null
  where id = p_application_id;
  update role_application_evidence set delete_after = null where application_id = p_application_id and deleted_at is null;
  insert into role_application_events (application_id, event_type, actor_kind, applicant_message)
  values (p_application_id, 'resubmitted', 'applicant', 'Additional information submitted.');
  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot, reason)
  values (v_actor, 'player', 'coach.application.resubmit', 'role_application', p_application_id,
    jsonb_build_object('status',v_app.status), jsonb_build_object('status','pending'), 'Applicant responded to information request');
  return p_application_id;
end;
$$;

create or replace function public.start_coach_application_review(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_app role_applications%rowtype;
begin
  if v_actor is null or not public.is_admin(v_actor)
     or coalesce(auth.jwt()->>'aal','aal1') <> 'aal2'
  then raise exception 'aal2_admin_required'; end if;
  select * into v_app from role_applications where id = p_application_id for update;
  if not found or v_app.role_requested <> 'coach' then raise exception 'application_not_found'; end if;
  if v_app.status::text = 'reviewing' then return p_application_id; end if;
  if v_app.status::text <> 'pending' then raise exception 'application_not_reviewable'; end if;
  update role_applications set status = 'reviewing', reviewed_by = v_actor,
    review_started_at = coalesce(review_started_at, now())
  where id = p_application_id;
  insert into role_application_events (application_id,event_type,actor_kind,applicant_message)
  values (p_application_id,'review_started','staff','Your Coach application is under review.');
  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot, reason)
  values (v_actor,'admin','coach.application.review_start','role_application',p_application_id,
    jsonb_build_object('status',v_app.status),jsonb_build_object('status','reviewing'),'Admin started Coach application review');
  return p_application_id;
end;
$$;

create or replace function public.decide_coach_application(
  p_application_id uuid,
  p_decision text,
  p_applicant_reason text default null,
  p_internal_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_app role_applications%rowtype;
  v_min integer;
  v_days integer;
  v_next text;
begin
  if v_actor is null or not public.is_admin(v_actor)
     or coalesce(auth.jwt()->>'aal','aal1') <> 'aal2'
  then raise exception 'aal2_admin_required'; end if;
  if p_decision not in ('request_information','approve','reject') then raise exception 'invalid_decision'; end if;
  select * into v_app from role_applications where id = p_application_id for update;
  if not found or v_app.role_requested <> 'coach' then raise exception 'application_not_found'; end if;
  if v_app.status::text not in ('pending','reviewing','information_requested')
  then raise exception 'application_already_decided'; end if;
  if p_decision = 'request_information' and v_app.status::text = 'information_requested'
  then raise exception 'already_waiting_for_information'; end if;

  v_min := coalesce((select (value #>> '{}')::int from system_settings where key = 'coach_application_reason_min_chars'), 10);
  if p_decision in ('request_information','reject') and length(trim(coalesce(p_applicant_reason,''))) < v_min
  then raise exception 'useful_applicant_reason_required'; end if;
  if p_decision = 'approve' and length(trim(coalesce(p_internal_note,''))) < v_min
  then raise exception 'internal_confirmation_required'; end if;

  if p_decision = 'request_information' then
    v_next := 'information_requested';
    update role_applications set status = 'information_requested', reviewed_by = v_actor,
      review_reason = trim(p_applicant_reason), information_requested_at = now(),
      review_started_at = coalesce(review_started_at, now())
    where id = p_application_id;
    insert into role_application_events (application_id,event_type,actor_kind,applicant_message)
    values (p_application_id,'information_requested','staff',trim(p_applicant_reason));
  elsif p_decision = 'approve' then
    v_next := 'approved';
    v_days := coalesce((select (value #>> '{}')::int from system_settings where key = 'coach_evidence_retention_days_after_decision'), 90);
    update role_applications set status = 'approved', reviewed_by = v_actor, review_reason = null,
      review_started_at = coalesce(review_started_at, now()), decided_at = now(),
      retention_delete_after = now() + make_interval(days => v_days)
    where id = p_application_id;
    insert into user_roles (user_id, role, status, approved_by, approved_at, reason)
    values (v_app.user_id, 'coach', 'active', v_actor, now(), trim(p_internal_note));
    update role_application_evidence set delete_after = now() + make_interval(days => v_days)
    where application_id = p_application_id and deleted_at is null;
    insert into role_application_events (application_id,event_type,actor_kind,applicant_message)
    values (p_application_id,'approved','staff','Coach application approved.');
  else
    v_next := 'rejected';
    v_days := coalesce((select (value #>> '{}')::int from system_settings where key = 'coach_evidence_retention_days_after_decision'), 90);
    update role_applications set status = 'rejected', reviewed_by = v_actor,
      review_reason = trim(p_applicant_reason), review_started_at = coalesce(review_started_at, now()),
      decided_at = now(), retention_delete_after = now() + make_interval(days => v_days)
    where id = p_application_id;
    update role_application_evidence set delete_after = now() + make_interval(days => v_days)
    where application_id = p_application_id and deleted_at is null;
    insert into role_application_events (application_id,event_type,actor_kind,applicant_message)
    values (p_application_id,'rejected','staff',trim(p_applicant_reason));
  end if;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot, reason)
  values (v_actor, 'admin', 'coach.application.' || p_decision, 'role_application', p_application_id,
    jsonb_build_object('status',v_app.status), jsonb_build_object('status',v_next,'user_id',v_app.user_id),
    case when p_decision = 'approve' then trim(p_internal_note) else trim(p_applicant_reason) end);
  return jsonb_build_object('application_id',p_application_id,'user_id',v_app.user_id,'outcome',p_decision);
end;
$$;

create or replace function public.revoke_coach_role(p_user_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role user_roles%rowtype;
  v_min integer;
begin
  if v_actor is null or not public.is_admin(v_actor)
     or coalesce(auth.jwt()->>'aal','aal1') <> 'aal2'
  then raise exception 'aal2_admin_required'; end if;
  v_min := coalesce((select (value #>> '{}')::int from system_settings where key = 'coach_application_reason_min_chars'), 10);
  if length(trim(coalesce(p_reason,''))) < v_min then raise exception 'useful_reason_required'; end if;
  select * into v_role from user_roles
  where user_id = p_user_id and role = 'coach' and status = 'active'
  for update;
  if not found then raise exception 'active_coach_role_not_found'; end if;
  update user_roles set status = 'revoked', revoked_by = v_actor, revoked_at = now(), reason = trim(p_reason)
  where id = v_role.id;
  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_snapshot, after_snapshot, reason)
  values (v_actor, 'admin', 'coach.role.revoke', 'user_role', v_role.id,
    jsonb_build_object('user_id',p_user_id,'role','coach','status','active'),
    jsonb_build_object('user_id',p_user_id,'role','coach','status','revoked'), trim(p_reason));
  return jsonb_build_object('role_id',v_role.id,'user_id',p_user_id,'outcome','revoked');
end;
$$;

revoke all on function public.submit_coach_application(uuid,jsonb,jsonb) from public;
revoke all on function public.withdraw_coach_application(uuid) from public;
revoke all on function public.resubmit_coach_application(uuid,jsonb,jsonb) from public;
revoke all on function public.start_coach_application_review(uuid) from public;
revoke all on function public.decide_coach_application(uuid,text,text,text) from public;
revoke all on function public.revoke_coach_role(uuid,text) from public;
grant execute on function public.submit_coach_application(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.withdraw_coach_application(uuid) to authenticated;
grant execute on function public.resubmit_coach_application(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.start_coach_application_review(uuid) to authenticated;
grant execute on function public.decide_coach_application(uuid,text,text,text) to authenticated;
grant execute on function public.revoke_coach_role(uuid,text) to authenticated;

-- Verify after SQL Editor application.
select 'coach_tables' as check, count(*) as n from information_schema.tables
  where table_schema = 'public' and table_name in ('role_application_evidence','role_application_events')
union all
select 'coach_rpc_functions', count(*) from information_schema.routines
  where routine_schema = 'public' and routine_name in (
    'submit_coach_application','withdraw_coach_application','resubmit_coach_application','start_coach_application_review',
    'decide_coach_application','revoke_coach_role'
  )
union all
select 'coach_settings', count(*) from system_settings where key like 'coach_%'
union all
select 'coach_bucket', count(*) from storage.buckets where id = 'role-evidence' and public = false
union all
select 'coach_rls_policies', count(*) from pg_policies
  where schemaname = 'public' and tablename in ('role_application_evidence','role_application_events')
union all
select 'existing_organizer_apps_preserved', count(*) from role_applications where role_requested = 'organizer';
-- Expect: coach_tables=2, coach_rpc_functions=6, coach_settings=11 (includes the existing Coach vouch
-- limit), coach_bucket=1, coach_rls_policies=2, existing_organizer_apps_preserved=<pre-migration count>.
