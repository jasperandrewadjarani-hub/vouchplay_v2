'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ThumbsUp, CheckCircle2 } from 'lucide-react';
import { LinkSpinner } from '@/components/ui/link-spinner';
import { Modal } from '@/components/ui/modal';
import { formatVouchCooldown } from '@/lib/vouches/cooldown';
import { VouchForm } from './vouch-form';

/**
 * Vouch entry point + auth gate (handover §8.1, §9.1; §2U/§2V).
 *  - Anonymous → signup carrying `next=/players/{slug}?intent=vouch` (resumes after auth).
 *  - Not yet vouched, on a card → link to the profile with the vouch intent (the form lives there).
 *  - Not yet vouched, on the profile → opens the vouch form (auto-opens when arriving ?intent=vouch).
 *  - ALREADY vouched → the button reads "Vouched" and opens a confirm dialog instead of the form:
 *    within the update cooldown it explains when they can change it; otherwise it offers to change or
 *    withdraw (which opens the form on the profile, or routes there from a card). This stops a tap on
 *    an already-cast vouch from dropping straight into the form (§2V).
 */
export function VouchButton({
  slug,
  targetId,
  targetName,
  authed,
  isOwnProfile = false,
  viewerIsCoach = false,
  hasVouched = false,
  canUpdateInMs = null,
  size = 'md',
  mode = 'card',
}: {
  slug: string;
  /** Required only for `mode="profile"` (the form needs the target uuid). */
  targetId?: string;
  targetName?: string;
  authed: boolean;
  isOwnProfile?: boolean;
  viewerIsCoach?: boolean;
  /** The viewer already has an active vouch for this player - shows the "Vouched" state (§2U). */
  hasVouched?: boolean;
  /** Ms left on the update cooldown (0 = changeable now, null = n/a); drives the dialog copy (§2V). */
  canUpdateInMs?: number | null;
  size?: 'sm' | 'md';
  mode?: 'card' | 'profile';
}) {
  const router = useRouter();
  const params = useSearchParams();
  const resumed = params.get('intent') === 'vouch';
  const [formOpen, setFormOpen] = useState(
    mode === 'profile' && resumed && authed && !isOwnProfile,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';
  const btn = `inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${pad}`;
  const iconSize = size === 'sm' ? 14 : 16;
  // "Already vouched" look: a calm success-tinted outline (not the loud primary fill), so it reads as
  // done rather than a fresh call to action - while staying tappable to change or withdraw (§2U).
  const vouchedCls = 'border border-success/50 bg-success/10 text-success hover:bg-success/15';
  const primaryCls = 'bg-primary text-white hover:opacity-90';
  const label = targetName ?? 'this player';

  if (isOwnProfile) {
    return (
      <span className={`${btn} border-border text-foreground-muted cursor-not-allowed border`}>
        <ThumbsUp size={iconSize} aria-hidden />
        Vouch
      </span>
    );
  }

  if (!authed) {
    const next = `/players/${slug}?intent=vouch`;
    return (
      <Link href={`/signup?next=${encodeURIComponent(next)}`} className={`${btn} ${primaryCls}`}>
        <ThumbsUp size={iconSize} aria-hidden />
        Vouch
      </Link>
    );
  }

  // Authed and not own profile. The trigger varies by state, but the overlays (confirm dialog + the
  // vouch form) are rendered in ONE FIXED position below - never inside a state-specific branch. A
  // successful vouch flips hasVouched on refresh; if the form lived in a branch it would remount and
  // wipe its own "vouch submitted" confirmation, which is the bug this structure prevents (§2Y).
  const inCooldown = typeof canUpdateInMs === 'number' && canUpdateInMs > 0;
  const startChange = () => {
    setConfirmOpen(false);
    if (mode === 'profile' && targetId) setFormOpen(true);
    else router.push(`/players/${slug}?intent=vouch`);
  };

  const trigger = hasVouched ? (
    <button
      type="button"
      onClick={() => setConfirmOpen(true)}
      className={`${btn} ${vouchedCls}`}
      aria-label={`You vouched for ${label}`}
    >
      <CheckCircle2 size={iconSize} aria-hidden />
      Vouched
    </button>
  ) : mode === 'card' ? (
    <Link href={`/players/${slug}?intent=vouch`} className={`${btn} ${primaryCls}`}>
      <ThumbsUp size={iconSize} aria-hidden />
      Vouch
      <LinkSpinner size={iconSize} />
    </Link>
  ) : (
    <button type="button" onClick={() => setFormOpen(true)} className={`${btn} ${primaryCls}`}>
      <ThumbsUp size={iconSize} aria-hidden />
      Vouch
    </button>
  );

  return (
    <>
      {trigger}

      {confirmOpen && (
        <Modal title="You’ve already vouched" onClose={() => setConfirmOpen(false)} align="center">
          {inCooldown ? (
            <div className="space-y-4">
              <p className="text-foreground-muted text-sm">
                You’ve already vouched for {label}. You can change or withdraw your vouch in{' '}
                <span className="text-foreground font-semibold">
                  {formatVouchCooldown(canUpdateInMs as number)}
                </span>
                .
              </p>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className={`${btn} ${primaryCls} w-full`}
              >
                Got it
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-foreground-muted text-sm">
                You’ve already vouched for {label}. Would you like to change or withdraw your vouch?
              </p>
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={startChange}
                  className={`${btn} ${primaryCls} flex-1`}
                >
                  Change my vouch
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className={`${btn} border-border text-foreground flex-1 border`}
                >
                  Not now
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {formOpen && targetId && (
        <VouchForm
          targetId={targetId}
          targetName={label}
          viewerIsCoach={viewerIsCoach}
          onClose={() => setFormOpen(false)}
        />
      )}
    </>
  );
}
