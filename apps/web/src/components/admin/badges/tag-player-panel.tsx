'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BADGES, BADGE_FAMILIES, badgeDef } from '@vouchplay/config';
import { BadgeSymbol } from '@/components/badges/badge-symbol';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { nameInitials } from '@/lib/storage';
import { formatDate } from '@/lib/format-date';
import { Field, Input, FormError, FormMessage } from '@/components/ui/field';
import { adminTagBadge } from '@/lib/actions/badges';
import { UntagControl } from './untag-control';
import { AllowAutoAgainButton } from './allow-auto-again-button';
import type { AdminPlayerBadge } from '@/lib/badges/types';

interface PlayerHeader {
  id: string;
  name: string;
  avatarUrl: string | null;
  csl: number | null;
  sts: number | null;
}

/**
 * The selected-player view of Admin → Badges "Tag a player" (master_plan §2BK B): the player's live
 * + removed badges, and a grid of every catalog badge an admin can tag onto them - including normally
 * automatic ones, which Jasper's hard requirement calls out explicitly.
 */
export function TagPlayerPanel({
  player,
  badges,
}: {
  player: PlayerHeader;
  badges: AdminPlayerBadge[];
}) {
  const live = badges.filter((b) => !b.revokedAt);
  const revoked = badges.filter((b) => b.revokedAt);
  const heldKeys = new Set(live.map((b) => b.key));
  const firstName = player.name.trim().split(/\s+/)[0] || player.name;

  return (
    <div className="space-y-5">
      <header className="border-border bg-surface vp-card flex items-center gap-3 rounded-2xl border p-3">
        <PlayerAvatar
          url={player.avatarUrl}
          initials={nameInitials(player.name)}
          name={player.name}
          size="md"
        />
        <div className="min-w-0">
          <p className="text-foreground truncate text-base font-semibold">{player.name}</p>
          <p className="text-foreground-muted text-xs">
            {player.csl != null ? `Community skill ${player.csl}` : 'Unrated'}
            {player.sts != null ? ` · STS ${player.sts.toFixed(1)}` : ''}
          </p>
        </div>
      </header>

      <section>
        <h2 className="text-foreground mb-2 text-sm font-semibold">Their badges</h2>
        {live.length === 0 ? (
          <p className="text-foreground-muted text-sm">No badges yet.</p>
        ) : (
          <ul className="space-y-2">
            {live.map((b) => (
              <li key={b.id} className="border-border bg-surface rounded-xl border p-3">
                <div className="flex items-start gap-3">
                  <BadgeSymbol badgeKey={b.key} size={32} number={b.meta.number} />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground text-sm font-semibold">{b.name}</p>
                    <p className="text-foreground-muted text-xs">
                      {b.source === 'auto'
                        ? 'Earned automatically'
                        : `Tagged by ${b.grantedByName ?? 'an admin'}`}
                      {' · '}
                      {formatDate(b.awardedAt)}
                      {b.expiresAt ? ` · expires ${formatDate(b.expiresAt)}` : ''}
                    </p>
                    {badgeCaption(b) && (
                      <p className="text-foreground-muted text-xs">{badgeCaption(b)}</p>
                    )}
                  </div>
                </div>
                <div className="mt-2">
                  <UntagControl playerBadgeId={b.id} badgeName={b.name} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {revoked.length > 0 && (
          <details className="border-border bg-surface mt-3 rounded-xl border">
            <summary className="text-foreground-muted min-h-[44px] cursor-pointer p-3 text-xs font-semibold">
              Removed ({revoked.length})
            </summary>
            <ul className="divide-border divide-y">
              {revoked.map((b) => (
                <li key={b.id} className="p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <BadgeSymbol badgeKey={b.key} size={20} muted />
                    <span className="text-foreground font-medium">{b.name}</span>
                    <span className="text-foreground-muted ml-auto">{formatDate(b.revokedAt)}</span>
                  </div>
                  {b.revokeReason && <p className="text-foreground-muted mt-1">{b.revokeReason}</p>}
                  {b.autoBlocked && (
                    <div className="mt-2">
                      <AllowAutoAgainButton playerId={player.id} badgeKey={b.key} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section>
        <h2 className="text-foreground mb-2 text-sm font-semibold">Tag a badge</h2>
        <BadgeGrid heldKeys={heldKeys} playerId={player.id} firstName={firstName} />
      </section>
    </div>
  );
}

function badgeCaption(b: AdminPlayerBadge): string | null {
  const parts: string[] = [];
  if (b.tally > 1) parts.push(`×${b.tally}`);
  if (b.meta.number) parts.push(`#${b.meta.number}`);
  if (b.meta.event) parts.push(b.meta.event);
  if (b.meta.division) parts.push(b.meta.division);
  if (b.meta.medal) parts.push(b.meta.medal);
  return parts.length ? parts.join(' · ') : null;
}

function BadgeGrid({
  heldKeys,
  playerId,
  firstName,
}: {
  heldKeys: Set<string>;
  playerId: string;
  firstName: string;
}) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [eventName, setEventName] = useState('');
  const [division, setDivision] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const def = selectedKey ? badgeDef(selectedKey) : null;

  function selectBadge(key: string) {
    setSelectedKey(key);
    setReason('');
    setEventName('');
    setDivision('');
    setExpiryDate('');
    setFormError(null);
    setResult(null);
  }

  function submit() {
    if (!selectedKey || !def) return;
    if (reason.trim().length < 3) {
      setFormError('Reason must be at least 3 characters.');
      return;
    }
    if (def.titleBadge && !eventName.trim()) {
      setFormError('Event name is required for this badge.');
      return;
    }
    setFormError(null);
    start(async () => {
      const res = await adminTagBadge({
        playerId,
        badgeKey: selectedKey,
        reason: reason.trim(),
        event: def.titleBadge ? eventName.trim() : undefined,
        division: def.titleBadge && division.trim() ? division.trim() : undefined,
        expiresAt: def.timeBound && expiryDate ? new Date(expiryDate).toISOString() : undefined,
      });
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      setResult(res.message ?? `Tagged ${def.name}.`);
      setSelectedKey(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {Object.entries(BADGE_FAMILIES).map(([famKey, fam]) => {
        const famBadges = BADGES.filter((b) => b.family === famKey);
        if (famBadges.length === 0) return null;
        return (
          <div key={famKey}>
            <h3 className="text-foreground-muted mb-2 text-xs font-semibold tracking-wide uppercase">
              {fam.name}
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {famBadges.map((b) => {
                const already = heldKeys.has(b.key);
                const selected = selectedKey === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    disabled={already}
                    aria-pressed={selected}
                    onClick={() => selectBadge(b.key)}
                    className={`flex min-h-[76px] flex-col items-center gap-1 rounded-xl border p-2 text-center text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                      selected ? 'border-primary bg-primary/5' : 'border-border bg-background'
                    }`}
                  >
                    <BadgeSymbol badgeKey={b.key} size={36} />
                    <span className="text-foreground leading-tight">{b.name}</span>
                    {already && (
                      <span className="text-foreground-muted text-[10px] font-normal">Has it</span>
                    )}
                    {!already && b.normally === 'auto' && (
                      <span className="text-foreground-muted text-[10px] font-normal">
                        Usually automatic
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {def && (
        <div className="border-border bg-surface space-y-3 rounded-2xl border p-4">
          <div className="flex items-center gap-2">
            <BadgeSymbol badgeKey={def.key} size={28} />
            <p className="text-foreground text-sm font-semibold">{def.name}</p>
          </div>

          <Field label="Reason" htmlFor="tag-reason" required hint="Goes in the audit log.">
            <textarea
              id="tag-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="border-border bg-background w-full rounded-xl border px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            />
          </Field>

          {def.titleBadge && (
            <Field
              label="Event"
              htmlFor="tag-event"
              required
              hint="Covers a title won outside VouchPlay."
            >
              <Input
                id="tag-event"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. Mindanao Open 2025"
              />
            </Field>
          )}

          {def.titleBadge && (
            <Field label="Division" htmlFor="tag-division">
              <Input
                id="tag-division"
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          )}

          {def.timeBound && (
            <Field
              label="Expiry"
              htmlFor="tag-expiry"
              hint={expiryDate ? undefined : "Follows the badge's own rule."}
            >
              <Input
                id="tag-expiry"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </Field>
          )}

          {formError && <FormError>{formError}</FormError>}

          <button
            type="button"
            onClick={submit}
            disabled={pending || reason.trim().length < 3}
            className="vp-gradient min-h-[44px] w-full rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
          >
            {pending ? 'Tagging…' : `Tag ${def.name} to ${firstName}`}
          </button>
        </div>
      )}

      {result && <FormMessage>{result}</FormMessage>}
    </div>
  );
}
