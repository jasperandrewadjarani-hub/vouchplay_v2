'use client';

import Link from 'next/link';
import { useState } from 'react';
import { UserPlus, Handshake, Flag, Ban, ClipboardCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Profile actions (handover §9.1). Phase 2 wires the entry points + the auth gate only; the
 * underlying engines are later phases (vouch requests / partner Phase 3+; recruit/sponsor Phase 5;
 * skill review / report / block Phase 4). Anonymous viewers gate to signup with a resume `next`;
 * signed-in viewers see a "coming soon" note. Share + Vouch are rendered by the page separately.
 */
type Intent =
  | 'request-vouch'
  | 'partner'
  | 'recruit'
  | 'sponsor'
  | 'skill-review'
  | 'report'
  | 'block';

const LABELS: Record<Intent, { label: string; icon: LucideIcon; soon: string }> = {
  'request-vouch': {
    label: 'Request a vouch',
    icon: ClipboardCheck,
    soon: 'Requesting vouches opens in the next release.',
  },
  partner: {
    label: 'Request to partner',
    icon: Handshake,
    soon: 'Partner requests arrive with the Partner Finder.',
  },
  recruit: { label: 'Recruit player', icon: UserPlus, soon: 'Club recruitment arrives with Clubs.' },
  sponsor: { label: 'Sponsor player', icon: Handshake, soon: 'Sponsorship offers arrive with Clubs.' },
  'skill-review': {
    label: 'Request skill review',
    icon: ClipboardCheck,
    soon: 'Skill review requests arrive with Safety & Moderation.',
  },
  report: { label: 'Report', icon: Flag, soon: 'Reporting arrives with Safety & Moderation.' },
  block: { label: 'Block', icon: Ban, soon: 'Blocking arrives with Safety & Moderation.' },
};

function GatedAction({
  intent,
  slug,
  authed,
  variant = 'secondary',
}: {
  intent: Intent;
  slug: string;
  authed: boolean;
  variant?: 'secondary' | 'danger';
}) {
  const [open, setOpen] = useState(false);
  const { label, icon: Icon, soon } = LABELS[intent];
  const base =
    'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2';
  const tone =
    variant === 'danger'
      ? 'border-border text-danger hover:bg-danger/10'
      : 'border-border bg-surface text-foreground hover:bg-surface-muted';

  if (!authed) {
    const next = `/players/${slug}?intent=${intent}`;
    return (
      <Link href={`/signup?next=${encodeURIComponent(next)}`} className={`${base} ${tone}`}>
        <Icon size={15} aria-hidden />
        {label}
      </Link>
    );
  }

  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => setOpen((v) => !v)} className={`${base} ${tone}`} aria-expanded={open}>
        <Icon size={15} aria-hidden />
        {label}
      </button>
      {open && (
        <span
          role="status"
          className="border-border bg-surface text-foreground-muted absolute left-0 top-full z-10 mt-2 w-60 rounded-xl border p-3 text-xs shadow-lg"
        >
          {soon}
        </span>
      )}
    </span>
  );
}

export function ProfileActions({
  slug,
  authed,
  isOwnProfile,
}: {
  slug: string;
  authed: boolean;
  isOwnProfile: boolean;
}) {
  if (isOwnProfile) {
    return (
      <div className="flex flex-wrap gap-2">
        <Link
          href="/me"
          className="border-border bg-surface text-foreground hover:bg-surface-muted inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium"
        >
          Edit my profile
        </Link>
        <GatedAction intent="skill-review" slug={slug} authed={authed} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <GatedAction intent="request-vouch" slug={slug} authed={authed} />
      <GatedAction intent="partner" slug={slug} authed={authed} />
      <GatedAction intent="report" slug={slug} authed={authed} variant="danger" />
      <GatedAction intent="block" slug={slug} authed={authed} variant="danger" />
    </div>
  );
}
