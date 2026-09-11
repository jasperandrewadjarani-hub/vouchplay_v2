-- =============================================================================
-- VouchPlay v2 - Migration 0036: Identity verification document storage (Phase C)
-- master_plan §2AG (Phase C), handover §13.3, §38 (private storage), §37 (RLS).
--
-- `identity_verifications` already exists IN FULL (migration 0001): the status enum, document
-- path, submitted/reviewed timestamps, reviewer, reason, and the retention columns
-- (document_delete_after/document_deleted_at) are ALL already there, with RLS already in place
-- (owner reads own + inserts own; staff read all; every other write is service-role only). This
-- migration adds ONLY what was still missing: the private storage bucket for the ID image itself,
-- its storage.objects RLS (mirroring the payment-proofs bucket's privacy model, migration 0009),
-- and two Admin-tunable settings. Nothing here touches identity_verifications - do not recreate it.
--
-- DECISIONS (locked, master_plan §2AG Phase C): identity is STAFF-APPROVED, never auto-verified on
-- upload (D1). Retention is the most privacy-protective default: the ID image is DELETED on
-- decision (approve OR reject) by the review server action - only the decision row survives.
-- `document_delete_after` (submitted_at + identity_doc_retention_days) is a pre-decision BACKSTOP
-- for the case staff never decide; a scheduled sweep to actually delete past-backstop rows is a
-- later phase, not this one. Government IDs are sensitive personal data under RA 10173: private
-- bucket, staff-only short-TTL signed URLs, never a public URL, never surfaced to non-staff.
--
-- Apply via the Supabase SQL editor (same method as 0001-0035).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Private storage bucket for ID images (§38). No public policies - never a public URL. Access is
-- owner-insert-to-own-folder, owner-or-staff-read, service-role-does-everything (including the
-- delete that happens on every review decision).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'identity-docs', 'identity-docs', false, 5242880,
  array['image/png','image/jpeg','image/webp','application/pdf']
)
on conflict (id) do nothing;

drop policy if exists identity_docs_owner_insert on storage.objects;
create policy identity_docs_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'identity-docs' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists identity_docs_read_owner_or_staff on storage.objects;
create policy identity_docs_read_owner_or_staff on storage.objects
  for select using (
    bucket_id = 'identity-docs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_staff(auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Settings (handover §30.7). Admin-tunable, never hardcoded in domain logic.
-- ---------------------------------------------------------------------------
insert into system_settings (key, value, description) values
  ('identity_verification_enabled', 'true'::jsonb, 'Feature flag for the identity verification pipeline (master_plan §2AG Phase C)'),
  ('identity_doc_retention_days', '7'::jsonb, 'Pre-decision backstop: document_delete_after window from submission, in case staff never decide (master_plan §2AG Phase C)')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Verify after SQL Editor application.
-- ---------------------------------------------------------------------------
select 'identity_docs_bucket' as check, count(*)::int as n
  from storage.buckets where id = 'identity-docs' and public = false
union all
select 'identity_docs_policies', count(*)
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname like 'identity_docs_%'
union all
select 'identity_settings_seeded', count(*)
  from system_settings where key in ('identity_verification_enabled', 'identity_doc_retention_days');
-- Expect: identity_docs_bucket=1, identity_docs_policies=2, identity_settings_seeded=2.
