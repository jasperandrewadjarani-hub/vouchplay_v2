'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BottomSheet } from '@/components/tournaments/manage-sheets';
import { FormError } from '@/components/ui/field';
import { adminGetPlayerBadgeDetail } from '@/lib/actions/badges';
import { TagPlayerPanel } from './tag-player-panel';
import type { AdminPlayerBadge } from '@/lib/badges/types';

type PlayerHeader = {
  id: string;
  name: string;
  avatarUrl: string | null;
  csl: number | null;
  sts: number | null;
};

type State =
  | { status: 'loading' }
  | { status: 'ready'; player: PlayerHeader; badges: AdminPlayerBadge[] }
  | { status: 'error'; error: string };

/**
 * The chevron button on each Tag-screen row opens this (master_plan §2BL E): that one player's full
 * badge detail - live badges with Untag, and the removed list with Allow automatic again - reusing
 * `TagPlayerPanel` unchanged (it also still offers a single quick tag, on top of the tray/review
 * batch flow). Untag/allow-auto-again always stay per-player here; nothing is ever removed in bulk.
 */
export function PlayerBadgesSheet({
  playerId,
  onClose,
  onChanged,
}: {
  playerId: string;
  onClose: () => void;
  /** Bubbles up to the Tag screen so the underlying row's badge chips/pill can refresh too. */
  onChanged?: () => void;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(
    async (alive: () => boolean) => {
      const res = await adminGetPlayerBadgeDetail(playerId);
      if (!alive()) return;
      if (res.ok) setState({ status: 'ready', player: res.player, badges: res.badges });
      else setState({ status: 'error', error: res.error });
    },
    [playerId],
  );

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    void load(() => alive);
    return () => {
      alive = false;
    };
  }, [load]);

  function handleChanged() {
    onChanged?.();
    void load(() => true);
  }

  return (
    <BottomSheet title="Player badges" onClose={onClose}>
      {state.status === 'loading' && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="text-foreground-muted size-5 animate-spin" aria-hidden />
        </div>
      )}
      {state.status === 'error' && <FormError>{state.error}</FormError>}
      {state.status === 'ready' && (
        <TagPlayerPanel player={state.player} badges={state.badges} onChanged={handleChanged} />
      )}
    </BottomSheet>
  );
}
