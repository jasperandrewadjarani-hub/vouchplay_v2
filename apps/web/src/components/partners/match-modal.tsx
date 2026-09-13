'use client';

import type { PartnerMatchView } from '@/lib/partners/types';
import { Modal } from '@/components/ui/modal';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { MatchDoorAction } from './matches-list';

/**
 * The match moment (master_plan §2AV F): one sentence, one button, "Later" to dismiss. Deliberately
 * plain - no confetti, no hearts - a match reveals nothing beyond the profile.
 */
export function MatchModal({
  match,
  tournamentSlug,
  onClose,
}: {
  match: PartnerMatchView;
  tournamentSlug: string;
  onClose: () => void;
}) {
  return (
    <Modal
      title={`You matched with ${match.partner.displayName}`}
      subtitle={`for ${match.divisions.map((d) => d.name).join(', ')}`}
      onClose={onClose}
      align="center"
    >
      <div className="space-y-4 text-center">
        <PlayerAvatar
          url={match.partner.avatarUrl}
          initials={match.partner.initials}
          name={match.partner.displayName}
          size="lg"
          className="mx-auto"
        />
        <div className="flex justify-center">
          <MatchDoorAction match={match} tournamentSlug={tournamentSlug} />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-foreground-muted hover:text-foreground min-h-11 w-full text-center text-sm font-medium"
        >
          Later
        </button>
      </div>
    </Modal>
  );
}
