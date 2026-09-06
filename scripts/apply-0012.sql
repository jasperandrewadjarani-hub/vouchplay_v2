-- =============================================================================
-- APPLY: Migration 0012 — Notifications (Phase 11, §27).
-- Paste this whole block into the Supabase SQL editor (project itrosesiywpbaxtmucbb) and run it.
-- Creates the notifications + notification_preferences tables with RLS (recipients read their own;
-- writes go through the service role). Idempotent. Expect the final rows:
--   notif_tables = 2, notif_rls_policies = 2
-- =============================================================================

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

create table if not exists notification_preferences (
  user_id uuid primary key references profiles (id) on delete cascade,
  muted_categories text[] not null default '{}',
  email_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_notification_prefs_updated_at on notification_preferences;
create trigger trg_notification_prefs_updated_at before update on notification_preferences
  for each row execute function set_updated_at();

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
