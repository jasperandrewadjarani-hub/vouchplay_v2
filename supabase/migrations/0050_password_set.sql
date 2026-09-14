-- =============================================================================
-- VouchPlay v2 - Migration 0050: password_set flag on profiles
-- master_plan §2BB (mandatory password election after first email sign-in).
-- Handover §7 (auth). No security-definer functions added (no grant lock needed).
--
-- WHY: signup and login both default to email OTP (a 6-digit code), so returning users request a
-- login code on every visit - burning through the Gmail SMTP daily cap as we scale. This flag drives
-- a one-time blocking gate that asks an email user to set a password after they sign in, so their
-- next visits use the password (no email). Federated (Google) users and users who already have a
-- password never need the gate.
--
-- SEMANTICS: password_set = true means "never show the password gate" (has a real password OR
-- authenticates via a federated provider). false = email-only user with no password -> gate them.
--
-- The app reads this fail-open (a missing column, before this migration is applied, means no gate),
-- so the code deploy and this migration can land in either order. Applying THIS is what actually
-- turns the gate on for the existing user base - apply it deliberately (not mid-registration-window).
-- =============================================================================

alter table public.profiles
  add column if not exists password_set boolean not null default false;

-- Backfill: anyone who already has a usable password, or a federated (non-email) identity/provider,
-- never needs the gate. Everyone else (email-only, no password) stays false and will be prompted on
-- their next sign-in.
update public.profiles p
set password_set = true
from auth.users u
where p.id = u.id
  and p.password_set = false
  and (
    (u.encrypted_password is not null and u.encrypted_password <> '')
    or coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
    or exists (
      select 1 from auth.identities i
      where i.user_id = u.id and i.provider <> 'email'
    )
  );

-- Verification: rows expected to still need a password (email-only, no password) vs already-set.
select
  count(*) filter (where password_set) as password_set_true,
  count(*) filter (where not password_set) as password_set_false,
  count(*) as profiles_total
from public.profiles;
