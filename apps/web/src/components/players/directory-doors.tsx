import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { LinkSpinner } from '@/components/ui/link-spinner';
import type { LeaderboardDTO } from '@/lib/leaderboards/types';
import type { PartnerLookingTournament } from '@/lib/partners/deck';
import {
  DOOR_CLASSES,
  DoorIconTile,
  DoorLabel,
  DoorCaption,
  AvailabilityDoor,
  type DoorAuthState,
} from './availability-modal';
import { PartnerFinderDoor } from '@/components/partners/partner-tournament-sheet';

/**
 * The Players tab's one row of doors (master_plan §2BC decision A), replacing the three stacked
 * blocks (leaderboards card, availability toggles card, partner-looking strip) that used to sit
 * above the list. Leaderboards is a plain Link; the other two open a modal or chooser sheet and are
 * client components. `grid-cols-2` when partner matchmaking is off - the "Find a partner" door is
 * omitted entirely rather than shown disabled.
 */
export function DirectoryDoors({
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
  const leaderCaption = leader ? `${leader.displayName.split(' ')[0]} leads` : null;

  return (
    <div className={`grid gap-2 ${partnerMatchmakingEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
      <Link
        href="/leaderboards"
        className={DOOR_CLASSES}
        aria-label="View the community leaderboards"
      >
        <DoorIconTile>
          <Trophy size={18} aria-hidden />
        </DoorIconTile>
        <DoorLabel>Leaderboards</DoorLabel>
        {leaderCaption && <DoorCaption>{leaderCaption}</DoorCaption>}
        <LinkSpinner />
      </Link>

      <AvailabilityDoor
        authState={authState}
        initialLookingForPartner={lookingForPartner}
        initialOpenForSponsorship={openForSponsorship}
      />

      {partnerMatchmakingEnabled && (
        <PartnerFinderDoor
          authState={authState}
          tournaments={partnerLooking}
          initialLookingForPartner={lookingForPartner}
          initialOpenForSponsorship={openForSponsorship}
        />
      )}
    </div>
  );
}
