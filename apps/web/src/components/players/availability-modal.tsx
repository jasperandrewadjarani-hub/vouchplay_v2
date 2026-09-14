'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Radar } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { AvailabilityToggle } from './availability-toggles';

/** Shared door tile styling (master_plan §2BC decision A): icon tile on top, label below, one
 *  optional muted caption line - the whole card is the tap target. */
export const DOOR_CLASSES =
  'border-border bg-surface hover:bg-surface-muted flex w-full min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border p-2.5 text-center transition-colors';

export function DoorIconTile({ children }: { children: ReactNode }) {
  return (
    <span className="vp-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white">
      {children}
    </span>
  );
}

export function DoorLabel({ children }: { children: ReactNode }) {
  return <span className="text-foreground text-xs leading-tight font-semibold">{children}</span>;
}

export function DoorCaption({ children }: { children: ReactNode }) {
  return (
    <span className="text-foreground-muted block w-full truncate text-[11px]">{children}</span>
  );
}

/** Viewer state a door reacts to (master_plan §2BC): anon and not-yet-onboarded viewers get routed
 *  elsewhere instead of the modal/sheet, since neither has a profile to toggle. */
export type DoorAuthState = 'anon' | 'not_onboarded' | 'onboarded';

function doorAuthHref(state: DoorAuthState): string {
  return state === 'anon' ? '/login?next=/players' : '/onboarding';
}

function availabilityCaption(partner: boolean, sponsor: boolean): string {
  if (partner && sponsor) return 'Partner · Sponsor';
  if (partner) return 'Partner';
  if (sponsor) return 'Sponsor';
  return 'Off';
}

/**
 * "Let people find you" door (master_plan §2BC decision A/B). An onboarded viewer opens
 * `AvailabilityModal`; an anonymous or not-yet-onboarded viewer gets a plain Link instead, since
 * there is no profile yet to toggle. Local optimistic state keeps the caption in sync with the
 * switch without waiting on the `router.refresh()` the toggle already triggers.
 */
export function AvailabilityDoor({
  authState,
  initialLookingForPartner,
  initialOpenForSponsorship,
}: {
  authState: DoorAuthState;
  initialLookingForPartner: boolean;
  initialOpenForSponsorship: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [partner, setPartner] = useState(initialLookingForPartner);
  const [sponsor, setSponsor] = useState(initialOpenForSponsorship);

  if (authState !== 'onboarded') {
    return (
      <Link
        href={doorAuthHref(authState)}
        className={DOOR_CLASSES}
        aria-label="Let people find you"
      >
        <DoorIconTile>
          <Radar size={18} aria-hidden />
        </DoorIconTile>
        <DoorLabel>Let people find you</DoorLabel>
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={DOOR_CLASSES}
        aria-haspopup="dialog"
      >
        <DoorIconTile>
          <Radar size={18} aria-hidden />
        </DoorIconTile>
        <DoorLabel>Let people find you</DoorLabel>
        <DoorCaption>{availabilityCaption(partner, sponsor)}</DoorCaption>
      </button>
      {open && (
        <AvailabilityModal
          lookingForPartner={partner}
          openForSponsorship={sponsor}
          onPartnerChange={setPartner}
          onSponsorChange={setSponsor}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * The modal itself (master_plan §2BC decision B): title, the two existing `AvailabilityToggle` rows
 * unchanged, one full-width Done button. No other text - the toggle labels already say what's on.
 */
export function AvailabilityModal({
  lookingForPartner,
  openForSponsorship,
  onPartnerChange,
  onSponsorChange,
  onClose,
}: {
  lookingForPartner: boolean;
  openForSponsorship: boolean;
  onPartnerChange: (next: boolean) => void;
  onSponsorChange: (next: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Let people find you" onClose={onClose} align="center">
      <div className="space-y-4">
        <AvailabilityToggle kind="partner" initial={lookingForPartner} onChange={onPartnerChange} />
        <AvailabilityToggle
          kind="sponsor"
          initial={openForSponsorship}
          onChange={onSponsorChange}
        />
      </div>
      <button
        type="button"
        onClick={onClose}
        className="bg-primary hover:bg-primary/90 mt-5 w-full rounded-xl py-3 text-sm font-semibold text-white transition-colors"
      >
        Done
      </button>
    </Modal>
  );
}
