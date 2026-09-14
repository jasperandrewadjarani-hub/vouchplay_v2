-- =============================================================================
-- VouchPlay v2 - Migration 0049: Web Push device subscriptions
-- master_plan §2AY D (Web Push with VAPID, mirrored from in-app notifications).
-- Handover §27 (notifications), §44 (PWA).
--
-- One row per browser/device push endpoint. The subscription IS the opt-in: there is no extra
-- preference column, because push mirrors exactly the rows `notify()` / `notifyMany()` decided to
-- insert, so the existing per-category mutes already apply.
--
-- RLS is ON with NO policies for anon/authenticated, and table privileges are revoked from both:
-- only the service role touches this table, and only after a server action has verified the caller
-- (the `notification_preferences` write pattern). `endpoint` is unique so a device that re-subscribes
-- upserts onto its own row instead of accumulating duplicates; `disabled_at` is set when the push
-- service answers 404/410 (the endpoint is gone) rather than deleting the row.
--
-- SAFE TO APPLY DURING THE OPEN REGISTRATION WINDOW: one new table, additive and idempotent, with no
-- functions, no triggers and no changes to any existing object.
-- Apply via the Supabase SQL editor (same method as 0001-0048).
-- =============================================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz
);

comment on table push_subscriptions is
  'Web Push device subscriptions (master_plan §2AY D). Service-role only: RLS is enabled with no policies and privileges are revoked from anon/authenticated. A 404/410 from the push service sets disabled_at.';

-- Every fan-out reads "the active devices of these users", so the partial index carries the
-- `disabled_at is null` predicate rather than leaving dead endpoints in the index.
create index if not exists idx_push_subscriptions_active_user
  on push_subscriptions (user_id)
  where disabled_at is null;

alter table push_subscriptions enable row level security;
-- No policies at all: no anonymous or authenticated client may select, insert, update or delete.

revoke all on table public.push_subscriptions from anon, authenticated;

-- ---------- Verification ----------
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
   and tablename = 'push_subscriptions';

select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'push_subscriptions'
 order by ordinal_position;

select policyname from pg_policies
 where schemaname = 'public'
   and tablename = 'push_subscriptions';

select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name = 'push_subscriptions'
   and grantee in ('anon', 'authenticated')
 order by grantee, privilege_type;
