'use client';

import { useMemo, useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { badgeDef } from '@vouchplay/config';
import { BadgeSymbol } from '@/components/badges/badge-symbol';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { nameInitials } from '@/lib/storage';
import { BottomSheet } from '@/components/tournaments/manage-sheets';
import { Field, Input, Select, FormError } from '@/components/ui/field';
import { adminTagBadgesBatch } from '@/lib/actions/badges';
import type { AdminBadgeTagPlayer } from '@/lib/admin/user-queries';

const EXPIRY_OPTIONS = [
  { value: '', label: 'Follows the rule' },
  { value: 'never', label: 'No expiry' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '6 months' },
  { value: '365', label: '1 year' },
] as const;

/**
 * The final confirm step of Admin → Badges' single-screen batch tagging (master_plan §2BL E): the
 * chosen badges, every selected player (removable here without leaving the sheet), event/division/
 * reason, an expiry choice for time-bound badges, a client-computed preview ("n new tags · n
 * skipped"), and the submit that calls `adminTagBadgesBatch`.
 *
 * The preview is deliberately approximate: it only knows each player's CURRENT live badge keys (not
 * their source), so it can't distinguish "already an admin grant" (server will skip) from "currently
 * automatic" (server will convert and count as tagged). The server's own counts, shown in the
 * post-submit toast, are the source of truth.
 */
export function ReviewSheet({
  chosenBadgeKeys,
  selectedPlayers,
  onRemovePlayer,
  onClose,
  onSubmitted,
}: {
  chosenBadgeKeys: string[];
  selectedPlayers: AdminBadgeTagPlayer[];
  onRemovePlayer: (id: string) => void;
  onClose: () => void;
  onSubmitted: (message: string) => void;
}) {
  const [event, setEvent] = useState('');
  const [division, setDivision] = useState('');
  const [reason, setReason] = useState('');
  const [expiryChoice, setExpiryChoice] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const defs = useMemo(
    () => chosenBadgeKeys.map((k) => badgeDef(k)).filter(Boolean),
    [chosenBadgeKeys],
  );
  const hasTitleBadge = defs.some((d) => d?.titleBadge);
  const hasTimeBound = defs.some((d) => d?.timeBound);

  const preview = useMemo(() => {
    let skipped = 0;
    for (const p of selectedPlayers) {
      for (const key of chosenBadgeKeys) {
        if (p.badgeKeys.includes(key)) skipped += 1;
      }
    }
    const totalPairs = chosenBadgeKeys.length * selectedPlayers.length;
    return { newTags: totalPairs - skipped, skipped };
  }, [chosenBadgeKeys, selectedPlayers]);

  function playerNote(p: AdminBadgeTagPlayer): string | null {
    const already = chosenBadgeKeys
      .filter((k) => p.badgeKeys.includes(k))
      .map((k) => badgeDef(k)?.name ?? k);
    if (already.length === 0) return null;
    return `has ${already.join(' · ')}`;
  }

  function computeExpiresAt(): string | null | undefined {
    if (expiryChoice === '') return undefined;
    if (expiryChoice === 'never') return null;
    const days = Number(expiryChoice);
    if (!Number.isFinite(days) || days <= 0) return undefined;
    return new Date(Date.now() + days * 86400000).toISOString();
  }

  function submit() {
    if (chosenBadgeKeys.length === 0 || selectedPlayers.length === 0) return;
    if (reason.trim().length < 3) {
      setError('Give a reason of at least 3 characters.');
      return;
    }
    if (hasTitleBadge && !event.trim()) {
      setError('One of these badges names an event - give the tournament/event name.');
      return;
    }
    setError(null);
    start(async () => {
      const res = await adminTagBadgesBatch({
        playerIds: selectedPlayers.map((p) => p.id),
        badgeKeys: chosenBadgeKeys,
        reason: reason.trim(),
        event: hasTitleBadge ? event.trim() : undefined,
        division: hasTitleBadge && division.trim() ? division.trim() : undefined,
        expiresAt: computeExpiresAt(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSubmitted(res.message);
    });
  }

  return (
    <BottomSheet
      title="Review tags"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={pending || chosenBadgeKeys.length === 0 || selectedPlayers.length === 0}
          className="vp-gradient min-h-[44px] w-full rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
        >
          {pending
            ? 'Tagging…'
            : `Tag ${selectedPlayers.length} player${selectedPlayers.length === 1 ? '' : 's'}`}
        </button>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {chosenBadgeKeys.map((key) => {
            const def = badgeDef(key);
            if (!def) return null;
            return (
              <span
                key={key}
                className="border-border bg-surface-muted flex shrink-0 items-center gap-1.5 rounded-full border py-1 pr-3 pl-1"
              >
                <BadgeSymbol badgeKey={key} size={22} />
                <span className="text-foreground text-xs font-semibold whitespace-nowrap">
                  {def.name}
                </span>
              </span>
            );
          })}
        </div>

        <div>
          <h3 className="text-foreground-muted mb-2 text-xs font-semibold tracking-wide uppercase">
            Players ({selectedPlayers.length})
          </h3>
          <ul className="space-y-1.5">
            {selectedPlayers.map((p) => {
              const note = playerNote(p);
              return (
                <li
                  key={p.id}
                  className="border-border bg-surface flex items-center gap-2.5 rounded-xl border p-2"
                >
                  <PlayerAvatar
                    url={p.avatarUrl}
                    initials={nameInitials(p.name)}
                    name={p.name}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate text-sm font-medium">{p.name}</p>
                    {note && <p className="text-foreground-muted text-xs">{note}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemovePlayer(p.id)}
                    aria-label={`Remove ${p.name}`}
                    className="text-foreground-muted hover:text-danger -m-1.5 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg"
                  >
                    <X size={16} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-3">
          {hasTitleBadge && (
            <Field
              label="Event"
              htmlFor="batch-event"
              required
              hint="Covers a title won outside VouchPlay."
            >
              <Input
                id="batch-event"
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                placeholder="e.g. Mindanao Open 2025"
              />
            </Field>
          )}

          {hasTitleBadge && (
            <Field label="Division" htmlFor="batch-division">
              <Input
                id="batch-division"
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          )}

          <Field
            label="Reason"
            htmlFor="batch-reason"
            required
            hint="Goes in the audit log, once per player."
          >
            <textarea
              id="batch-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="border-border bg-background w-full rounded-xl border px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            />
          </Field>

          {hasTimeBound && (
            <Field label="Expiry" htmlFor="batch-expiry">
              <Select
                id="batch-expiry"
                value={expiryChoice}
                onChange={(e) => setExpiryChoice(e.target.value)}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <div className="border-border bg-surface-muted flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs">
          <span className="text-foreground font-semibold">{preview.newTags} new tags</span>
          <span className="text-foreground-muted">{preview.skipped} skipped</span>
        </div>

        {error && <FormError>{error}</FormError>}
      </div>
    </BottomSheet>
  );
}
