'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Ban, Handshake, Flag, ClipboardCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ReportModal } from '@/components/safety/report-modal';
import { SkillReviewModal } from '@/components/safety/skill-review-modal';
import { BlockControl } from '@/components/safety/block-control';

/**
 * Profile actions (handover §9.1). Phase 4 wires the real Safety & Moderation entry points: Report,
 * Request skill review, and Block/Unblock. Request-a-vouch and partner invites remain gated stubs
 * until their UI phases. Anonymous viewers gate to signup with a resume `next`.
 */
type StubIntent = 'request-vouch' | 'partner';

const STUBS: Record<StubIntent, { label: string; icon: LucideIcon; soon: string }> = {
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
};

const secondaryBtn =
  'inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2';
const dangerBtn =
  'inline-flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-offset-2';

function StubAction({
  intent,
  slug,
  authed,
}: {
  intent: StubIntent;
  slug: string;
  authed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { label, icon: Icon, soon } = STUBS[intent];

  if (!authed) {
    const next = `/players/${slug}?intent=${intent}`;
    return (
      <Link href={`/signup?next=${encodeURIComponent(next)}`} className={secondaryBtn}>
        <Icon size={15} aria-hidden />
        {label}
      </Link>
    );
  }
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={secondaryBtn}
        aria-expanded={open}
      >
        <Icon size={15} aria-hidden />
        {label}
      </button>
      {open && (
        <span
          role="status"
          className="border-border bg-surface text-foreground-muted absolute top-full left-0 z-10 mt-2 w-60 rounded-xl border p-3 text-xs shadow-lg"
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
  targetId,
  targetName,
  iBlocked,
}: {
  slug: string;
  authed: boolean;
  isOwnProfile: boolean;
  targetId: string;
  targetName: string;
  iBlocked: boolean;
}) {
  const [modal, setModal] = useState<'report' | 'skill-review' | null>(null);

  if (isOwnProfile) {
    return (
      <div className="flex flex-wrap gap-2">
        <Link href="/me" className={secondaryBtn}>
          Edit my profile
        </Link>
        <Link href="/me/blocked" className={secondaryBtn}>
          <Ban size={15} aria-hidden />
          Blocked users
        </Link>
      </div>
    );
  }

  // Signed-in viewers get real actions; anonymous viewers gate to signup.
  const gateReport = `/signup?next=${encodeURIComponent(`/players/${slug}?intent=report`)}`;
  const gateReview = `/signup?next=${encodeURIComponent(`/players/${slug}?intent=skill-review`)}`;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <StubAction intent="request-vouch" slug={slug} authed={authed} />
        <StubAction intent="partner" slug={slug} authed={authed} />

        {authed ? (
          <button type="button" onClick={() => setModal('skill-review')} className={secondaryBtn}>
            <ClipboardCheck size={15} aria-hidden />
            Request skill review
          </button>
        ) : (
          <Link href={gateReview} className={secondaryBtn}>
            <ClipboardCheck size={15} aria-hidden />
            Request skill review
          </Link>
        )}

        {authed ? (
          <button type="button" onClick={() => setModal('report')} className={dangerBtn}>
            <Flag size={15} aria-hidden />
            Report
          </button>
        ) : (
          <Link href={gateReport} className={dangerBtn}>
            <Flag size={15} aria-hidden />
            Report
          </Link>
        )}

        {authed && (
          <BlockControl
            targetId={targetId}
            slug={slug}
            targetName={targetName}
            initiallyBlocked={iBlocked}
          />
        )}
      </div>

      {modal === 'report' && (
        <ReportModal
          targetType="player"
          targetId={targetId}
          targetLabel={targetName}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'skill-review' && (
        <SkillReviewModal
          targetPlayerId={targetId}
          targetName={targetName}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
