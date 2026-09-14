import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getViewerContext } from '@/lib/auth';
import { getTournamentBySlug } from '@/lib/tournaments/queries';
import {
  getOrganizerRegistrations,
  getOrganizerBareSlots,
  getClubOverrideParticipants,
  getUnverifiedAccounts,
} from '@/lib/tournaments/registration-queries';
import { isClosed, hasOpenSeat, hasUnconfirmedPartner } from '@/lib/tournaments/entry-view';
import { ClubOverrideControl } from '@/components/tournaments/club-override-control';
import { updateTournament } from '@/lib/actions/tournament';
import {
  getPendingReceiptNotificationCount,
  getConfirmationEmailBacklog,
} from '@/lib/actions/payment';
import { listUnpaidRecipients } from '@/lib/tournaments/reminders';
import { TournamentForm } from '@/components/tournaments/tournament-form';
import { PaymentNotificationTestButton } from '@/components/tournaments/payment-notification-test-button';
import { PaymentReceiptBackfillButton } from '@/components/tournaments/payment-receipt-backfill-button';
import { PaymentNudgeButton } from '@/components/tournaments/payment-nudge-button';
import { ConfirmationEmailBackfillButton } from '@/components/tournaments/confirmation-email-backfill-button';
import { emailChannelEnabled } from '@/lib/notifications/email';
import { isSlotReservationsEnabled } from '@/lib/settings';
import { LifecycleControls } from '@/components/tournaments/lifecycle-controls';
import { DivisionBuilder } from '@/components/tournaments/division-builder';
import { AnnouncementForm } from '@/components/tournaments/announcement-form';
import { CoOrganizerManager } from '@/components/tournaments/co-organizer-manager';
import { OrganizerRegistrations } from '@/components/tournaments/organizer-registrations';
import { PartnerSearchersPanel } from '@/components/tournaments/partner-searchers-panel';
import { listPartnerSearchers } from '@/lib/partners/deck';
import { ReservedSlotsPanel } from '@/components/tournaments/reserved-slots-panel';
import { UnverifiedAccountsPanel } from '@/components/tournaments/unverified-accounts-panel';
import { TournamentExport } from '@/components/tournaments/tournament-export';
import { TournamentOverview } from '@/components/tournaments/tournament-overview';
import { isoToPhInput, isoToPhDateInput } from '@vouchplay/core';
import { formatDateTime } from '@/lib/format-date';
import { computeOverview } from '@/lib/tournaments/overview';
import { ArchiveControls } from '@/components/tournaments/archive-controls';

export const metadata: Metadata = { title: 'Manage tournament' };
// §2AL: the receipt backfill can send up to a few dozen emails in one tap - give it real headroom
// above the platform's default route timeout.
export const maxDuration = 60;

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
  id,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  danger?: boolean;
  /** Lets another section deep-link here, e.g. the "Looking for partners" shortcut into
   *  Announcements (master_plan §2AV H) - the section opens closed either way, the id is just an
   *  anchor to scroll to. */
  id?: string;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className={`group scroll-mt-24 rounded-2xl border p-5 ${
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

  // §2AQ Decision C/D: the pay-nudge blast and the confirmation-email backfill both need the app's
  // email channel switched on (they email players directly, independent of the organizer's own
  // `paymentNotificationEmail` receipt-forwarding address) - compute once and reuse for both.
  const emailReady = emailChannelEnabled();

  const [
    registrations,
    clubOverrideParticipants,
    pendingReceiptCount,
    bareSlots,
    slotsEnabled,
    partnerSearchers,
    unverifiedAccounts,
  ] = await Promise.all([
    getOrganizerRegistrations(t.id),
    getClubOverrideParticipants(t.id),
    // §2AL: only meaningful once an organizer has saved a notification address - otherwise there
    // is nothing to backfill into, so skip the read entirely.
    t.paymentNotificationEmail ? getPendingReceiptNotificationCount(t.id) : Promise.resolve(0),
    // Reserved slots (master_plan §2AO A5/A6). Read defensively - `getOrganizerBareSlots` and its
    // `tournament_slots` table arrive with migration 0042, so a pre-migration deploy degrades to
    // "no reserved slots" instead of breaking Manage.
    getOrganizerBareSlots(t.id).catch(() => []),
    isSlotReservationsEnabled(),
    // master_plan §2AV H: "Looking for partners" - read defensively, `listPartnerSearchers` arrives
    // from a parallel lane.
    listPartnerSearchers(t.id).catch(() => ({ count: 0, players: [] })),
    // master_plan §2BE Decision E: guest accounts still unclaimed for this tournament - read
    // defensively so a pre-migration deploy degrades to "no unverified accounts" instead of
    // breaking Manage.
    getUnverifiedAccounts(t.id).catch(() => []),
  ]);

  // §2AQ Decision C/D: kept in a separate `Promise.all` from the block above - both reads depend on
  // lane-B contracts that do not exist yet, and mixing an eventually-`any` branch into the main
  // tuple above would collapse that whole destructure's inference to `any` in the meantime.
  const [unpaidRecipients, confirmationBacklog] = await Promise.all([
    // §2AQ Decision C: read defensively - `listUnpaidRecipients` lands from a parallel lane.
    emailReady
      ? listUnpaidRecipients(t.id).catch(
          () => [] as Awaited<ReturnType<typeof listUnpaidRecipients>>,
        )
      : Promise.resolve([] as Awaited<ReturnType<typeof listUnpaidRecipients>>),
    // §2AQ Decision D: same defensive read for the confirmation-email backlog count.
    emailReady ? getConfirmationEmailBacklog(t.id).catch(() => 0) : Promise.resolve(0),
  ]);
  const unpaidCount = unpaidRecipients.length;
  const overview = computeOverview(
    registrations.map((r) => ({
      divisionId: r.divisionId,
      status: r.status,
      eligibilityStatus: r.eligibilityStatus,
      paymentStatus: r.paymentStatus,
      amountDue: r.amountDue,
      currency: r.currency,
      hasOpenSeat: hasOpenSeat(r),
      partnerUnconfirmed: hasUnconfirmedPartner(r),
    })),
    t.divisions.map((d) => ({ id: d.id, name: d.name, capacityTeams: d.capacityTeams })),
  );
  const partnerLockLabel = t.partnerLockAt
    ? `${formatDateTime(t.partnerLockAt)}, PH time`
    : t.partnerLockEffectiveAt
      ? `${formatDateTime(t.partnerLockEffectiveAt)}, PH time`
      : null;

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
        <TournamentOverview overview={overview} partnerLockLabel={partnerLockLabel} />
      </ManageSection>

      <ManageSection title="Registrations">
        <div className="space-y-5">
          <ReservedSlotsPanel tournamentId={t.id} slots={bareSlots} enabled={slotsEnabled} />
          <UnverifiedAccountsPanel accounts={unverifiedAccounts} tournamentId={t.id} />
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
          <PartnerSearchersPanel
            count={partnerSearchers.count}
            players={partnerSearchers.players}
            slug={slug}
            enabled={t.partnerMatchmakingEnabled}
          />
        </div>
      </ManageSection>

      {/* Payment notifications (§2AK/§2AL) as its own visible section - the receipt-email actions were
          buried inside the Details form, where an organizer could not find them. Auto-opens when there
          are uploaded receipts still to email, so the backfill is the first thing the organizer sees. */}
      <ManageSection
        title="Payment notifications"
        defaultOpen={pendingReceiptCount > 0 || unpaidCount > 0 || confirmationBacklog > 0}
      >
        <div className="space-y-4">
          {t.paymentNotificationEmail ? (
            <div className="space-y-3">
              <p className="text-foreground-muted text-sm">
                Every uploaded payment receipt is emailed to{' '}
                <span className="text-foreground font-medium">{t.paymentNotificationEmail}</span>.
                Change the address in{' '}
                <span className="text-foreground font-medium">Details → Payment</span>.
              </p>
              <PaymentReceiptBackfillButton
                tournamentId={t.id}
                pendingCount={pendingReceiptCount}
                email={t.paymentNotificationEmail}
              />
              <PaymentNotificationTestButton tournamentId={t.id} />
            </div>
          ) : (
            <p className="text-foreground-muted text-sm">
              No receipt notifications yet. Add an email under{' '}
              <span className="text-foreground font-medium">Details → Payment</span> (&ldquo;Send
              receipt notifications to&rdquo;) to email every uploaded receipt to whoever checks the
              bank account.
            </p>
          )}
          {/* §2AQ Decision C/D: blast unpaid players a pay-now reminder, and backfill the
              settle-time confirmation email - both email players directly, so both need the app's
              email channel rather than the organizer's own receipt-forwarding address above. */}
          {emailReady && (
            <div className="border-border space-y-4 border-t pt-4">
              <PaymentNudgeButton tournamentId={t.id} unpaidCount={unpaidCount} />
              <ConfirmationEmailBackfillButton tournamentId={t.id} backlog={confirmationBacklog} />
            </div>
          )}
        </div>
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
          emailDeliveryReady={emailChannelEnabled()}
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
            paymentNotificationEmail: t.paymentNotificationEmail ?? '',
            coverUrl: t.coverUrl ?? '',
            paymentQrUrl: t.paymentQrUrl ?? '',
            clubLockAt: toLocalInput(t.clubLockAt),
            partnerLockAt: toLocalInput(t.partnerLockAt),
            partnerLockEffectiveLabel: t.partnerLockAt
              ? undefined
              : t.partnerLockEffectiveAt
                ? `${formatDateTime(t.partnerLockEffectiveAt)}, PH time`
                : undefined,
            enforceSkillFloor: t.enforceSkillFloor,
            requireSkillVerified: t.requireSkillVerified,
            requireOrganizerApproval: t.requireOrganizerApproval,
            allowPlayDownOneLevel: t.allowPlayDownOneLevel,
            confirmationEmailEnabled: t.confirmationEmailEnabled,
            partnerMatchmakingEnabled: t.partnerMatchmakingEnabled,
          }}
        />
      </ManageSection>

      <ManageSection title="Announcements" id="announcements">
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
