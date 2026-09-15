'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ThumbsUp, CheckCircle2 } from 'lucide-react';
import { LinkSpinner } from '@/components/ui/link-spinner';
import { Modal } from '@/components/ui/modal';
import { formatVouchCooldown } from '@/lib/vouches/cooldown';
import { VouchForm } from './vouch-form';

/** sessionStorage key a card's Vouch link stamps right before it navigates to the profile to submit
 *  the vouch there (master_plan §2BK F "vouch reward"). Read once, on mount, by the SAME slug's card
 *  when it next renders with `hasVouched` true - i.e. after "Back to players" returns from a
 *  successful submission - so the "+1" plays exactly once, on the card that started it, without
 *  touching the vouch form or its server action at all. */
function justVouchedKey(slug: string): string {
  return `vp:justVouched:${slug}`;
}

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
  newcomerLimit = 0,
  minimalPower = false,
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
  /** Newcomer vouch cap to show in the form (§2AJ); 0 = viewer is established / no cap. */
  newcomerLimit?: number;
  /** The viewer is a minimal account right now (§2AN d5) - the form shows one line explaining why their vouch counts for less. */
  minimalPower?: boolean;
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
  // Vouch micro-reward (master_plan §2BK F): "+1" floats off the button once, the moment a card
  // discovers its OWN just-started vouch went through. Never fires on first load for someone who
  // already had a standing vouch - only when the sessionStorage marker this same card stamped is
  // still there to be claimed.
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    if (mode !== 'card' || !hasVouched || typeof window === 'undefined') return;
    try {
      const key = justVouchedKey(slug);
      if (!window.sessionStorage.getItem(key)) return;
      window.sessionStorage.removeItem(key);
    } catch {
      return;
    }
    setPopping(true);
    try {
      navigator.vibrate?.(18);
    } catch {
      // Best-effort haptic only - iOS Safari has no navigator.vibrate at all.
    }
    const timer = setTimeout(() => setPopping(false), 900);
    return () => clearTimeout(timer);
  }, [mode, hasVouched, slug]);

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
      className={`${btn} ${vouchedCls} relative`}
      aria-label={`You vouched for ${label}`}
    >
      <CheckCircle2 size={iconSize} aria-hidden />
      Vouched
      {popping && (
        <span
          aria-hidden
          className="text-accent-lime vp-vouch-pop pointer-events-none absolute -top-2 right-1 text-xs font-extrabold motion-reduce:hidden"
        >
          +1
        </span>
      )}
    </button>
  ) : mode === 'card' ? (
    <Link
      href={`/players/${slug}?intent=vouch`}
      onClick={() => {
        // Stamped right before the trip to the profile - the far side of that trip (submitting the
        // vouch, then "Back to players") is completely untouched (§2Y's fixed-position overlay
        // structure below is also untouched); this only decides whether THIS card plays the reward
        // once its own hasVouched flips true.
        try {
          window.sessionStorage.setItem(justVouchedKey(slug), '1');
        } catch {
          // Private browsing / storage disabled: the reward simply never plays - not load-bearing.
        }
      }}
      className={`${btn} ${primaryCls}`}
    >
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
          newcomerLimit={newcomerLimit}
          minimalPower={minimalPower}
          onClose={() => setFormOpen(false)}
        />
      )}
    </>
  );
}
