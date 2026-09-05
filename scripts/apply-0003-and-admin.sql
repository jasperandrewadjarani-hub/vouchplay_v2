-- ============================================================================
-- ONE-PASTE APPLY: migration 0003 + JT admin grant
-- Paste this whole file into the Supabase SQL editor (project itrosesiywpbaxtmucbb)
-- and click Run. Idempotent — safe to run more than once.
-- (Claude's automated dashboard writes are blocked by the auto-mode classifier, so
--  this needs a human paste. Everything is also in migration 0003 + scripts/seed-admin.mjs.)
-- ============================================================================

-- ---------- Migration 0003: avatars bucket config + storage policies ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists avatars_owner_write on storage.objects;
create policy avatars_owner_write on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------- Migration 0003: public_player_facts() (RLS-clean public badge facts) ----------
create or replace function public.public_player_facts(ids uuid[])
returns table (
  user_id uuid,
  is_coach boolean,
  is_organizer boolean,
  identity_verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    exists (select 1 from user_roles r where r.user_id = p.id and r.role = 'coach' and r.status = 'active') as is_coach,
    exists (select 1 from user_roles r where r.user_id = p.id and r.role = 'organizer' and r.status = 'active') as is_organizer,
    exists (select 1 from identity_verifications iv where iv.user_id = p.id and iv.status = 'approved') as identity_verified
  from profiles p
  where p.id = any(ids);
$$;

grant execute on function public.public_player_facts(uuid[]) to anon, authenticated;

-- ---------- JT admin grant: super_admin for Jasper ----------
insert into user_roles (user_id, role, status, approved_at)
select u.id, 'super_admin', 'active', now()
from auth.users u
where lower(u.email) = 'jasper.andrew.adjarani@gmail.com'
  and not exists (
    select 1 from user_roles r
    where r.user_id = u.id and r.role = 'super_admin' and r.status = 'active'
  );

-- ---------- Verify ----------
select 'admins' as check, count(*) as n from user_roles where role = 'super_admin' and status = 'active'
union all
select 'public_player_facts_exists', count(*) from pg_proc where proname = 'public_player_facts'
union all
select 'avatars_bucket_public', count(*) from storage.buckets where id = 'avatars' and public;
