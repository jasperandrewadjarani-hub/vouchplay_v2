import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getPartnerDeck } from '@/lib/partners/deck';
import { PartnerDeck } from '@/components/partners/partner-deck';

interface Params {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = { title: 'Find a partner' };

/**
 * The partner-matchmaking deck (master_plan §2AV E). Signed-in only - `requireUser` returns a guest
 * here through the normal `/login` gate, and `getPartnerDeck` itself decides whether THIS viewer may
 * use the feature at all (`enabled`).
 */
export default async function PartnersPage({ params }: Params) {
  const { slug } = await params;
  const user = await requireUser(`/tournaments/${slug}/partners`);
  const deck = await getPartnerDeck(slug, user.id);
  if (!deck) notFound();

  const backLink = (
    <Link
      href={`/tournaments/${slug}`}
      className="text-foreground-muted hover:text-foreground text-sm"
    >
      ← {deck.tournament.name}
    </Link>
  );

  if (!deck.enabled) {
    // §2AV addendum 3: distinguish "the organizer turned this off for this event" (offForTournament)
    // from the generic not-ready-yet message - the global setting is still on for everyone else.
    if (deck.offForTournament) {
      return (
        <div className="mx-auto max-w-lg space-y-5">
          {backLink}
          <div className="border-border bg-surface space-y-2 rounded-2xl border p-6 text-center">
            <p className="text-foreground text-base font-semibold">
              Partner matchmaking is off for this tournament
            </p>
            <p className="text-foreground-muted text-sm">
              The organizer has turned this off for this event.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-lg space-y-5">
        {backLink}
        <div className="border-border bg-surface space-y-2 rounded-2xl border p-6 text-center">
          <p className="text-foreground text-base font-semibold">
            Partner matchmaking isn&rsquo;t available for you yet
          </p>
          <p className="text-foreground-muted text-sm">
            If you registered without an account, verify your email and finish your profile first.
            Otherwise the organizers have switched matchmaking off for now.
          </p>
          <Link
            href="/me"
            className="text-primary inline-block text-sm font-medium hover:underline"
          >
            Go to your profile
          </Link>
        </div>
      </div>
    );
  }

  if (!deck.tournament.registrationOpen) {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        {backLink}
        <div className="border-border bg-surface space-y-2 rounded-2xl border p-6 text-center">
          <p className="text-foreground text-base font-semibold">
            Registration is closed - matchmaking is off for this tournament
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      {backLink}
      <header>
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">Find a partner</h1>
        <p className="text-foreground-muted mt-1 text-sm">
          {deck.lookingCount} player{deck.lookingCount === 1 ? '' : 's'} looking
        </p>
      </header>
      <PartnerDeck data={deck} />
    </div>
  );
}
