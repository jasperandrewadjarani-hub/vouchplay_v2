'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Trophy, Radar, UserSearch } from 'lucide-react';
import { LinkSpinner } from '@/components/ui/link-spinner';
import type { LeaderboardDTO } from '@/lib/leaderboards/types';
import type { PartnerLookingTournament } from '@/lib/partners/deck';
import { AvailabilityModal, type DoorAuthState } from './availability-modal';
import { PartnerTournamentSheet } from '@/components/partners/partner-tournament-sheet';

/**
 * The Players tab's quick bar (master_plan §2BK F), replacing the three tall doors with one row of
 * compact buttons (~52px vs. the old ~120px of chrome). Leaderboards is a plain Link; Find me and
 * Partners open the SAME `AvailabilityModal` / `PartnerTournamentSheet` the old doors used - only the
 * trigger tile's markup changes here, never their behaviour.
 */

const TILE =
  'flex min-h-12 w-full items-center gap-1.5 rounded-2xl border border-border bg-surface p-1.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2';

function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="vp-gradient flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white">
      {children}
    </span>
  );
}

function TileText({
  label,
  caption,
  captionOn = false,
}: {
  label: string;
  caption?: string | null;
  captionOn?: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="text-foreground truncate text-[11.5px] font-extrabold">{label}</span>
      {caption && (
        <span
          className={`truncate text-[10.5px] ${captionOn ? 'text-accent-lime' : 'text-foreground-muted'}`}
        >
          {captionOn && (
            <span
              className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
              style={{ background: 'var(--accent-lime)' }}
              aria-hidden
            />
          )}
          {caption}
        </span>
      )}
    </span>
  );
}

function doorAuthHref(state: DoorAuthState): string {
  return state === 'anon' ? '/login?next=/players' : '/onboarding';
}

/** "Find me" tile (master_plan §2BK F): opens the existing `AvailabilityModal` for an onboarded
 *  viewer; routes an anonymous or not-yet-onboarded one elsewhere instead, same as the old door. */
function FindMeTile({
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
      <Link href={doorAuthHref(authState)} className={TILE} aria-label="Let people find you">
        <IconTile>
          <Radar size={15} aria-hidden />
        </IconTile>
        <TileText label="Find me" caption={authState === 'anon' ? 'Join free' : undefined} />
      </Link>
    );
  }

  const visible = partner || sponsor;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={TILE} aria-haspopup="dialog">
        <IconTile>
          <Radar size={15} aria-hidden />
        </IconTile>
        <TileText label="Find me" caption={visible ? 'Visible' : 'Hidden'} captionOn={visible} />
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

/** "Partners" tile (master_plan §2BK F): exactly one open search → straight to its deck; several or
 *  none → the same chooser sheet the old door used. */
function PartnersTile({
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
      <Link href={`/tournaments/${only.slug}/partners`} className={TILE}>
        <IconTile>
          <UserSearch size={15} aria-hidden />
        </IconTile>
        <TileText label="Partners" caption={caption} />
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className={TILE}
        aria-haspopup="dialog"
      >
        <IconTile>
          <UserSearch size={15} aria-hidden />
        </IconTile>
        <TileText label="Partners" caption={caption} />
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

export function QuickBar({
  authState,
  board,
  lookingForPartner,
  openForSponsorship,
  partnerLooking,
  partnerMatchmakingEnabled,
}: {
  authState: DoorAuthState;
  board: LeaderboardDTO | null;
  lookingForPartner: boolean;
  openForSponsorship: boolean;
  partnerLooking: PartnerLookingTournament[];
  partnerMatchmakingEnabled: boolean;
}) {
  const leader = board?.entries[0];
  const leaderCaption = leader ? `${leader.displayName.split(' ')[0]} is #1` : 'See the boards';

  return (
    <div className={`grid gap-1.5 ${partnerMatchmakingEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
      <Link href="/leaderboards" className={TILE} aria-label="View the community leaderboards">
        <IconTile>
          <Trophy size={15} aria-hidden />
        </IconTile>
        <TileText label="Leaderboards" caption={leaderCaption} />
        <LinkSpinner />
      </Link>

      <FindMeTile
        authState={authState}
        initialLookingForPartner={lookingForPartner}
        initialOpenForSponsorship={openForSponsorship}
      />

      {partnerMatchmakingEnabled && (
        <PartnersTile
          authState={authState}
          tournaments={partnerLooking}
          initialLookingForPartner={lookingForPartner}
          initialOpenForSponsorship={openForSponsorship}
        />
      )}
    </div>
  );
}
