import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getViewerContext } from '@/lib/auth';
import { getTournamentBySlug } from '@/lib/tournaments/queries';
import {
  getOrganizerRegistrations,
  getClubOverrideParticipants,
} from '@/lib/tournaments/registration-queries';
import { isClosed } from '@/lib/tournaments/entry-view';
import { ClubOverrideControl } from '@/components/tournaments/club-override-control';
import { updateTournament } from '@/lib/actions/tournament';
import { TournamentForm } from '@/components/tournaments/tournament-form';
import { LifecycleControls } from '@/components/tournaments/lifecycle-controls';
import { DivisionBuilder } from '@/components/tournaments/division-builder';
import { AnnouncementForm } from '@/components/tournaments/announcement-form';
import { CoOrganizerManager } from '@/components/tournaments/co-organizer-manager';
import { OrganizerRegistrations } from '@/components/tournaments/organizer-registrations';
import { TournamentExport } from '@/components/tournaments/tournament-export';
import { TournamentOverview } from '@/components/tournaments/tournament-overview';
import { isoToPhInput, isoToPhDateInput } from '@vouchplay/core';
import { computeOverview } from '@/lib/tournaments/overview';
import { ArchiveControls } from '@/components/tournaments/archive-controls';

export const metadata: Metadata = { title: 'Manage tournament' };

interface Params {
  params: Promise<{ slug: string }>;
}

// Stored instants are UTC; organizers read and type Philippine time, so the form is populated in PH
// time (slicing the raw ISO string would have shown the UTC wall clock instead).
const toLocalInput = (iso: string | null) => isoToPhInput(iso);
const toDateInput = (iso: string | null) => isoToPhDateInput(iso);

/**
 * A collapsible Manage section (§2O). The screen is long, so every section is native disclosure with
 * a clear header and a chevron that turns on open. Status and Overview open by default - the
 * at-a-glance answer to "how is my event doing?" - everything else is collapsed so the page opens as
 * a short menu instead of a wall of forms.
 */
function ManageSection({
  title,
  defaultOpen = false,
  danger = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className={`group rounded-2xl border p-5 ${
        danger ? 'border-danger/30 bg-danger/5' : 'border-border bg-surface'
      }`}
    >
      <summary className="text-foreground flex cursor-pointer list-none items-center justify-between gap-2 text-base font-semibold">
        {title}
        <ChevronDown
          size={18}
          className="text-foreground-muted shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

export default async function ManageTournamentPage({ params }: Params) {
  const { slug } = await params;
  const viewer = await getViewerContext();
  if (!viewer.viewerId)
    redirect(`/login?next=${encodeURIComponent(`/tournaments/${slug}/manage`)}`);

  const t = await getTournamentBySlug(slug, { viewerId: viewer.viewerId, isStaff: viewer.isStaff });
  if (!t) notFound();
  if (!t.canManage) redirect(`/tournaments/${slug}`);

  const [registrations, clubOverrideParticipants] = await Promise.all([
    getOrganizerRegistrations(t.id),
    getClubOverrideParticipants(t.id),
  ]);
  const overview = computeOverview(
    registrations.map((r) => ({
      divisionId: r.divisionId,
      status: r.status,
      eligibilityStatus: r.eligibilityStatus,
      paymentStatus: r.paymentStatus,
      amountDue: r.amountDue,
      currency: r.currency,
    })),
    t.divisions.map((d) => ({ id: d.id, name: d.name, capacityTeams: d.capacityTeams })),
  );

  // Division capacity strip (master_plan §2AG/A5) - counted in memory over the registrations this
  // page already loaded via getOrganizerRegistrations, so no new query. "Live" reuses the same
  // isClosed() the filters use (withdrawn/cancelled/rejected/refunded), not a second definition of
  // it. "Paid" is deliberately narrow: an entry the organizer has already locked in (`confirmed`), or
  // one that submitted a receipt and is waiting on verification (`payment_submitted` + hasProof).
  // Everything else live counts as "pending".
  const divisionCounts = new Map<string, { registered: number; paid: number; pending: number }>();
  for (const r of registrations) {
    if (isClosed(r)) continue;
    const bucket = divisionCounts.get(r.divisionId) ?? { registered: 0, paid: 0, pending: 0 };
    bucket.registered += 1;
    const paid = r.status === 'confirmed' || (r.status === 'payment_submitted' && r.hasProof);
    if (paid) bucket.paid += 1;
    else bucket.pending += 1;
    divisionCounts.set(r.divisionId, bucket);
  }
  const divisionCapacity = t.divisions.map((d) => ({
    id: d.id,
    name: d.name,
    capacity: d.capacityTeams,
    ...(divisionCounts.get(d.id) ?? { registered: 0, paid: 0, pending: 0 }),
  }));

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

      <ManageSection title="Status" defaultOpen>
        <LifecycleControls tournamentId={t.id} slug={slug} status={t.status} />
      </ManageSection>

      <ManageSection title="Overview" defaultOpen>
        <TournamentOverview overview={overview} />
      </ManageSection>

      <ManageSection title="Registrations">
        <OrganizerRegistrations
          tournamentId={t.id}
          registrations={registrations}
          eligibilityDivisions={t.divisions.map((d) => ({
            id: d.id,
            name: d.name,
            format: d.format,
            teamSize: d.teamSize,
          }))}
          divisions={divisionCapacity}
        />
      </ManageSection>

      <ManageSection title="Export">
        <TournamentExport slug={slug} />
      </ManageSection>

      <ManageSection title="Divisions">
        <DivisionBuilder tournamentId={t.id} slug={slug} divisions={t.divisions} />
      </ManageSection>

      <ManageSection title="Details">
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
            earlyBirdStartsAt: toLocalInput(t.earlyBirdStartsAt),
            earlyBirdEndsAt: toLocalInput(t.earlyBirdEndsAt),
            contact: t.contact ?? '',
            termsText: t.termsText ?? '',
            paymentInstructions: t.paymentInstructions ?? '',
            paymentMethods: t.paymentMethods ?? '',
            coverUrl: t.coverUrl ?? '',
            paymentQrUrl: t.paymentQrUrl ?? '',
            clubLockAt: toLocalInput(t.clubLockAt),
            enforceSkillFloor: t.enforceSkillFloor,
            requireSkillVerified: t.requireSkillVerified,
            requireOrganizerApproval: t.requireOrganizerApproval,
          }}
        />
      </ManageSection>

      <ManageSection title="Announcements">
        <AnnouncementForm tournamentId={t.id} slug={slug} />
      </ManageSection>

      <ManageSection title="Club representation override">
        <ClubOverrideControl
          tournamentId={t.id}
          participants={clubOverrideParticipants}
          maxClubs={t.maxClubsPerPlayer}
        />
      </ManageSection>

      {t.isOwner && (
        <ManageSection title="Co-organizers">
          <CoOrganizerManager tournamentId={t.id} slug={slug} organizers={t.organizers} />
        </ManageSection>
      )}

      {t.isOwner && (
        <ManageSection title="Archive tournament" danger>
          <ArchiveControls tournamentId={t.id} slug={slug} name={t.name} status={t.status} />
        </ManageSection>
      )}
    </div>
  );
}
