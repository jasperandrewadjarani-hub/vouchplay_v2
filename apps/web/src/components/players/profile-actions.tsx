'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Ban, Handshake, Flag, ClipboardCheck } from 'lucide-react';
import { ReportModal } from '@/components/safety/report-modal';
import { SkillReviewModal } from '@/components/safety/skill-review-modal';
import { BlockControl } from '@/components/safety/block-control';
import { RequestVouchForm } from './request-vouch-form';

/**
 * Profile actions (handover §9.1, §12). Request-a-vouch is a real request (§12); Report, Request
 * skill review, and Block/Unblock are the Phase-4 safety entry points. Partner invites are
 * tournament-scoped today (a standalone Partner Finder is a later phase), so the partner action
 * points players to the working path. Anonymous viewers gate to signup with a resume `next`.
 */
const secondaryBtn =
  'inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2';
const dangerBtn =
  'inline-flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-offset-2';

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
  const params = useSearchParams();
  const intent = params.get('intent');
  const [modal, setModal] = useState<'report' | 'skill-review' | 'request-vouch' | null>(
    !isOwnProfile && authed
      ? intent === 'request-vouch'
        ? 'request-vouch'
        : intent === 'report'
          ? 'report'
          : intent === 'skill-review'
            ? 'skill-review'
            : null
      : null,
  );
  const [partnerNote, setPartnerNote] = useState(false);

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

  // Signed-in viewers get real actions; anonymous viewers gate to signup (resumes after auth).
  const gate = (i: string) => `/signup?next=${encodeURIComponent(`/players/${slug}?intent=${i}`)}`;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {/* Request a vouch (§12) - real request */}
        {authed ? (
          <button type="button" onClick={() => setModal('request-vouch')} className={secondaryBtn}>
            <ClipboardCheck size={15} aria-hidden />
            Request a vouch
          </button>
        ) : (
          <Link href={gate('request-vouch')} className={secondaryBtn}>
            <ClipboardCheck size={15} aria-hidden />
            Request a vouch
          </Link>
        )}

        {/* Request to partner - tournament-scoped today; a standalone finder is a later phase */}
        <span className="relative inline-flex">
          <button
            type="button"
            onClick={() => setPartnerNote((v) => !v)}
            className={secondaryBtn}
            aria-expanded={partnerNote}
          >
            <Handshake size={15} aria-hidden />
            Request to partner
          </button>
          {partnerNote && (
            <span
              role="status"
              className="border-border bg-surface text-foreground-muted absolute top-full left-0 z-10 mt-2 w-64 rounded-xl border p-3 text-xs shadow-lg"
            >
              You partner up inside a tournament: open a{' '}
              <Link href="/tournaments" className="text-primary font-medium">
                tournament
              </Link>{' '}
              and invite {targetName} as your partner when you register. A profile-level Partner
              Finder is coming.
            </span>
          )}
        </span>

        {authed ? (
          <button type="button" onClick={() => setModal('skill-review')} className={secondaryBtn}>
            <ClipboardCheck size={15} aria-hidden />
            Request skill review
          </button>
        ) : (
          <Link href={gate('skill-review')} className={secondaryBtn}>
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
          <Link href={gate('report')} className={dangerBtn}>
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

      {modal === 'request-vouch' && (
        <RequestVouchForm
          recipientId={targetId}
          recipientName={targetName}
          onClose={() => setModal(null)}
        />
      )}
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
