'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Check, X } from 'lucide-react';
import type {
  PartnerCard as PartnerCardData,
  PartnerDeckData,
  PartnerMatchView,
} from '@/lib/partners/types';
import {
  swipePartner,
  undoLastSwipe,
  closePartnerSearch,
  refreshPartnerDeck,
} from '@/lib/actions/partners';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { PartnerCard } from './partner-card';
import { PartnerSearchSheet } from './partner-search-sheet';
import { MatchesList } from './matches-list';
import { MatchModal } from './match-modal';

/** The server bounds a fresh load to the top 30 (master_plan §2AV E) - once a batch comes back
 *  smaller than that, there is nothing more to fetch, so the "top up" refresh below stops asking. */
const FULL_BATCH = 30;
const LOW_WATER_MARK = 5;
const SWIPE_THRESHOLD = 80;

interface SwipeHandle {
  trigger: (direction: 'left' | 'right') => void;
}

/**
 * The top card, draggable with pointer events (mouse and touch alike - dependency-free, no gesture
 * library). A parent-driven `trigger` (via `ref`) plays the same exit animation for the round buttons
 * and the keyboard shortcuts, so there is exactly one swipe animation regardless of how it started.
 * Keyed by `card.playerId` from the caller so a new top card always gets a fresh instance (§2AV E).
 */
const SwipeableCard = forwardRef<
  SwipeHandle,
  { card: PartnerCardData; onSwipe: (direction: 'left' | 'right') => void }
>(function SwipeableCard({ card, onSwipe }, ref) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<'left' | 'right' | null>(null);
  const startX = useRef(0);

  const fire = useCallback(
    (direction: 'left' | 'right') => {
      setExiting(direction);
      setTimeout(() => onSwipe(direction), 180);
    },
    [onSwipe],
  );

  useImperativeHandle(ref, () => ({ trigger: fire }), [fire]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (exiting) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    startX.current = e.clientX;
    setDragging(true);
    setDragX(0);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragX(e.clientX - startX.current);
  }
  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (Math.abs(dragX) > SWIPE_THRESHOLD) {
      fire(dragX > 0 ? 'right' : 'left');
    } else {
      setDragX(0);
    }
  }

  const translate = exiting ? (exiting === 'right' ? 640 : -640) : dragX;
  const rotate = Math.max(-10, Math.min(10, translate / 14));

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        setDragging(false);
        setDragX(0);
      }}
      style={{
        transform: `translateX(${translate}px) rotate(${rotate}deg)`,
        transition: dragging ? 'none' : 'transform 220ms ease, opacity 220ms ease',
        opacity: exiting ? 0 : 1,
        touchAction: 'pan-y',
      }}
      className="cursor-grab select-none active:cursor-grabbing"
    >
      <PartnerCard player={card} />
    </div>
  );
});

function EmptyDeckCard() {
  return (
    <div className="border-border bg-surface flex flex-col items-center gap-1.5 rounded-2xl border p-8 text-center">
      <p className="text-foreground text-base font-semibold">Nobody else yet</p>
      <p className="text-foreground-muted text-sm">
        We&rsquo;ll tell you when someone opts in. Share the tournament to speed it up.
      </p>
    </div>
  );
}

/**
 * Deck state and interaction (master_plan §2AV E/F): opt-in panel when there is no open search, else
 * matches on top, then one card at a time with round buttons, swipe gestures, keyboard shortcuts and
 * Undo. Everything here is optimistic-then-reconciled against the server actions in
 * `lib/actions/partners.ts`.
 */
export function PartnerDeck({ data }: { data: PartnerDeckData }) {
  const { tournament, eligibleDivisions } = data;
  const [search, setSearch] = useState(data.search);
  const [cards, setCards] = useState(data.cards);
  const [matches, setMatches] = useState(data.matches);
  const [swipesLeftToday, setSwipesLeftToday] = useState(data.swipesLeftToday);
  const [canUndo, setCanUndo] = useState(data.canUndo);
  const [hadFullBatch, setHadFullBatch] = useState(data.cards.length >= FULL_BATCH);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [editingSearch, setEditingSearch] = useState(false);
  const [matchModal, setMatchModal] = useState<PartnerMatchView | null>(null);
  const cardRef = useRef<SwipeHandle>(null);

  function applyFreshDeck(fresh: PartnerDeckData) {
    setSearch(fresh.search);
    setCards(fresh.cards);
    setMatches(fresh.matches);
    setSwipesLeftToday(fresh.swipesLeftToday);
    setCanUndo(fresh.canUndo);
    setHadFullBatch(fresh.cards.length >= FULL_BATCH);
    setRemovedIds(new Set());
  }

  async function handleSwipe(target: PartnerCardData, direction: 'left' | 'right') {
    setBusy(true);
    setError(null);
    setCards((prev) => prev.filter((c) => c.playerId !== target.playerId));
    setRemovedIds((prev) => new Set(prev).add(target.playerId));
    const res = await swipePartner(tournament.id, target.playerId, direction);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(target.playerId);
        return next;
      });
      setCards((prev) => [target, ...prev]);
      return;
    }
    setSwipesLeftToday(res.swipesLeftToday);
    setCanUndo(res.canUndo);
    if (res.matched) {
      setMatches((prev) => [res.matched as PartnerMatchView, ...prev]);
      setMatchModal(res.matched);
    }
  }

  function requestSwipe(direction: 'left' | 'right') {
    if (busy || cards.length === 0) return;
    cardRef.current?.trigger(direction);
  }

  // Top up the batch once it runs low, but only when the last load actually had more to give
  // (master_plan §2AV E: the server bounds a load at 30) - freshly fetched cards are filtered against
  // everything already swiped (or dismissed by this visit) so a re-fetch never resurrects a card the
  // player just acted on.
  useEffect(() => {
    if (!search || search.status !== 'open') return;
    if (cards.length >= LOW_WATER_MARK || !hadFullBatch || refreshing) return;
    let cancelled = false;
    setRefreshing(true);
    void refreshPartnerDeck(tournament.slug).then((fresh: PartnerDeckData | null) => {
      if (cancelled || !fresh) {
        setRefreshing(false);
        return;
      }
      setHadFullBatch(fresh.cards.length >= FULL_BATCH);
      setCards((prev) => {
        const known = new Set(prev.map((c) => c.playerId));
        const additions = fresh.cards.filter(
          (c: PartnerCardData) => !known.has(c.playerId) && !removedIds.has(c.playerId),
        );
        return [...prev, ...additions];
      });
      setSwipesLeftToday(fresh.swipesLeftToday);
      setCanUndo(fresh.canUndo);
      setMatches(fresh.matches);
      setRefreshing(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length, hadFullBatch, search?.status]);

  // Keyboard shortcuts (master_plan §2AV E) - ignored while the visitor is typing anywhere else on
  // the page (a note field, the edit-search sheet).
  useEffect(() => {
    if (!search || search.status !== 'open') return;
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        requestSwipe('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        requestSwipe('right');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search?.status, busy, cards.length]);

  async function handleUndo() {
    setUndoing(true);
    setError(null);
    const res = await undoLastSwipe(tournament.id);
    if (!res.ok) {
      setUndoing(false);
      setError(res.error ?? 'Could not undo that.');
      return;
    }
    const fresh = await refreshPartnerDeck(tournament.slug);
    setUndoing(false);
    if (fresh) applyFreshDeck(fresh);
  }

  async function handleStopLooking() {
    setStopping(true);
    setError(null);
    const res = await closePartnerSearch(tournament.id);
    setStopping(false);
    setConfirmStop(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not stop looking for a partner.');
      return;
    }
    setSearch(null);
  }

  // No open search yet (or it was closed) - the opt-in panel, inline (master_plan §2AV B).
  if (!search || search.status === 'closed') {
    return (
      <PartnerSearchSheet
        tournamentId={tournament.id}
        slug={tournament.slug}
        eligibleDivisions={eligibleDivisions}
        onSuccess={applyFreshDeck}
      />
    );
  }

  // `noUncheckedIndexedAccess` means `cards[0]` types as possibly-undefined even after a length
  // check, so pull it out once here and narrow the whole render off this local instead.
  const topCard = cards[0] ?? null;

  return (
    <div className="space-y-5">
      <MatchesList
        matches={matches}
        tournamentSlug={tournament.slug}
        onOpenMatch={(m) => setMatchModal(m)}
      />

      {error && (
        <p role="alert" className="bg-danger/10 text-danger rounded-lg px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {topCard === null ? (
        <EmptyDeckCard />
      ) : (
        <SwipeableCard
          key={topCard.playerId}
          ref={cardRef}
          card={topCard}
          onSwipe={(direction) => handleSwipe(topCard, direction)}
        />
      )}

      {topCard !== null && (
        <div className="flex items-center justify-center gap-10">
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => requestSwipe('left')}
              aria-label="Not now"
              className="border-border text-foreground-muted hover:bg-surface-muted flex h-16 w-16 items-center justify-center rounded-full border-2 transition-transform active:scale-95 disabled:opacity-50"
            >
              <X size={28} aria-hidden />
            </button>
            <span className="text-foreground-muted text-xs font-medium">Not now</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => requestSwipe('right')}
              aria-label="Let's team up"
              className="bg-primary flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50"
            >
              <Check size={28} aria-hidden />
            </button>
            <span className="text-foreground text-xs font-medium">Let&rsquo;s team up</span>
          </div>
        </div>
      )}

      {swipesLeftToday < 20 && (
        <p className="text-foreground-muted text-center text-xs">
          {swipesLeftToday} swipe{swipesLeftToday === 1 ? '' : 's'} left today
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
        <button
          type="button"
          onClick={() => void handleUndo()}
          disabled={!canUndo || undoing}
          className="text-foreground-muted hover:text-foreground underline underline-offset-2 disabled:no-underline disabled:opacity-40"
        >
          {undoing ? 'Undoing…' : 'Undo'}
        </button>
        <button
          type="button"
          onClick={() => setEditingSearch(true)}
          className="text-foreground-muted hover:text-foreground underline underline-offset-2"
        >
          Edit my search
        </button>
        <button
          type="button"
          onClick={() => setConfirmStop(true)}
          className="text-danger underline underline-offset-2"
        >
          Stop looking
        </button>
      </div>

      {confirmStop && (
        <Modal
          title="Stop looking for a partner?"
          onClose={() => setConfirmStop(false)}
          align="center"
        >
          <div className="space-y-4">
            <p className="text-foreground-muted text-sm">Other players will no longer see you.</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirmStop(false)}
                className="flex-1"
              >
                Never mind
              </Button>
              <Button
                type="button"
                onClick={() => void handleStopLooking()}
                disabled={stopping}
                className="flex-1"
              >
                {stopping ? 'Stopping…' : 'Stop looking'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editingSearch && (
        <Modal title="Edit my search" onClose={() => setEditingSearch(false)} align="center">
          <PartnerSearchSheet
            tournamentId={tournament.id}
            slug={tournament.slug}
            eligibleDivisions={eligibleDivisions}
            initial={search}
            editing
            onSuccess={(fresh) => {
              applyFreshDeck(fresh);
              setEditingSearch(false);
            }}
            onCancel={() => setEditingSearch(false)}
          />
        </Modal>
      )}

      {matchModal && (
        <MatchModal
          match={matchModal}
          tournamentSlug={tournament.slug}
          onClose={() => setMatchModal(null)}
        />
      )}
    </div>
  );
}
