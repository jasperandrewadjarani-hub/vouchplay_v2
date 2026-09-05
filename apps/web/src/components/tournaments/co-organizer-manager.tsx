'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  addCoOrganizer,
  removeCoOrganizer,
  type TournamentActionState,
} from '@/lib/actions/tournament';
import type { OrganizerDTO } from '@/lib/tournaments/dto';
import { Field, Input, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: TournamentActionState = {};
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

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const coOrganizers = organizers.filter((o) => !o.isOwner);

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {organizers.map((o) => (
          <li
            key={o.userId}
            className="border-border flex items-center justify-between gap-2 rounded-xl border p-2.5"
          >
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
          </li>
        ))}
      </ul>
      {msg && <p className="text-danger text-xs">{msg}</p>}
      {coOrganizers.length === 0 && (
        <p className="text-foreground-muted text-xs">No co-organizers yet.</p>
      )}

      <form
        action={formAction}
        className="border-border space-y-3 rounded-xl border border-dashed p-3"
      >
        <p className="text-foreground text-sm font-semibold">Add a co-organizer</p>
        <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
        <FormError>{state.error}</FormError>
        <Field
          label="Their profile handle"
          htmlFor="targetSlug"
          hint="The slug from their profile URL (/players/…). Must be an approved organizer."
          required
        >
          <Input id="targetSlug" name="targetSlug" required placeholder="e.g. jt-df136b" />
        </Field>
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
        <SubmitButton pendingLabel="Adding…">Add co-organizer</SubmitButton>
      </form>
    </div>
  );
}
