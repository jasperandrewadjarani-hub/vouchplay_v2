-- =============================================================================
-- VouchPlay v2 — Migration 0012: Notifications (Phase 11)
-- Handover §27. In-app notifications (V1 primary channel) + per-user preferences. Email-for-critical
-- is a ready-but-inert channel (sends only once SMTP creds are in the app env + the user opts in);
-- push is a later adapter. Every notification carries recipient/type/title/body/deep-link/actor/
-- related-entity/read-status/created_at (§27 record shape).
-- Apply via the Supabase SQL editor (same method as 0001–0011).
-- =============================================================================

-- notifications (§27). `type`/`category` are free text validated by the @vouchplay/core catalog (the
-- type list is large and evolving - an enum would churn); `is_critical` gates email + un-mutability.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles (id) on delete cascade,
  type text not null,
  category text not null,
  title text not null,
  body text,
  link text,
  actor_id uuid references profiles (id) on delete set null,
  entity_type text,
  entity_id uuid,
  is_critical boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_recipient on notifications (recipient_id, created_at desc);
create index if not exists idx_notifications_unread on notifications (recipient_id)
  where read_at is null;

-- notification_preferences (§27.5). Non-critical categories can be muted; critical cannot. Email is a
-- master opt-in that stays inert until the app SMTP transport is configured.
create table if not exists notification_preferences (
  user_id uuid primary key references profiles (id) on delete cascade,
  muted_categories text[] not null default '{}',
  email_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_notification_prefs_updated_at on notification_preferences;
create trigger trg_notification_prefs_updated_at before update on notification_preferences
  for each row execute function set_updated_at();

-- =============================================================================
-- RLS (§37). Recipients read their OWN notifications + preferences. All writes (create, mark-read,
-- preference changes) go through the service role in authored server actions after app-level authz.
-- =============================================================================
alter table notifications enable row level security;
alter table notification_preferences enable row level security;

drop policy if exists notifications_read_own on notifications;
create policy notifications_read_own on notifications
  for select using (auth.uid() = recipient_id);

drop policy if exists notification_prefs_read_own on notification_preferences;
create policy notification_prefs_read_own on notification_preferences
  for select using (auth.uid() = user_id);

-- ---------- Verify ----------
select 'notif_tables' as check, count(*) as n
  from information_schema.tables
  where table_schema = 'public' and table_name in ('notifications','notification_preferences')
union all
select 'notif_rls_policies', count(*) from pg_policies
  where schemaname = 'public' and tablename in ('notifications','notification_preferences');
-- Expect: notif_tables = 2, notif_rls_policies = 2
