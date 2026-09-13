'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { X } from 'lucide-react';
import {
  addCoOrganizer,
  removeCoOrganizer,
  searchEligibleOrganizers,
  setCoOrganizerVisibility,
  type TournamentActionState,
  type OrganizerSearchResult,
} from '@/lib/actions/tournament';
import type { OrganizerDTO } from '@/lib/tournaments/dto';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { Field, Input, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: TournamentActionState = {};

/** First letters of up to the first two words, for the avatar fallback disc. */
function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
const PERMS: { key: string; label: string }[] = [
  { key: 'edit', label: 'Edit tournament' },
  { key: 'manage_divisions', label: 'Manage divisions' },
  { key: 'send_announcements', label: 'Send announcements' },
  { key: 'approve_registrations', label: 'Approve registrations' },
  { key: 'manage_payments', label: 'Manage payments' },
  { key: 'export', label: 'Export' },
];

/** Owner-only co-organizer management (handover §17.4). */
export function CoOrganizerManager({
  tournamentId,
  slug,
  organizers,
}: {
  tournamentId: string;
  slug: string;
  organizers: OrganizerDTO[];
}) {
  const router = useRouter();
  const action = addCoOrganizer.bind(null, tournamentId, slug);
  const [state, formAction] = useActionState(action, empty);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<OrganizerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  // Selection-only (master_plan §2AP Decision H): the slug is never typed, only chosen from a
  // search result, so a name that resembles someone else's handle can no longer be posted as if it
  // were an exact match.
  const [chosen, setChosen] = useState<OrganizerSearchResult | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // §2AQ Decision A4: optimistic per-row "show on the public page" switch. This component is only
  // ever rendered on the owner's own Manage page (see `manage/page.tsx`'s `t.isOwner` gate), so every
  // row here already belongs to an owner - no extra prop needed to re-check that.
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(organizers.map((o) => [o.userId, o.showPublicly ?? false])),
  );
  const [visPending, setVisPending] = useState<Record<string, boolean>>({});
  const [visErrors, setVisErrors] = useState<Record<string, string>>({});

  async function toggleVisibility(userId: string, next: boolean) {
    setVisibility((v) => ({ ...v, [userId]: next }));
    setVisErrors((e) => ({ ...e, [userId]: '' }));
    setVisPending((p) => ({ ...p, [userId]: true }));
    const res = await setCoOrganizerVisibility(tournamentId, userId, next);
    setVisPending((p) => ({ ...p, [userId]: false }));
    if (res.error) {
      // Roll back - the switch reflects what actually saved, not what was clicked.
      setVisibility((v) => ({ ...v, [userId]: !next }));
      setVisErrors((e) => ({ ...e, [userId]: res.error as string }));
      return;
    }
    router.refresh();
  }

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (chosen || query.trim().length < 2) {
      setMatches([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      setMatches(await searchEligibleOrganizers(query));
      setSearching(false);
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, chosen]);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      setChosen(null);
      setQuery('');
    }
  }, [state.ok, router]);

  const coOrganizers = organizers.filter((o) => !o.isOwner);

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {organizers.map((o) => (
          <li key={o.userId} className="border-border space-y-1.5 rounded-xl border p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-foreground text-sm">
                {o.slug ? (
                  <Link href={`/players/${o.slug}`} className="hover:text-primary font-medium">
                    {o.name}
                  </Link>
                ) : (
                  <span className="font-medium">{o.name}</span>
                )}
                <span className="text-foreground-muted ml-1.5 text-xs">
                  {o.isOwner ? '· owner' : '· co-organizer'}
                </span>
              </span>
              {!o.isOwner && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await removeCoOrganizer(tournamentId, slug, o.userId);
                      setMsg(res.error ?? null);
                      if (res.ok) router.refresh();
                    })
                  }
                  className="text-danger border-border rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
            {/* §2AQ Decision A4: hidden from the public tournament page by default - opting a
                co-organizer in is the owner's explicit choice, never the other way around. */}
            {!o.isOwner && (
              <label className="text-foreground-muted flex min-h-10 cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={visibility[o.userId] ?? false}
                  disabled={!!visPending[o.userId]}
                  onChange={(e) => toggleVisibility(o.userId, e.target.checked)}
                  className="h-4 w-4"
                />
                Show on the public page
              </label>
            )}
            {visErrors[o.userId] && (
              <p className="text-danger text-[11px]">{visErrors[o.userId]}</p>
            )}
          </li>
        ))}
      </ul>
      {msg && <p className="text-danger text-xs">{msg}</p>}
      {coOrganizers.length === 0 && (
        <p className="text-foreground-muted text-xs">No co-organizers yet.</p>
      )}
      {coOrganizers.length > 0 && (
        <p className="text-foreground-muted text-xs">
          Hidden co-organizers still manage the tournament; only the names shown here appear
          publicly.
        </p>
      )}

      <form
        action={formAction}
        className="border-border space-y-3 rounded-xl border border-dashed p-3"
      >
        <p className="text-foreground text-sm font-semibold">Add a co-organizer</p>
        <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
        <FormError>{state.error}</FormError>
        <input type="hidden" name="targetSlug" value={chosen?.slug ?? ''} />
        <Field
          label="Find an organizer"
          htmlFor="organizer-search"
          hint="Only players with an approved Organizer role appear here."
        >
          {chosen ? (
            <span className="border-border bg-surface-muted inline-flex min-h-11 items-center gap-2 rounded-full border py-1 pr-2 pl-1">
              <PlayerAvatar
                url={chosen.avatarUrl ?? null}
                initials={initialsFromName(chosen.name)}
                name={chosen.name}
                size="sm"
              />
              <span className="text-foreground text-sm font-medium">
                {chosen.name} · @{chosen.slug}
              </span>
              <button
                type="button"
                onClick={() => setChosen(null)}
                aria-label="Clear selected organizer"
                className="text-foreground-muted hover:text-foreground ml-1 inline-flex min-h-8 min-w-8 items-center justify-center rounded-full"
              >
                <X size={14} aria-hidden />
              </button>
            </span>
          ) : (
            <Input
              id="organizer-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // Never submit the form from the search box - Enter only exists here to keep typing.
                if (event.key === 'Enter') event.preventDefault();
              }}
              placeholder="Search by name"
              autoComplete="off"
            />
          )}
        </Field>
        {!chosen && searching && <p className="text-foreground-muted text-xs">Searching...</p>}
        {!chosen && matches.length > 0 && (
          <ul className="border-border divide-border -mt-2 divide-y rounded-lg border">
            {matches.map((match) => (
              <li key={match.slug}>
                <button
                  type="button"
                  onClick={() => {
                    setChosen(match);
                    setMatches([]);
                  }}
                  className="hover:bg-surface-muted flex w-full items-center gap-2 p-2 text-left"
                >
                  <PlayerAvatar
                    url={match.avatarUrl ?? null}
                    initials={initialsFromName(match.name)}
                    name={match.name}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block truncate text-sm">{match.name}</span>
                    <span className="text-foreground-muted block truncate text-xs">
                      @{match.slug}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <fieldset className="space-y-1.5">
          <legend className="text-foreground-muted text-xs font-semibold tracking-wide uppercase">
            Permissions
          </legend>
          {PERMS.map((p) => (
            <label key={p.key} className="text-foreground flex items-center gap-2 text-sm">
              <input type="checkbox" name={`perm_${p.key}`} />
              {p.label}
            </label>
          ))}
        </fieldset>
        <SubmitButton pendingLabel="Adding…" disabled={!chosen}>
          Add co-organizer
        </SubmitButton>
      </form>
    </div>
  );
}
