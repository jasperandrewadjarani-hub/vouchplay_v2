-- =============================================================================
-- VouchPlay v2 — Migration 0009: Payments (Phase 8)
-- Handover §24 (Payment Model), §36.28 payments, §38 (private storage), §37 (RLS).
--
-- V1 uses an abstract payment layer with MANUAL PROOF submission (§24.1). Proof files live in a
-- PRIVATE bucket and are only ever reachable through server-issued signed URLs after an authz check
-- (§38) — never public. Fee-per-division + currency come from `divisions` (0007); tournament-level
-- payment_instructions exist (0007); this migration adds an optional accepted-methods label and the
-- `payments` table + state machine. All payment changes are auditable (§24.4) — the server actions
-- write audit_logs / registration_events rows.
-- Apply via the Supabase SQL editor (same method as 0001–0008).
-- =============================================================================

-- ---------- Enum ----------
do $$ begin
  create type payment_status as enum
    ('not_required','pending','submitted','verified','rejected','refunded','partially_refunded');
exception when duplicate_object then null; end $$;

-- ---------- Tournament accepted payment methods (§24.1) ----------
alter table tournaments add column if not exists payment_methods text;

-- =============================================================================
-- payments (§36.28) — one payment per registration in V1.
-- =============================================================================
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations (id) on delete cascade,
  amount_due numeric(10, 2) not null default 0,
  amount_submitted numeric(10, 2),
  currency char(3) not null default 'PHP',
  method text,
  payer_name text,
  transaction_reference text,
  proof_storage_path text,                 -- PRIVATE bucket path; never exposed publicly
  status payment_status not null default 'pending',
  submitted_at timestamptz,
  verified_by uuid references profiles (id),
  verified_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_id)
);
create index if not exists idx_payments_registration on payments (registration_id);
create index if not exists idx_payments_status on payments (status);

drop trigger if exists trg_payments_updated_at on payments;
create trigger trg_payments_updated_at before update on payments
  for each row execute function set_updated_at();

-- =============================================================================
-- Private storage bucket for payment proof (§38). No public policies — access is exclusively via
-- server-issued signed URLs (service role), gated by app-level authz before issuing.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs', 'payment-proofs', false, 5242880,
  array['image/png','image/jpeg','image/webp','application/pdf']
)
on conflict (id) do nothing;

-- =============================================================================
-- Row Level Security (§37). Payment readable by the registration's team members, the tournament's
-- organizers, and staff. Writes happen via the service role in authored, audited actions.
-- =============================================================================
alter table payments enable row level security;

drop policy if exists payments_read on payments;
create policy payments_read on payments
  for select using (
    exists (
      select 1 from registrations r
      where r.id = registration_id
        and (
          public.is_team_member(auth.uid(), r.team_id)
          or public.is_tournament_organizer(auth.uid(), r.tournament_id)
          or public.is_staff(auth.uid())
        )
    )
  );
