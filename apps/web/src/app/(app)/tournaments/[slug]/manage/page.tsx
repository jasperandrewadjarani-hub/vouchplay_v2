import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getViewerContext } from '@/lib/auth';
import { getTournamentBySlug } from '@/lib/tournaments/queries';
import { getOrganizerRegistrations } from '@/lib/tournaments/registration-queries';
import { updateTournament } from '@/lib/actions/tournament';
import { TournamentForm } from '@/components/tournaments/tournament-form';
import { LifecycleControls } from '@/components/tournaments/lifecycle-controls';
import { DivisionBuilder } from '@/components/tournaments/division-builder';
import { AnnouncementForm } from '@/components/tournaments/announcement-form';
import { CoOrganizerManager } from '@/components/tournaments/co-organizer-manager';
import { OrganizerRegistrations } from '@/components/tournaments/organizer-registrations';

export const metadata: Metadata = { title: 'Manage tournament' };

interface Params {
  params: Promise<{ slug: string }>;
}

const toLocalInput = (iso: string | null) => (iso ? iso.slice(0, 16) : '');
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export default async function ManageTournamentPage({ params }: Params) {
  const { slug } = await params;
  const viewer = await getViewerContext();
  if (!viewer.viewerId)
    redirect(`/login?next=${encodeURIComponent(`/tournaments/${slug}/manage`)}`);

  const t = await getTournamentBySlug(slug, { viewerId: viewer.viewerId, isStaff: viewer.isStaff });
  if (!t) notFound();
  if (!t.canManage) redirect(`/tournaments/${slug}`);

  const registrations = await getOrganizerRegistrations(t.id);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link
          href={`/tournaments/${slug}`}
          className="text-foreground-muted hover:text-foreground text-sm"
        >
          ← {t.name}
        </Link>
        <h1 className="text-foreground mt-2 text-xl font-semibold tracking-tight">
          Manage tournament
        </h1>
      </div>

      <section className="border-border bg-surface rounded-2xl border p-5">
        <h2 className="text-foreground mb-3 text-base font-semibold">Status</h2>
        <LifecycleControls tournamentId={t.id} slug={slug} status={t.status} />
      </section>

      <section className="border-border bg-surface rounded-2xl border p-5">
        <h2 className="text-foreground mb-3 text-base font-semibold">Registrations</h2>
        <OrganizerRegistrations tournamentId={t.id} registrations={registrations} />
      </section>

      <section className="border-border bg-surface rounded-2xl border p-5">
        <h2 className="text-foreground mb-3 text-base font-semibold">Divisions</h2>
        <DivisionBuilder tournamentId={t.id} slug={slug} divisions={t.divisions} />
      </section>

      <section className="border-border bg-surface rounded-2xl border p-5">
        <h2 className="text-foreground mb-3 text-base font-semibold">Details</h2>
        <TournamentForm
          action={updateTournament.bind(null, t.id, slug)}
          submitLabel="Save details"
          refreshOnSuccess
          initial={{
            name: t.name,
            city: t.city ?? '',
            venueName: t.venueName ?? '',
            description: t.description ?? '',
            visibility: t.visibility,
            startAt: toDateInput(t.startAt),
            endAt: toDateInput(t.endAt),
            registrationOpenAt: toLocalInput(t.registrationOpenAt),
            registrationCloseAt: toLocalInput(t.registrationCloseAt),
            contact: t.contact ?? '',
            termsText: t.termsText ?? '',
            paymentInstructions: t.paymentInstructions ?? '',
            paymentMethods: t.paymentMethods ?? '',
          }}
        />
      </section>

      <section className="border-border bg-surface rounded-2xl border p-5">
        <h2 className="text-foreground mb-3 text-base font-semibold">Announcements</h2>
        <AnnouncementForm tournamentId={t.id} slug={slug} />
      </section>

      {t.isOwner && (
        <section className="border-border bg-surface rounded-2xl border p-5">
          <h2 className="text-foreground mb-3 text-base font-semibold">Co-organizers</h2>
          <CoOrganizerManager tournamentId={t.id} slug={slug} organizers={t.organizers} />
        </section>
      )}
    </div>
  );
}
