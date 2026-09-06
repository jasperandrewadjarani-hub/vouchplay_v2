'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { ClipboardCheck } from 'lucide-react';

/**
 * Registration entry points on a tournament page (handover §19.2, §19.3, §28.1).
 *  - `RegisterButton`: the prominent "Register" call-to-action. Anonymous visitors are routed to
 *    signup carrying `next=/tournaments/{slug}?register=1`, so account creation resumes straight back
 *    on the registration options (the same resume pattern as vouching). Signed-in visitors smooth-
 *    scroll to the registration section.
 *  - `RegisterAnchorScroll`: when the page is opened via a shared registration link (`?register=1`),
 *    scrolls to and briefly highlights the registration section so it "leads directly to
 *    registration options" for whoever opens the link.
 */

export function registerNext(slug: string): string {
  return `/tournaments/${slug}?register=1`;
}

const btn =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2';

export function RegisterButton({
  slug,
  authed,
  open,
}: {
  slug: string;
  authed: boolean;
  open: boolean;
}) {
  if (!open) return null;

  if (!authed) {
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
    <button
      type="button"
      onClick={() =>
        document.getElementById('register')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      className={`${btn} vp-gradient vp-glow text-white`}
    >
      <ClipboardCheck size={16} aria-hidden />
      Register
    </button>
  );
}

/** Scrolls to (and pulses) the #register section when the page is opened with ?register=1. */
export function RegisterAnchorScroll() {
  useEffect(() => {
    let wants = false;
    try {
      wants = new URLSearchParams(window.location.search).get('register') === '1';
    } catch {
      wants = false;
    }
    if (!wants) return;
    const el = document.getElementById('register');
    if (!el) return;
    // Defer to after paint so layout is settled.
    const id = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('vp-in');
    }, 120);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
