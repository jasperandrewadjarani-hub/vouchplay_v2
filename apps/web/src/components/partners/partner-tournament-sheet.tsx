'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, UserSearch } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import type { PartnerLookingTournament } from '@/lib/partners/deck';
import {
  DOOR_CLASSES,
  DoorIconTile,
  DoorLabel,
  DoorCaption,
  AvailabilityModal,
  type DoorAuthState,
} from '@/components/players/availability-modal';
import { describe } from './partner-looking-strip';

/**
 * "Find a partner" door (master_plan §2BC decision A). Exactly one tournament with an open search:
 * a plain Link straight to its deck. Several: a door that opens `PartnerTournamentSheet` listing
 * them. None: the same sheet, but with a "Mark me as looking" way in.
 */
export function PartnerFinderDoor({
  authState,
  tournaments,
  initialLookingForPartner,
  initialOpenForSponsorship,
}: {
  authState: DoorAuthState;
  tournaments: PartnerLookingTournament[];
  initialLookingForPartner: boolean;
  initialOpenForSponsorship: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [partner, setPartner] = useState(initialLookingForPartner);
  const [sponsor, setSponsor] = useState(initialOpenForSponsorship);

  const lookingCount = tournaments.reduce((sum, t) => sum + t.lookingCount, 0);
  const caption = lookingCount > 0 ? `${lookingCount} looking` : 'Swipe to match';

  if (tournaments.length === 1 && tournaments[0]) {
    const only = tournaments[0];
    return (
      <Link href={`/tournaments/${only.slug}/partners`} className={DOOR_CLASSES}>
        <DoorIconTile>
          <UserSearch size={18} aria-hidden />
        </DoorIconTile>
        <DoorLabel>Find a partner</DoorLabel>
        <DoorCaption>{caption}</DoorCaption>
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className={DOOR_CLASSES}
        aria-haspopup="dialog"
      >
        <DoorIconTile>
          <UserSearch size={18} aria-hidden />
        </DoorIconTile>
        <DoorLabel>Find a partner</DoorLabel>
        <DoorCaption>{caption}</DoorCaption>
      </button>
      {sheetOpen && (
        <PartnerTournamentSheet
          tournaments={tournaments}
          authState={authState}
          onClose={() => setSheetOpen(false)}
          onMarkMeAsLooking={() => {
            setSheetOpen(false);
            setModalOpen(true);
          }}
        />
      )}
      {modalOpen && (
        <AvailabilityModal
          lookingForPartner={partner}
          openForSponsorship={sponsor}
          onPartnerChange={setPartner}
          onSponsorChange={setSponsor}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

/**
 * The chooser sheet (master_plan §2BC decision A). Several tournaments: each row is the strip's own
 * style (name, `describe()` line, "Open my deck" pill where the viewer already searches). None: one
 * line plus a primary "Mark me as looking" way in - a Link to sign in for an anonymous viewer, a Link
 * to finish onboarding for a signed-in but not-yet-onboarded one, else a button that hands off to the
 * availability modal.
 */
export function PartnerTournamentSheet({
  tournaments,
  authState,
  onClose,
  onMarkMeAsLooking,
}: {
  tournaments: PartnerLookingTournament[];
  authState: DoorAuthState;
  onClose: () => void;
  onMarkMeAsLooking: () => void;
}) {
  if (tournaments.length === 0) {
    return (
      <Modal title="Find a partner" onClose={onClose} align="center">
        <p className="text-foreground-muted text-sm">No one is looking for a partner right now.</p>
        {authState === 'onboarded' ? (
          <button
            type="button"
            onClick={onMarkMeAsLooking}
            className="bg-primary hover:bg-primary/90 mt-5 w-full rounded-xl py-3 text-sm font-semibold text-white transition-colors"
          >
            Mark me as looking
          </button>
        ) : (
          <Link
            href={authState === 'anon' ? '/login?next=/players' : '/onboarding'}
            className="bg-primary hover:bg-primary/90 mt-5 flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition-colors"
          >
            Mark me as looking
          </Link>
        )}
      </Modal>
    );
  }

  return (
    <Modal title="Find a partner" onClose={onClose} align="sheet">
      <ul className="divide-border -mx-5 divide-y sm:-mx-6">
        {tournaments.map((t) => (
          <li key={t.slug}>
            <Link
              href={`/tournaments/${t.slug}/partners`}
              className="hover:bg-surface-muted flex min-h-14 items-center gap-3 px-5 py-2.5 transition-colors sm:px-6"
              onClick={onClose}
            >
              <span className="min-w-0 flex-1">
                <span className="text-foreground block truncate text-sm font-medium">{t.name}</span>
                <span className="text-foreground-muted block truncate text-xs">{describe(t)}</span>
              </span>
              {t.viewerSearchOpen ? (
                <span className="bg-primary/15 text-primary shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold">
                  Open my deck
                </span>
              ) : (
                <span className="text-primary shrink-0 text-xs font-semibold">Find a partner</span>
              )}
              <ChevronRight size={16} className="text-foreground-muted shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
