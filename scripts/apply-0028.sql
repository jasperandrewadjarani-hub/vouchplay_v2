-- =============================================================================
-- VouchPlay v2 - Migration 0028: comments that stand on their own, and can be changed
-- master_plan §2B. Handover §9.3 (vouch comments), §10.1 (comments are ALWAYS attributed),
-- §36.7 (vouch_comments).
--
-- Until now a comment could only exist as a field on the vouch form: `vouch_id` was NOT NULL, so the
-- only way to say something about a player was to also assert a skill level for them. And once said
-- it was permanent - there is no edit and no delete anywhere in the product.
--
-- This migration is three small, additive changes:
--   * `vouch_id` becomes NULLABLE, so a comment can stand alone. A comment written by somebody who
--     DOES have an active vouch for that player is still linked to it, so nothing about existing
--     rows or the existing vouch-with-comment path changes.
--   * an index supporting "does this author already have an active comment about this player?",
--     which is the one-active-comment-per-pair rule the action enforces. It is an INDEX, not a
--     unique constraint: production has 0 duplicate (author, target) active pairs today, but a
--     unique constraint would turn any future legacy row into a failed deploy, and the rule is a
--     product rule rather than an integrity invariant.
--   * RLS policies naming the author as the person who may update or delete their own comment.
--     The app writes through audited server actions on the service client, so these are defence in
--     depth rather than the mechanism - but a table that can now be edited should say in its own
--     policies who may edit it.
--
-- Deletion is a SOFT delete to status = 'removed', a value `vouch_comment_status` has always had
-- (verified against production before this file was written). The comment leaves every public read
-- immediately, which is what the author asked for, and the row survives for moderation: a comment
-- that was reported and then deleted by its author must not vanish from the moderation trail.
--
-- Apply via the Supabase SQL editor (same method as 0001-0027).
-- =============================================================================

-- ---------- A comment no longer requires a rating ----------
alter table vouch_comments alter column vouch_id drop not null;

comment on column vouch_comments.vouch_id is
  'The vouch this comment was written alongside, or NULL for a standalone comment (§2B). Comments '
  'are ALWAYS attributed to author_id regardless, and are never anonymous (§10.1).';

-- ---------- One active comment per author per player ----------
-- Supports the lookup the action does before every write. Not unique: see the header.
create index if not exists idx_vouch_comments_author_target
  on vouch_comments (author_id, target_id)
  where status = 'active';

-- ---------- The author may change their own comment ----------
-- Read and insert policies are unchanged from 0004; these are the two that never existed.
drop policy if exists vouch_comments_update_own on vouch_comments;
create policy vouch_comments_update_own on vouch_comments
  for update using (auth.uid() = author_id) with check (auth.uid() = author_id);

drop policy if exists vouch_comments_delete_own on vouch_comments;
create policy vouch_comments_delete_own on vouch_comments
  for delete using (auth.uid() = author_id);

-- =============================================================================
-- VERIFICATION - run as the LAST statement (the SQL editor shows only the final result).
-- Expected: vouch_id_nullable=1, author_target_index=1, author_write_policies=2.
-- active_comments and standalone_comments are informational: standalone_comments is 0 before any
-- app code ships, and is the number that starts moving once it does.
-- =============================================================================
select 'vouch_id_nullable' as check, count(*)::int as value
  from information_schema.columns
 where table_schema = 'public' and table_name = 'vouch_comments'
   and column_name = 'vouch_id' and is_nullable = 'YES'
union all
select 'author_target_index', count(*)::int
  from pg_indexes
 where schemaname = 'public' and tablename = 'vouch_comments'
   and indexname = 'idx_vouch_comments_author_target'
union all
select 'author_write_policies', count(*)::int
  from pg_policies
 where schemaname = 'public' and tablename = 'vouch_comments'
   and policyname in ('vouch_comments_update_own', 'vouch_comments_delete_own')
union all
select 'active_comments', count(*)::int
  from vouch_comments where status = 'active'
union all
select 'standalone_comments', count(*)::int
  from vouch_comments where vouch_id is null;
