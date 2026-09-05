-- =============================================================================
-- VouchPlay v2 — Migration 0003: Avatars storage bucket + public player facts
-- Handover §38 (storage), §8.2 (public badges), §37 (RLS).
--
-- STATUS: the `avatars` bucket itself was created at runtime via the service-role Storage API
-- (no DDL needed); this migration records that config idempotently AND adds the RLS-clean way to
-- expose PUBLIC badge facts (active roles + identity-approved) that Phase 2 currently reads with the
-- service client. After this is applied, switch lib/players/queries.ts badge reads to call
-- public_player_facts() via the anon client and drop the service-client path.
-- Apply via the Supabase SQL editor (same method used for 0001/0002).
-- =============================================================================

-- ---------- avatars bucket (public; 2 MB; images only) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object policies: public read (bucket is public), and a user may write ONLY within their own
-- {user_id}/ folder. (Phase-2 uploads go through the service role server-side; these policies also
-- permit a future direct client upload without loosening anything.)
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

-- =============================================================================
-- public_player_facts(ids) — RLS-clean exposure of PUBLIC badge facts only (§8.2).
-- Returns booleans, never the sensitive columns of user_roles / identity_verifications. SECURITY
-- DEFINER so it can read those tables past their owner-or-staff RLS, but the projection is safe.
-- =============================================================================
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
    exists (
      select 1 from user_roles r
      where r.user_id = p.id and r.role = 'coach' and r.status = 'active'
    ) as is_coach,
    exists (
      select 1 from user_roles r
      where r.user_id = p.id and r.role = 'organizer' and r.status = 'active'
    ) as is_organizer,
    exists (
      select 1 from identity_verifications iv
      where iv.user_id = p.id and iv.status = 'approved'
    ) as identity_verified
  from profiles p
  where p.id = any(ids);
$$;

grant execute on function public.public_player_facts(uuid[]) to anon, authenticated;
