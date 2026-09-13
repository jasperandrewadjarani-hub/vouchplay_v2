'use client';

import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { registerNext } from '@/lib/tournaments/register-link';
import { RegistrationWizardLauncher, type WizardTournament } from './registration-wizard';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';

/**
 * The prominent "Register" call to action on a tournament page (master_plan §2AO B). Anonymous
 * visitors are routed to signup carrying `next=/tournaments/{slug}?register=1`, so account creation
 * resumes straight back on `?register=1` - which `RegistrationWizardLauncher` reads to open the
 * wizard at Division. Signed-in visitors open the wizard directly; there is no more scroll-to-section
 * behaviour (`RegisterAnchorScroll` is gone - the launcher's own `?register=1`/`?entered=` handling
 * replaces it).
 */

const btn =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2';

export function RegisterButton({
  slug,
  authed,
  open,
  tournament,
  state,
  guestRegistrationEnabled = false,
}: {
  slug: string;
  authed: boolean;
  open: boolean;
  /** Only needed once signed in, or when guest registration is enabled for an anonymous visitor. */
  tournament?: WizardTournament;
  state?: ViewerRegistrationState | null;
  /** master_plan §2AU Decision H: an anonymous visitor gets the guest wizard directly instead of a
   *  detour through signup, when the organizer/Admin have not disabled it. Ignored once `authed`. */
  guestRegistrationEnabled?: boolean;
}) {
  if (!open) return null;

  if (!authed || !tournament) {
    if (!authed && guestRegistrationEnabled && tournament) {
      return (
        <RegistrationWizardLauncher tournament={tournament} state={null} mode="guest">
          <button type="button" className={`${btn} vp-gradient vp-glow text-white`}>
            <ClipboardCheck size={16} aria-hidden />
            Register
          </button>
        </RegistrationWizardLauncher>
      );
    }
    return (
      <Link
        href={`/signup?next=${encodeURIComponent(registerNext(slug))}`}
        className={`${btn} vp-gradient vp-glow text-white`}
      >
        <ClipboardCheck size={16} aria-hidden />
        Register
      </Link>
    );
  }

  return (
    <RegistrationWizardLauncher tournament={tournament} state={state ?? null}>
      <button type="button" className={`${btn} vp-gradient vp-glow text-white`}>
        <ClipboardCheck size={16} aria-hidden />
        Register
      </button>
    </RegistrationWizardLauncher>
  );
}
